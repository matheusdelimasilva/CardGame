import type { ChatMessage, ClientMessage, RoomView, ServerMessage } from "@cardgame/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { KEYS, storage } from "./storage";

/** Only this many recent chat lines are kept in memory. */
export const MAX_CHAT_HISTORY = 50;

export type Connection = "connecting" | "open" | "reconnecting" | "gone" | "kicked";

/** Keeps a live connection to one table and reconnects when it drops. */
export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    setChats([]); // a different room never inherits the previous room's chat
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let everJoined = false;

    const connect = () => {
      if (stopped) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws?room=${encodeURIComponent(code)}`);
      socket.current = ws;
      ws.onopen = () => {
        const hello: ClientMessage = {
          type: "hello",
          memberToken: storage.get(KEYS.member(code)) ?? undefined,
          sessionToken: storage.get(KEYS.session) ?? undefined,
        };
        ws.send(JSON.stringify(hello));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === "welcome") {
          storage.set(KEYS.member(code), msg.memberToken);
          everJoined = true;
          attempts = 0;
          setConnection("open");
        } else if (msg.type === "state") {
          setRoom(msg.room);
        } else if (msg.type === "chat") {
          setChats((prev) => [...prev, msg.message].slice(-MAX_CHAT_HISTORY));
        } else if (msg.type === "kicked") {
          stopped = true;
          setChats([]);
          storage.set(KEYS.member(code), null);
          setConnection("kicked");
        } else if (msg.type === "error") {
          if (everJoined) setError(msg.message);
          else {
            stopped = true;
            setConnection("gone");
          }
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setConnection(everJoined ? "reconnecting" : "connecting");
        retry = setTimeout(connect, Math.min(5000, 400 * 2 ** attempts++));
      };
    };
    connect();

    // Phones suspend sockets when the screen locks: reconnect at once on return.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      if (socket.current && socket.current.readyState > WebSocket.OPEN) {
        clearTimeout(retry);
        attempts = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      socket.current?.close();
      setChats([]);
    };
  }, [code]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  const send = useCallback((msg: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
    else setError("Not connected. Trying again...");
  }, []);

  return { room, connection, error, send, chats };
}
