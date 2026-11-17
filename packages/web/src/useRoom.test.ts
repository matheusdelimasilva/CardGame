import type { ChatMessage, ServerMessage } from "@cardgame/protocol";
import { createElement, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CHAT_HISTORY, useRoom } from "./useRoom";

vi.mock("./storage", () => ({
  storage: { get: vi.fn(() => null), set: vi.fn() },
  KEYS: { session: "s", member: (code: string) => `m:${code}` },
}));

/** Just enough of a WebSocket for useRoom: the test plays the server. */
class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket | undefined;
  readyState = FakeSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  receive(msg: ServerMessage) {
    act(() => this.onmessage?.({ data: JSON.stringify(msg) }));
  }
}

let renderer: ReactTestRenderer | undefined;
let room: ReturnType<typeof useRoom> | undefined;

function Probe({ code }: { code: string }) {
  const value = useRoom(code);
  useEffect(() => {
    room = value;
  });
  return null;
}

const mount = () => {
  act(() => {
    renderer = create(createElement(Probe, { code: "ABC123" }));
  });
  const socket = FakeSocket.last!;
  act(() => socket.onopen?.());
  socket.receive({ type: "welcome", memberToken: "t" });
  return socket;
};

const message = (id: string, text: string): ChatMessage => ({
  id,
  from: { id: "p1", name: "Mika" },
  text,
  at: 1,
});

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "localhost:5175" });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  room = undefined;
  FakeSocket.last = undefined;
  vi.unstubAllGlobals();
});

describe("useRoom chat", () => {
  it("keeps messages, table lines and private notices in the order they arrive", () => {
    const socket = mount();
    socket.receive({ type: "chat", message: message("1", "Queen?") });
    socket.receive({
      type: "notice",
      text: "Close, but not quite. Your message wasn't sent.",
    });
    const credit: ChatMessage = {
      id: "2",
      kind: "system",
      from: { id: "", name: "" },
      text: "Mika guessed the song correctly.",
      at: 2,
    };
    socket.receive({ type: "chat", message: credit });
    socket.receive({ type: "notice", text: "You already got the song." });
    expect(room!.chats).toEqual([
      message("1", "Queen?"),
      {
        id: expect.any(String),
        kind: "notice",
        text: "Close, but not quite. Your message wasn't sent.",
        at: expect.any(Number),
      },
      credit,
      {
        id: expect.any(String),
        kind: "notice",
        text: "You already got the song.",
        at: expect.any(Number),
      },
    ]);
    const [first, , , second] = room!.chats;
    expect(first!.id).not.toBe(second!.id);
    // A notice is not an error: nothing else changes.
    expect(room!.error).toBeNull();
  });

  it("caps the history, notices included", () => {
    const socket = mount();
    for (let i = 0; i < MAX_CHAT_HISTORY; i++)
      socket.receive({ type: "chat", message: message(String(i), `${i}`) });
    socket.receive({ type: "notice", text: "Close, but not quite." });
    expect(room!.chats).toHaveLength(MAX_CHAT_HISTORY);
    expect(room!.chats[0]!.id).toBe("1");
    expect(room!.chats.at(-1)).toMatchObject({ kind: "notice" });
  });

  it("forgets everything, notices too, when removed from the table", () => {
    const socket = mount();
    socket.receive({ type: "notice", text: "Close, but not quite." });
    socket.receive({ type: "kicked" });
    expect(room!.chats).toEqual([]);
    expect(room!.connection).toBe("kicked");
  });
});
