import { useId, type CSSProperties } from "react";
import { PaperDialog, useModalDialog } from "../ui/PaperDialog";
import "./overlays.css";
import type { RankRow, TablePlayer } from "./types";

/**
 * How a round works, on a tilted note. "intro" holds the table while the
 * game starts and counts down; it cannot be dismissed. "help" is the same
 * note opened from the header, with a close button.
 */
export function RoundNote({
  mode,
  goal,
  secondsLeft = null,
  betting = false,
  chatGuessing = false,
  onClose,
}: {
  mode: "intro" | "help";
  goal: number;
  /** The intro's countdown; ignored in help. */
  secondsLeft?: number | null;
  /** Step 4: betting tokens on other players' turns. */
  betting?: boolean;
  /** Step 5: guessing the song and artist in the chat. */
  chatGuessing?: boolean;
  /** Required in help mode. */
  onClose?: () => void;
}) {
  const intro = mode === "intro";
  const modal = useModalDialog(intro ? null : (onClose ?? null));
  const titleId = useId();
  return (
    <dialog
      className="tl-dialog gs-note-dialog"
      aria-labelledby={titleId}
      // With nothing focusable inside, the intro note takes focus itself.
      tabIndex={-1}
      {...modal}
    >
      <div className="tl-paper gs-note">
        {!intro && (
          <button
            className="tl-close"
            aria-label="Close"
            onClick={onClose}
            autoFocus
          >
            ×
          </button>
        )}
        <div className="gs-note-text">
          <h2 id={titleId}>{intro ? "Get ready" : "How a round works"}</h2>
          <ol className="tl-instructions">
            <li>
              <b>Listen</b> to the mystery song.
            </li>
            <li>
              <b>Drag</b> its card into your timeline where the year fits.
            </li>
            <li>
              <b>Right spot,</b> you keep it. First to {goal} wins.
            </li>
            {betting && (
              <li>
                <b>Bet a token</b> on an opponent&apos;s turn: tap the gap where
                the song really goes. If they miss and you&apos;re first to be
                right, you steal the card.
              </li>
            )}
            {chatGuessing && (
              <li>
                <b>Guess in the chat.</b> Type the song and the artist at any
                time. Get both and you earn a token.
              </li>
            )}
          </ol>
        </div>
        {intro && (
          <div
            className="gs-note-countdown"
            role="timer"
            aria-label={
              secondsLeft === null ? undefined : `Starts in ${secondsLeft}`
            }
          >
            <div className="gs-note-starts" aria-hidden="true">
              STARTS IN
            </div>
            {/* A new key each second replays the tick. */}
            <div key={secondsLeft} className="gs-note-count" aria-hidden="true">
              {secondsLeft}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

const CONFETTI_COLOURS = [
  "#ffd84a",
  "#ef4a3c",
  "#3b8cf0",
  "#fffaf0",
  "#ff6fae",
  "#45c486",
];

/** The design's confetti: 36 pieces spread across the width, each on its own loop. */
function Confetti() {
  return (
    <div className="gs-confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${(i * 37) % 100}%`,
              "--h": i % 3 ? 1.1 : 1.8,
              borderRadius: i % 4 === 0 ? "50%" : "2px",
              background: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
              animationDuration: `${2.2 + (i % 5) * 0.35}s`,
              animationDelay: `${-(i % 9) * 0.4}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * The end of the game: everyone's score, best first, with the viewer's
 * row in gold. Only the host can start the next game.
 */
export function FinalScores({
  headline,
  sub,
  rows,
  goal,
  isHost,
  celebrate = false,
  onPlayAgain,
  onBackToLobby,
}: {
  headline: string;
  sub: string;
  rows: readonly RankRow[];
  goal: number;
  isHost: boolean;
  /** Confetti, for when the viewer won. */
  celebrate?: boolean;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}) {
  const modal = useModalDialog(null);
  const titleId = useId();
  const hintId = useId();
  return (
    <dialog
      className="tl-dialog gs-scores-dialog"
      aria-labelledby={titleId}
      {...modal}
    >
      <div
        className={`gs-scores${rows.length > 4 ? " gs-scores-many" : ""}`}
        style={{ "--goal": goal } as CSSProperties}
      >
        <div className="gs-scores-label">FINAL SCORES</div>
        <h2 id={titleId}>{headline}</h2>
        <p className="gs-scores-sub">{sub}</p>
        <ol className="gs-scores-list">
          {rows.map((row) => (
            <li
              key={row.player.id}
              className={`gs-score-row${row.isMe ? " gs-score-me" : ""}`}
            >
              <span className="gs-score-rank">{row.rank}</span>
              <span
                className="gs-score-chip"
                // The viewer's chip is gold, like their row: cream keeps it visible.
                style={{ background: row.isMe ? "#fffaf0" : row.player.chip }}
                aria-hidden="true"
              >
                {row.player.animal}
              </span>
              <span className="gs-score-name">
                {row.player.name}
                {row.isMe && " (you)"}
              </span>
              <span className="gs-score-pips" aria-hidden="true">
                {Array.from({ length: goal }, (_, i) => (
                  <span
                    key={i}
                    className={i < row.count ? "gs-pip-on" : undefined}
                  />
                ))}
              </span>
              <span className="gs-score-count">
                {row.count}/{goal}
              </span>
            </li>
          ))}
        </ol>
        <div className="gs-scores-actions">
          <button
            className="tl-button tl-gold"
            disabled={!isHost}
            aria-describedby={isHost ? undefined : hintId}
            onClick={onPlayAgain}
            autoFocus={isHost}
          >
            Play again
          </button>
          <button
            className="tl-button"
            onClick={onBackToLobby}
            autoFocus={!isHost}
          >
            Back to lobby
          </button>
        </div>
        {!isHost && (
          <p id={hintId} className="gs-scores-hint">
            The host starts the next game.
          </p>
        )}
      </div>
      {celebrate && <Confetti />}
    </dialog>
  );
}

/**
 * The host's options for one player. Skipping a turn is only for a player
 * who is away on their turn; removing someone who is playing ends the game.
 */
export function PlayerMenu({
  player,
  running,
  playing,
  theirTurn,
  onSkip,
  onRemove,
  onEndGame,
  onClose,
}: {
  player: TablePlayer;
  /** A game is in progress (not over). */
  running: boolean;
  /** The player is in that game. */
  playing: boolean;
  theirTurn: boolean;
  onSkip: () => void;
  onRemove: () => void;
  onEndGame: () => void;
  onClose: () => void;
}) {
  // Each action closes the menu, as the old one did.
  const then = (action: () => void) => () => {
    action();
    onClose();
  };
  return (
    <PaperDialog title={player.name} onClose={onClose}>
      <div className="gs-menu-actions">
        {running && theirTurn && !player.connected && (
          <button className="tl-button tl-gold" onClick={then(onSkip)}>
            Play their turn for them
          </button>
        )}
        {!player.isMe && (
          <button className="tl-button tl-danger" onClick={then(onRemove)}>
            {running && playing
              ? "Remove and end this game"
              : "Remove from table"}
          </button>
        )}
        {running && (
          <button className="tl-button tl-danger" onClick={then(onEndGame)}>
            End the game for everyone
          </button>
        )}
      </div>
    </PaperDialog>
  );
}

/** Shown while the socket is down; the room reconnects on its own. */
export function ConnectionBanner() {
  return (
    <div className="gs-banner gs-connection" role="status">
      Connection lost. Reconnecting…
    </div>
  );
}

/**
 * Shown when the browser blocked sound until the viewer interacts. A tap
 * anywhere starts it; the button is for keyboards, which a tap listener misses.
 */
export function SoundPrompt({ onTurnOn }: { onTurnOn: () => void }) {
  return (
    <button className="gs-banner gs-sound-prompt" onClick={onTurnOn}>
      Tap anywhere to turn on sound
    </button>
  );
}
