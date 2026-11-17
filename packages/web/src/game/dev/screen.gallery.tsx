/**
 * The whole game screen on the selected scenario, with working local
 * interactions: drag or key the card, "Lock it in" (answered by the next
 * scenario after a moment), betting on an opponent's turn (answered by the
 * bet or pass showing), the sound switch, the host's player menu, chat
 * (your line is echoed back). Moves are logged to the console instead of
 * sent anywhere. Just after it opens, the chat gets the table lines and the
 * private note that guessing as in the scenario would have produced.
 */
import type { ClientMessage, RoomView } from "@cardgame/protocol";
import { useEffect, useState } from "react";
import type { AudioStatus, TrackAudio } from "../../audio";
import type { ChatEntry } from "../../useRoom";
import { GameScreen } from "../GameScreen";
import type { HitsterView } from "../types";
import { scenarios } from "./fixtures";
import type { GalleryContext, GallerySection } from "./types";

/** Sound that only pretends: tapping the record toggles between playing and paused. */
function useFakeAudio(): TrackAudio {
  const [status, setStatus] = useState<AudioStatus>("playing");
  const [muted, setMuted] = useState(false);
  return {
    status: muted ? "idle" : status,
    muted,
    toggle: () => setStatus((s) => (s === "playing" ? "paused" : "playing")),
    setMuted,
  };
}

const system = (id: string, text: string): ChatEntry => ({
  id,
  kind: "system",
  from: { id: "", name: "" },
  text,
  at: 0,
});

/** A line of chat, then what guessing as in the scenario would have said. */
function chatFor(room: RoomView): ChatEntry[] {
  const view = room.game!.view as HitsterView;
  const name = (id: string) =>
    room.seats.find((s) => s?.id === id)?.name ?? "Someone";
  const lines: ChatEntry[] = [
    {
      id: "m1",
      from: { id: "p1", name: "Mika" },
      text: "is this Queen??",
      at: 0,
    },
  ];
  if (!view.guessing) return lines;
  const me = room.you.id;
  for (const [id, got] of Object.entries(view.guesses)) {
    if (id === me) continue;
    if (got.artist)
      lines.push(
        system(`a-${id}`, `${name(id)} guessed the artist correctly.`),
      );
  }
  const mine = view.yourGuess;
  if (!mine) return lines;
  lines.push({
    id: "n1",
    kind: "notice",
    text: "Close, but not quite. Your message wasn't sent.",
    at: 0,
  });
  if (mine.title)
    lines.push(system("t-me", `${name(me)} guessed the song correctly.`));
  if (mine.artist)
    lines.push(
      system("a-me", `${name(me)} guessed the artist correctly.`),
      system("both-me", `${name(me)} got both and earns a token.`),
    );
  return lines;
}

/** The viewer's bet (a gap) or pass (null) as the server would show it. */
function withMyBet(room: RoomView, index: number | null): RoomView {
  const game = room.game!;
  const view = game.view as HitsterView;
  const me = room.you.id;
  return {
    ...room,
    game: {
      ...game,
      active: game.active.filter((id) => id !== me),
      view: {
        ...view,
        tokens:
          index === null
            ? view.tokens
            : { ...view.tokens, [me]: (view.tokens[me] ?? 1) - 1 },
        bets:
          index === null ? view.bets : [...view.bets, { player: me, index }],
        declined: index === null ? [...view.declined, me] : view.declined,
        canBet: view.canBet.filter((id) => id !== me),
      } satisfies HitsterView,
    },
  };
}

function ScreenPreview({ room: initial, options }: GalleryContext) {
  const [room, setRoom] = useState<RoomView>(initial);
  const [shown, setShown] = useState(initial);
  // A new scenario from the toolbar replaces whatever the preview moved on to.
  if (shown !== initial) {
    setShown(initial);
    setRoom(initial);
  }
  const [said, setSaid] = useState<ChatEntry[]>([]);
  // As in a game, the lines arrive once the screen is open, so the guessing hint comes first.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArrived(true), 300);
    return () => clearTimeout(id);
  }, []);
  const audio = useFakeAudio();
  const send = (message: ClientMessage) => {
    console.info("send", message);
    if (message.type === "chat")
      setSaid((lines) => [
        ...lines,
        {
          id: `said-${lines.length}`,
          from: { id: room.you.id, name: room.you.name },
          text: message.text,
          at: Date.now(),
        },
      ]);
    if (message.type !== "move") return;
    const move = message.move as { type: string; index?: number };
    if (move.type === "bet" || move.type === "declineBet") {
      setTimeout(() => setRoom((r) => withMyBet(r, move.index ?? null)), 300);
      return;
    }
    // Locking in is answered with a reveal, right or wrong at random.
    if (move.type === "place")
      setTimeout(
        () =>
          setRoom(
            Math.random() < 0.5
              ? scenarios.myRevealCorrect(options)
              : scenarios.myRevealWrong(options),
          ),
        700,
      );
  };
  return (
    <GameScreen
      room={room}
      connection="open"
      error={null}
      chats={[...(arrived ? chatFor(initial) : []), ...said]}
      send={send}
      audio={audio}
      onLeave={() => console.info("leave")}
      onBackToLobby={() => console.info("back to lobby")}
    />
  );
}

const section: GallerySection = {
  title: "Game screen",
  fullscreen: true,
  render: (context) => <ScreenPreview {...context} />,
};
export default section;
