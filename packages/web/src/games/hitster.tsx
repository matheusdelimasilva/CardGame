// Types only: the song list (with its years) must never be bundled into the client.
import type { HitsterView, HitsterMove, SongCardView } from "@cardgame/games";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { TrackAudio } from "../audio";
import type { GameProps, GameUI, TypedGameView } from "./types";

const viewOf = (game: TypedGameView<HitsterView>) => game.view;

// Card colours and layout follow docs/design/song-cards.html (the Vinyl design and its deck back).
const DECADES: [number, string][] = [
  [1950, "#ef4a3c"],
  [1960, "#ff8a3d"],
  [1970, "#ffd84a"],
  [1980, "#ff6fae"],
  [1990, "#3b8cf0"],
  [2000, "#45c486"],
  [2010, "#9b7bff"],
  [2020, "#33cccc"],
];
function decadeColor(year: number): string {
  let color = DECADES[0]![1];
  for (const [decade, c] of DECADES) if (year >= decade) color = c;
  return color;
}

/** "A featuring B" -> main artist plus a smaller "feat. B" line. */
function Artist({ name }: { name: string }) {
  const m = /\s+(?:featuring|feat\.?|ft\.?)\s+/i.exec(name);
  if (!m) return <>{name}</>;
  return (
    <>
      {name.slice(0, m.index)}
      <span className="feat">feat. {name.slice(m.index + m[0].length)}</span>
    </>
  );
}

/** Shrinks the text in every .fit box of a card until it fits, so long titles get smaller instead of clipping. */
function useFitText(deps: unknown[]) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const fit = () =>
      ref.current?.querySelectorAll<HTMLElement>(".fit").forEach((el) => {
        el.style.fontSize = "";
        const base = parseFloat(getComputedStyle(el).fontSize);
        let size = base;
        while (
          (el.scrollHeight > el.clientHeight + 1 ||
            el.scrollWidth > el.clientWidth + 1) &&
          size > base * 0.45
        ) {
          size *= 0.93;
          el.style.fontSize = `${size}px`;
        }
      });
    fit();
    // Text is measured again once the web fonts load and when the window is resized.
    void document.fonts?.ready.then(fit);
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** A face-up song card: the Vinyl design, coloured by decade. */
function SongCard({ song, fresh }: { song: SongCardView; fresh?: boolean }) {
  const ref = useFitText([song.title, song.artist]);
  // Bring a card you have just won into view in a long timeline.
  useEffect(() => {
    if (fresh)
      ref.current?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
  }, [fresh, ref]);
  return (
    <span
      ref={ref}
      className={`sc md v-vinyl${fresh ? " fresh" : ""}`}
      style={{ "--acc": decadeColor(song.year) } as CSSProperties}
      role="img"
      aria-label={`${song.title}, ${song.artist}, ${song.year}`}
    >
      <span className="vn-rec">
        <span className="vn-disc">
          <span className="vn-print" />
        </span>
        <span className="vn-lbl">{song.year}</span>
      </span>
      <span className="vn-plate">
        <span className="fit vn-title">{song.title}</span>
        <span className="fit vn-artist">
          <Artist name={song.artist} />
        </span>
      </span>
    </span>
  );
}

/**
 * A face-down song card. The label is always gold so its colour cannot give
 * the decade away. `playing` spins the record and shows the equalizer bars;
 * it is for when the song is actually audible.
 */
function SongBack({
  playing,
  onTap,
  tapLabel,
}: {
  playing?: boolean;
  onTap?: () => void;
  tapLabel?: string;
}) {
  const card = (
    <span
      className={`sc back-size v-vinyl v-back${playing ? " playing" : ""}`}
      role="img"
      aria-label="Face-down song card"
    >
      <span className="vn-rec">
        <span className="vn-disc">
          <span className="vn-print" />
        </span>
        <span className="vn-lbl">
          <span className="vn-hole" />
        </span>
      </span>
      <span className="vn-plate">
        <span className="vn-mystery">???</span>
        <span className="vn-eq">
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
    </span>
  );
  return onTap ? (
    <button className="song-back-button" onClick={onTap} aria-label={tapLabel}>
      {card}
    </button>
  ) : (
    card
  );
}

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

/** Words for a position in a timeline: "before 1984", "between 1984 and 1991", "after 1991". */
function describeSpot(line: SongCardView[], index: number): string {
  if (line.length === 0) return "here";
  if (index === 0) return `before ${line[0]!.year}`;
  if (index === line.length) return `after ${line.at(-1)!.year}`;
  return `between ${line[index - 1]!.year} and ${line[index]!.year}`;
}

function Dock({
  game,
  you,
  nameOf,
  move,
}: GameProps<HitsterView, HitsterMove>) {
  const view = viewOf(game);
  const [choice, setChoice] = useState<{
    turn: number;
    index: number | null;
  } | null>(null);
  const selected = choice?.turn === view.turnNumber ? choice.index : null;
  const setSelected = (index: number | null) =>
    setChoice({ turn: view.turnNumber, index });
  if (!you) return null;

  const line = view.timelines[you] ?? [];
  const myTurn = !view.revealing && view.currentPlayer === you;
  const justWon =
    view.lastTurn?.player === you && view.lastTurn.outcome === "correct"
      ? view.lastTurn.song
      : null;

  const spot = (index: number) =>
    myTurn && (
      <button
        key={`spot-${index}`}
        className={`spot${selected === index ? " chosen" : ""}`}
        onClick={() => setSelected(selected === index ? null : index)}
        aria-pressed={selected === index}
        aria-label={`Place the song ${describeSpot(line, index)}`}
      >
        {selected === index ? "♪" : "+"}
      </button>
    );

  return (
    <div className="hitster-dock">
      {!view.revealing && (
        <div className="hitster-bar">
          <p className="actions-status">
            {myTurn
              ? selected === null
                ? "Tap a + to choose where this song goes."
                : `Placing it ${describeSpot(line, selected)}.`
              : view.currentPlayer
                ? `${nameOf(view.currentPlayer)} is placing a song.`
                : ""}
          </p>
          <button
            className="btn gold"
            disabled={!myTurn || selected === null}
            onClick={() =>
              selected !== null && move({ type: "place", index: selected })
            }
          >
            Place
          </button>
        </div>
      )}
      <div
        className="timeline"
        role="list"
        aria-label="Your timeline, oldest first"
      >
        {line.map((song, i) => (
          <span className="timeline-item" role="listitem" key={song.id}>
            {spot(i)}
            <SongCard
              song={song}
              fresh={
                justWon !== null &&
                justWon.title === song.title &&
                justWon.artist === song.artist
              }
            />
          </span>
        ))}
        {spot(line.length)}
      </div>
    </div>
  );
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

  Dock,

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
