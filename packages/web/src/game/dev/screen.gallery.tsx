/**
 * The whole game screen on the selected scenario, with working local
 * interactions: drag or key the card, "Lock it in" (answered by the next
 * scenario after a moment), the sound switch, the host's player menu.
 * Moves are logged to the console instead of sent anywhere.
 */
import type { ClientMessage, RoomView } from "@cardgame/protocol";
import { useState } from "react";
import type { AudioStatus, TrackAudio } from "../../audio";
import { GameScreen } from "../GameScreen";
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
    // Locking in is answered with a reveal, right or wrong at random.
    if (message.type === "move")
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
