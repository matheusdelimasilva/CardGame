import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, SEAT_COUNT, type ChatMessage, type RoomView, type SeatView } from "@cardgame/protocol";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { navigate } from "./App";
import { gameUIs } from "./games";
import { describeSettings } from "./NewTable";
import { Avatar, OpenSeat, Seat } from "./Seat";
import { KEYS, storage } from "./storage";
import { useRoom } from "./useRoom";

export function Room({ code }: { code: string }) {
  const { room, connection, error, send, chats } = useRoom(code);
  const [chatOpen, setChatOpen] = useState(false);
  const [seenChatId, setSeenChatId] = useState<string | null>(null);
  const lastChatId = chats.at(-1)?.id ?? null;
  useEffect(() => {
    if (chatOpen) setSeenChatId(lastChatId);
  }, [chatOpen, lastChatId]);
  const unread = !chatOpen && lastChatId !== null && lastChatId !== seenChatId;
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Hooks must run on every render, so this sits above the early returns below.
  const secondsLeft = useSecondsLeft(room?.game && !room.game.result ? room.game.timer : null);

  if (connection === "gone") {
    return <Notice title="Table not found" text="This table has closed or the link is wrong." />;
  }
  if (connection === "kicked") {
    return <Notice title="Removed" text="The host removed you from this table." />;
  }
  if (!room) return <Notice title="Joining table..." text={code} quiet />;

  const { you, game } = room;
  const running = game !== null && game.result === null;
  const ui = game ? gameUIs[game.gameId] : undefined;
  const members = new Map<string, SeatView>();
  room.seats.forEach((s) => s && members.set(s.id, s));
  const nameOf = (id: string) => members.get(id)?.name ?? "someone";
  const playing = running && game.players.includes(you.id);
  const gameProps = game && {
    game,
    you: game.players.includes(you.id) ? you.id : null,
    nameOf,
    move: (move: unknown) => send({ type: "move", move }),
  };

  // Seats are drawn clockwise starting from the viewer, who sits at the bottom.
  const first = you.seat ?? 0;
  const around = Array.from({ length: SEAT_COUNT }, (_, i) => (first + i) % SEAT_COUNT)
    .filter((seat) => seat !== you.seat)
    .filter((seat) => room.seats[seat] !== null || !running || you.seat === null);
  const menuPlayer = menuFor ? (members.get(menuFor) ?? null) : null;
  const waitingOn = running ? game.active.map(nameOf) : [];

  return (
    <div className="room">
      <header className="topbar">
        <button className="topbar-home" onClick={() => navigate("/")} aria-label="Leave table">
          ‹
        </button>
        <span className="topbar-code">table {room.code}</span>
        <button className="topbar-chat" onClick={() => setChatOpen((o) => !o)} aria-expanded={chatOpen} aria-label={unread ? "Chat (new messages)" : "Chat"}>
          💬{unread && <span className="chat-unread" />}
        </button>
        <ShareButton code={room.code} />
      </header>

      {connection === "reconnecting" && <div className="reconnecting">Connection lost. Reconnecting...</div>}

      <div className="felt">
        <div className="oval" />
        <div className="center">
          {running && ui && gameProps ? (
            <ui.Center {...gameProps} />
          ) : (
            <Lobby room={room} send={send} nameOf={nameOf} />
          )}
        </div>

        {around.map((seat, i) => {
          const player = room.seats[seat];
          const slots = you.seat === null ? around.length : around.length + 1;
          const angle = ((90 + (360 * (you.seat === null ? i : i + 1)) / slots) * Math.PI) / 180;
          const style = { left: `${50 + 41 * Math.cos(angle)}%`, top: `${50 + 38 * Math.sin(angle)}%` };
          return (
            <div className="seat-spot" style={style} key={seat}>
              {player ? (
                <Seat
                  seat={seat}
                  player={player}
                  active={running && game.active.includes(player.id)}
                  clock={running && game.active.includes(player.id) ? secondsLeft : null}
                  tag={game && ui && player.inGame ? ui.seatTag(game, player.id) : running ? "next game" : null}
                  cards={running && ui && gameProps && player.inGame ? <ui.SeatCards {...gameProps} playerId={player.id} /> : null}
                  onClick={you.isHost ? () => setMenuFor(player.id) : undefined}
                />
              ) : (
                <OpenSeat onSit={you.name ? () => send({ type: "sit", seat }) : undefined} />
              )}
            </div>
          );
        })}

        {running && ui && <Announcement key={game.gameId} info={ui.announcement(game, nameOf)} />}
      </div>

      <footer className="dock">
        <div className="dock-me">
          {running && (
            <div className={`turn-plate${playing && game.active.includes(you.id) ? " mine" : ""}`}>
              {playing && game.active.includes(you.id) ? "Your turn" : `waiting for ${waitingOn.join(", ")}...`}
              {secondsLeft !== null && <span className={`plate-clock${secondsLeft <= 5 ? " low" : ""}`}>{secondsLeft}s</span>}
            </div>
          )}
          {you.seat !== null ? (
            <div className={`me-panel${running && game.active.includes(you.id) ? " active" : ""}`}>
              <Avatar seat={you.seat} size="lg" />
              <div className="me-text">
                <span className="nametag me">{you.name}</span>
                <span className="me-sub">
                  {game && ui && game.players.includes(you.id)
                    ? ui.seatTag(game, you.id)
                    : running
                      ? "you join the next game"
                      : "seated"}
                </span>
              </div>
              {!playing && (
                <button className="btn small" onClick={() => send({ type: "stand" })}>
                  Stand up
                </button>
              )}
            </div>
          ) : (
            you.name && (
              <div className="me-panel watching">
                <div className="me-text">
                  <span className="nametag me">{you.name}</span>
                  <span className="me-sub">
                    {room.seats.every((s) => s !== null)
                      ? "watching, the table is full"
                      : running
                        ? "watching. Tap an open seat to join the next game."
                        : "tap an open seat to play"}
                  </span>
                </div>
              </div>
            )
          )}
        </div>
        {playing && ui && gameProps && (
          <>
            <div className="dock-hand">
              <ui.Hand {...gameProps} />
            </div>
            <div className="dock-actions">
              <ui.Actions {...gameProps} />
            </div>
          </>
        )}
      </footer>

      {!you.name && <NamePrompt onSubmit={(name) => send({ type: "setName", name })} />}

      {menuPlayer && (
        <div className="overlay" onClick={() => setMenuFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="name">{menuPlayer.name}</h2>
            {running && game.active.includes(menuPlayer.id) && !menuPlayer.connected && (
              <button
                className="btn blue"
                onClick={() => {
                  send({ type: "skip", playerId: menuPlayer.id });
                  setMenuFor(null);
                }}
              >
                Play their turn for them
              </button>
            )}
            {menuPlayer.id !== you.id && (
              <button
                className="btn red"
                onClick={() => {
                  send({ type: "kick", playerId: menuPlayer.id });
                  setMenuFor(null);
                }}
              >
                {running && menuPlayer.inGame ? "Remove and end this game" : "Remove from table"}
              </button>
            )}
            {running && (
              <button
                className="btn red"
                onClick={() => {
                  send({ type: "endGame" });
                  setMenuFor(null);
                }}
              >
                End the game for everyone
              </button>
            )}
            <button className="btn" onClick={() => setMenuFor(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {chatOpen && (
        <Chat chats={chats} youId={you.id} canSend={connection === "open" && !!you.name} named={!!you.name} send={send} />
      )}

      {room.spectators.length > 0 && (
        <div className="spectators">
          👁 {room.spectators.map((s) => s.name).join(", ")}
        </div>
      )}
      {error && (
        <div className="toast" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function Lobby({ room, send, nameOf }: { room: RoomView; send: ReturnType<typeof useRoom>["send"]; nameOf: (id: string) => string }) {
  const info = room.gameInfo;
  const seated = room.seats.filter((s) => s !== null).length;
  const winners = room.game?.result?.winners.map(nameOf) ?? null;
  const missing = info.minPlayers - seated;

  return (
    <div className="lobby">
      {winners ? (
        <>
          <div className="lobby-label">game over</div>
          <div className="lobby-winner">★ {winners.join(" & ")} ★</div>
          <div className="lobby-label">{winners.length > 1 ? "win" : "wins"} {info.name}</div>
        </>
      ) : (
        <>
          <div className="lobby-label">now playing</div>
          <div className="lobby-game">{info.name}</div>
          <div className="lobby-label">
            {seated} seated · {info.minPlayers} to {info.maxPlayers} players
          </div>
          {info.settings.length > 0 && (
            <ul className="lobby-settings">
              {describeSettings(info, room.settings).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {room.you.isHost ? (
        <>
          <button className="btn gold big" disabled={missing > 0} onClick={() => send({ type: "start" })}>
            {winners ? "Play again" : "Start game"}
          </button>
          {missing > 0 && (
            <div className="lobby-hint">
              {seated === 0 ? "Take a seat, then share the link." : `Needs ${missing} more player${missing > 1 ? "s" : ""}.`}
            </div>
          )}
        </>
      ) : (
        <div className="lobby-hint">Waiting for the host to start...</div>
      )}
    </div>
  );
}

/** Counts down a turn timer locally between server updates. null when the turn is not timed. */
function useSecondsLeft(timer: { remainingMs: number } | null): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!timer) return setLeft(null);
    const end = performance.now() + timer.remainingMs;
    const tick = () => setLeft(Math.max(0, Math.ceil((end - performance.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timer]);
  return left;
}

function Announcement({ info }: { info: { key: string; title: string; detail: string } | null }) {
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const key = info?.key ?? null;
  useEffect(() => {
    if (!key) return;
    const t = setTimeout(() => setHiddenKey(key), 3200);
    return () => clearTimeout(t);
  }, [key]);
  if (!info || hiddenKey === info.key) return null;
  return (
    <div className="banner" key={info.key} role="status" onClick={() => setHiddenKey(info.key)}>
      <div className="banner-title">{info.title}</div>
      <div className="banner-detail">{info.detail}</div>
    </div>
  );
}

function ShareButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${location.origin}/t/${code}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Join my card table", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt("Copy this link and send it to your friends:", url);
    }
  };
  return (
    <button className="btn small gold" onClick={share}>
      {copied ? "Link copied!" : "Invite"}
    </button>
  );
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState(storage.get(KEYS.name) ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    storage.set(KEYS.name, clean);
    onSubmit(clean);
  };
  return (
    <div className="overlay">
      <form className="modal" onSubmit={submit}>
        <h2>What's your name?</h2>
        <p className="muted">This is how the others see you at the table.</p>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Nickname"
          aria-label="Nickname"
          autoFocus
        />
        <button className="btn gold big" disabled={!name.trim()}>
          Join table
        </button>
      </form>
    </div>
  );
}

function Notice({ title, text, quiet }: { title: string; text: string; quiet?: boolean }) {
  return (
    <main className="home">
      <section className="panel notice">
        <h2>{title}</h2>
        <p className="muted">{text}</p>
        {!quiet && (
          <button className="btn gold" onClick={() => navigate("/")}>
            Back to start
          </button>
        )}
      </section>
    </main>
  );
}

/** Plain-text chat. Messages are rendered as React text children, never as HTML. */
function Chat({
  chats,
  youId,
  canSend,
  named,
  send,
}: {
  chats: ChatMessage[];
  youId: string;
  canSend: boolean;
  named: boolean;
  send: ReturnType<typeof useRoom>["send"];
}) {
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [chats]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!canSend || !trimmed) return;
    send({ type: "chat", text: trimmed });
    setText("");
  };
  return (
    <div className="chat" role="region" aria-label="Table chat">
      <div className="chat-log" ref={log} aria-live="polite">
        {chats.length === 0 && <div className="chat-empty">No messages yet.</div>}
        {chats.map((m) => (
          <div key={m.id} className={m.from.id === youId ? "chat-line mine" : "chat-line"}>
            <b>{m.from.name}</b> <span>{m.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHAT_LENGTH}
          disabled={!canSend}
          placeholder={!named ? "Choose a name to chat" : canSend ? "Say something..." : "Reconnecting..."}
          aria-label="Chat message"
          autoComplete="off"
        />
        <button className="btn" disabled={!canSend || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
