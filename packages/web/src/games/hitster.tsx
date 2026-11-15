// Types only: the song list (with its years) must never be bundled into the client.
import type { HitsterView, HitsterMove } from "@cardgame/games";
import { Artist, SongBack, SongCard } from "./hitster-cards";
import { HitsterDock } from "./hitster-dock";
import type { TrackAudio } from "../audio";
import type { GameUI, TypedGameView } from "./types";

const viewOf = (game: TypedGameView<HitsterView>) => game.view;

/** What the listener is told about the sound, and what tapping the record will do. */
function soundHint(audio: TrackAudio): string {
  if (audio.muted) return "sound is off";
  switch (audio.status) {
    case "playing":
      return "tap the record to pause";
    case "loading":
      return "loading the song...";
    case "paused":
      return "tap the record to keep listening";
    case "ended":
      return "tap the record to hear it again";
    case "blocked":
      return "tap the record to hear it";
    case "error":
      return "this song could not be played";
    default:
      return "";
  }
}

export const hitsterUI: GameUI<HitsterView, HitsterMove> = {
  Center({ game, you, nameOf, audio }) {
    const view = viewOf(game);
    const player = view.currentPlayer;
    if (view.revealing && view.lastTurn) {
      return (
        <div className="center-game">
          <SongCard
            song={{ id: `reveal-${view.turnNumber}`, ...view.lastTurn.song }}
          />
        </div>
      );
    }
    if (!view.current || !player) return null;
    const theirLine = player !== you ? (view.timelines[player] ?? []) : null;
    return (
      <div className="center-game">
        <div className="now-playing">
          <SongBack
            playing={audio.status === "playing"}
            onTap={audio.muted ? undefined : audio.toggle}
            tapLabel={
              audio.status === "playing" ? "Pause the song" : "Play the song"
            }
          />
          <div className="now-text">
            <span className="now-label">
              ♪ {player === you ? "your song" : `${nameOf(player)}'s song`}
            </span>
            {view.current.title ? (
              <>
                <span className="now-title">{view.current.title}</span>
                <span className="now-artist">
                  <Artist name={view.current.artist ?? ""} />
                </span>
              </>
            ) : (
              <span className="now-title">
                {audio.status === "error" ? "No sound" : "Listen..."}
              </span>
            )}
            <span className="now-hint">{soundHint(audio)}</span>
          </div>
        </div>
        {theirLine && (
          <div
            className="year-chips"
            aria-label={`${nameOf(player)}'s timeline`}
          >
            {theirLine.map((song) => (
              <span className="year-chip" key={song.id}>
                {song.year}
              </span>
            ))}
          </div>
        )}
        <div className="center-note">
          deck {view.deckCount} · first to {view.cardsToWin}
        </div>
      </div>
    );
  },

  SeatCards({ game, playerId }) {
    const count = viewOf(game).timelines[playerId]?.length ?? 0;
    return (
      <span className="song-stack" aria-label={`${count} cards`}>
        {count}
      </span>
    );
  },

  seatTag(game, playerId) {
    const view = viewOf(game);
    return `♪ ${view.timelines[playerId]?.length ?? 0}/${view.cardsToWin}`;
  },

  Dock: HitsterDock,

  announcement(game, nameOf) {
    const view = viewOf(game);
    const last = view.lastTurn;
    if (!view.revealing || !last) return null;
    const who = nameOf(last.player);
    return {
      key: `turn-${last.turnNumber}`,
      title:
        last.outcome === "correct"
          ? `${who} got it!`
          : last.outcome === "wrong"
            ? `${who} missed`
            : `${who} was skipped`,
      detail: `${last.song.title} · ${last.song.artist} · ${last.song.year}`,
      next: view.nextPlayer
        ? `Next: ${nameOf(view.nextPlayer)}`
        : `${who} wins!`,
    };
  },
};
