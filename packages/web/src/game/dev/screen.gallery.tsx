/**
 * The whole game screen on the selected scenario, with working local
 * interactions: drag or key the card, "Lock it in" (answered by the next
 * scenario after a moment), betting on an opponent's turn (answered by the
 * bet or pass showing), the sound switch, the host's player menu. Moves are
 * logged to the console instead of sent anywhere.
 */
import type { ClientMessage, RoomView } from "@cardgame/protocol";
import { useState } from "react";
import type { AudioStatus, TrackAudio } from "../../audio";
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
  const audio = useFakeAudio();
  const send = (message: ClientMessage) => {
    console.info("send", message);
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
      chats={[
        {
          id: "1",
          from: { id: "p1", name: "Mika" },
          text: "is this Queen??",
          at: 0,
        },
      ]}
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
