import type {
  HitsterMove,
  HitsterView,
  SongCardView,
  TurnSummary,
} from "@cardgame/games";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { GameProps } from "./types";
import { SongBack, SongCard } from "./hitster-cards";
import { describeSpot, shiftPlacement } from "./hitster-placement";
import { useSongPlacement } from "./useSongPlacement";

function TimelineCards({
  line,
  index,
  gapRef,
  slot,
  freshId,
}: {
  line: SongCardView[];
  index: number | null;
  gapRef?: RefObject<HTMLDivElement>;
  slot?: ReactNode;
  freshId?: string;
}) {
  const gap = (i: number) => (
    <div
      className={`placement-gap${index === i ? " is-open" : ""}`}
      aria-hidden={index === i ? undefined : true}
    >
      <div className="gap-target" ref={index === i ? gapRef : undefined}>
        {index === i ? slot : null}
      </div>
    </div>
  );
  return (
    <>
      {line.map((song, i) => (
        <Fragment key={song.id}>
          {gap(i)}
          <span className="timeline-item" role="listitem" data-timeline-card>
            <SongCard song={song} fresh={song.id === freshId} />
          </span>
        </Fragment>
      ))}
      {gap(line.length)}
    </>
  );
}

export function Placement({
  line,
  move,
}: {
  line: SongCardView[];
  move: (move: HitsterMove) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const card = useRef<HTMLButtonElement>(null);
  const home = useRef<HTMLDivElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const gap = useRef<HTMLDivElement>(null);
  const active = dragging ? preview : selected;
  useSongPlacement(
    { card, home, timeline, gap },
    selected,
    setSelected,
    setPreview,
    setDragging,
  );
  const confirm = () => {
    if (selected !== null) move({ type: "place", index: selected });
  };
  return (
    <>
      <div className="hitster-bar">
        <p className="hint" aria-live="polite">
          {active === null
            ? "Drag the mystery song into your timeline, or use Left and Right, then Enter."
            : `Placing it ${describeSpot(line, active)}.`}
        </p>
        <button
          className="btn gold"
          disabled={selected === null || dragging}
          onClick={confirm}
        >
          Place
        </button>
      </div>
      <div className="placement-row">
        <div className="mystery-home" ref={home} aria-hidden="true" />
        <div
          className="timeline placement-timeline"
          ref={timeline}
          role="list"
          aria-label="Your timeline, oldest first"
        >
          <TimelineCards line={line} index={active} gapRef={gap} />
        </div>
      </div>
      <button
        ref={card}
        type="button"
        className="mystery-card"
        aria-label={`Mystery song${selected === null ? "" : `, ${describeSpot(line, selected)}`}. Drag to place, or use Left and Right to choose a spot and Enter to place. Escape returns it.`}
        aria-keyshortcuts="ArrowLeft ArrowRight Enter Escape"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setSelected(
              shiftPlacement(
                selected,
                event.key === "ArrowLeft" ? -1 : 1,
                line.length,
              ),
            );
            requestAnimationFrame(() =>
              gap.current?.scrollIntoView({
                block: "nearest",
                inline: "nearest",
                behavior: "auto",
              }),
            );
          } else if (event.key === "Enter") {
            event.preventDefault();
            confirm();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setSelected(null);
          }
        }}
      >
        <SongBack timeline />
      </button>
    </>
  );
}

function RevealedCard({ turn }: { turn: TurnSummary }) {
  return (
    <span
      className={`revealed-placement ${turn.outcome}`}
      role="listitem"
      aria-label={`${turn.outcome === "correct" ? "Correct" : "Wrong"} placement: ${turn.song.title}, ${turn.song.year}`}
    >
      <span className="reveal-flip">
        <span className="reveal-back" aria-hidden="true">
          <SongBack timeline />
        </span>
        <span className="reveal-front">
          <SongCard
            song={{ id: `revealed-${turn.turnNumber}`, ...turn.song }}
          />
        </span>
      </span>
    </span>
  );
}

export function HitsterDock({
  game,
  you,
  nameOf,
  move,
}: GameProps<HitsterView, HitsterMove>) {
  const view = game.view;
  const last = view.lastTurn;
  const reveal =
    view.revealing &&
    last?.player === you &&
    last.outcome !== "passed" &&
    last.index !== undefined
      ? last
      : null;
  const revealKey = reveal ? `${reveal.player}:${reveal.turnNumber}` : null;
  const wrongRevealKey = reveal?.outcome === "wrong" ? revealKey : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!wrongRevealKey) return;
    const timer = setTimeout(() => setDismissed(wrongRevealKey), 1900);
    return () => clearTimeout(timer);
  }, [wrongRevealKey]);
  if (!you) return null;
  const line = view.timelines[you];
  if (!line) return null;
  const myTurn = !view.revealing && view.currentPlayer === you;
  const justWon =
    last?.outcome === "correct" &&
    last.player === you &&
    last.index !== undefined
      ? line[last.index]?.id
      : undefined;
  const base =
    reveal?.outcome === "correct"
      ? line.filter((_, i) => i !== reveal.index)
      : line;
  const index =
    reveal && revealKey !== dismissed ? (reveal.index ?? null) : null;
  return (
    <div className="hitster-dock">
      <div className="section-label your-timeline">
        Your timeline{" "}
        <span>
          {line.length} / {view.cardsToWin}
        </span>
      </div>
      {myTurn ? (
        <Placement key={view.turnNumber} line={line} move={move} />
      ) : (
        <>
          {!view.revealing && (
            <div className="hitster-bar">
              <p className="hint">
                {view.currentPlayer
                  ? `${nameOf(view.currentPlayer)} is placing a song.`
                  : ""}
              </p>
            </div>
          )}
          {reveal && (
            <div className="hitster-bar">
              <p className="hint">
                {reveal.outcome === "correct"
                  ? "You found its place!"
                  : "Not quite — this one's going to the discard pile."}
              </p>
            </div>
          )}
          <div className="placement-row">
            {reveal && (
              <div className="mystery-home reveal-home" aria-hidden="true" />
            )}
            <div
              className="timeline placement-timeline"
              role="list"
              aria-label="Your timeline, oldest first"
            >
              <TimelineCards
                line={base}
                index={index}
                slot={reveal ? <RevealedCard turn={reveal} /> : null}
                freshId={reveal ? undefined : justWon}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
