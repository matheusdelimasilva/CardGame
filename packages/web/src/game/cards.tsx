/**
 * The game screen's cards and table furniture, from
 * docs/design/game-screen.dc.html. Everything here is presentational and
 * sizes itself in stage units; the parent places it with a transform.
 */
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { decadeColor } from "./layout";
import type { SongCardView, TablePlayer } from "./types";
import "./cards.css";

/** What a face-up card shows. */
export type SongFace = Pick<SongCardView, "title" | "artist" | "year">;

const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

// ------------------------------------------------------------- text helpers

const FEAT = /\s+(?:featuring|feat\.?|ft\.?)\s+/i;

/** "A featuring B" → { main: "A", feat: "B" }; feat is null for a solo artist. */
export function splitArtist(name: string): {
  main: string;
  feat: string | null;
} {
  const m = FEAT.exec(name);
  if (!m) return { main: name, feat: null };
  return {
    main: name.slice(0, m.index),
    feat: name.slice(m.index + m[0].length),
  };
}

/** The main artist, with any featured artist on a smaller line of its own. */
export function Artist({ name }: { name: string }) {
  const { main, feat } = splitArtist(name);
  return (
    <>
      {main}
      {feat !== null && <span className="gs-feat">feat. {feat}</span>}
    </>
  );
}

/** Shrink the title down to this share of its design size before touching the artist. */
const TITLE_FLOOR = 0.5;
const ARTIST_FLOOR = 0.7;
const STEP = 0.92;

function overflows(el: HTMLElement): boolean {
  return (
    el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
  );
}

/** Steps `el`'s font size down from its stylesheet size while `tooBig` holds, to no less than `floor` of it. */
function shrink(el: HTMLElement, floor: number, tooBig: () => boolean): void {
  const base = parseFloat(getComputedStyle(el).fontSize);
  let size = base;
  while (tooBig() && size > base * floor) {
    size *= STEP;
    el.style.fontSize = `${size}px`;
  }
}

/**
 * Real titles run far longer than the design's, so the plate's title (and,
 * if that is not enough, the artist) shrinks until the plate holds both.
 * Measured again whenever the plate changes size (--u follows the window)
 * and once the web fonts have loaded.
 */
function useFitPlate(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const plate = ref.current;
    if (!plate) return;
    const title = plate.querySelector<HTMLElement>(".gs-fit-title");
    const artist = plate.querySelector<HTMLElement>(".gs-fit-artist");
    const fit = () => {
      if (title) title.style.fontSize = "";
      if (artist) artist.style.fontSize = "";
      const tooBig = () =>
        overflows(plate) || (title !== null && overflows(title));
      if (title) {
        title.style.overflowWrap = "";
        shrink(title, TITLE_FLOOR, tooBig);
        // A single word too long for the plate even at the floor is broken instead.
        if (overflows(title)) title.style.overflowWrap = "anywhere";
      }
      if (artist) shrink(artist, ARTIST_FLOOR, tooBig);
    };
    fit();
    void document.fonts?.ready.then(fit);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(plate);
    return () => observer.disconnect();
  }, [key]);
  return ref;
}

/** Line height of `el` in pixels, for counting its lines. */
function lineHeight(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const size = parseFloat(style.fontSize);
  const value = parseFloat(style.lineHeight);
  if (Number.isNaN(value)) return size * 1.2;
  return style.lineHeight.endsWith("px") ? value : value * size;
}

/**
 * Shrinks an element's text from its stylesheet size, down to `floor` of
 * it, until it takes at most `lines` lines and no word spills out sideways;
 * past the floor the stylesheet's own overflow (an ellipsis, say) takes
 * over. Measured again when `key` changes, when the stage changes size
 * (--u follows the window) and once the web fonts have loaded.
 */
export function useFitText<T extends HTMLElement>(
  key: string,
  lines: number,
  floor: number,
) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Half a line of slack: tall glyphs (Caveat's, say) reach past a tight line height.
    const fit = () => {
      el.style.fontSize = "";
      shrink(
        el,
        floor,
        () =>
          // Strictly: an ellipsis shows for any overflow at all.
          el.scrollWidth > el.clientWidth ||
          el.scrollHeight > lineHeight(el) * (lines + 0.5),
      );
    };
    fit();
    const fonts = document.fonts;
    void fonts?.ready.then(fit);
    fonts?.addEventListener("loadingdone", fit);
    // The stage's size follows --u; the element's own would change as it shrinks.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(el.closest(".gs-stage") ?? document.documentElement);
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener("loadingdone", fit);
    };
  }, [key, lines, floor]);
  return ref;
}

/** Names shrink to this share of their design size before they are cut short. */
const NAME_FLOOR = 0.55;

// -------------------------------------------------------------- the records

/** The groove sheen that sits over every record. */
function Sheen() {
  return <span className="gs-sheen" />;
}

/** A face-up record: decade-coloured label with the year printed on it. */
function FaceRecord({ year, spinning }: { year: number; spinning: boolean }) {
  return (
    <span className="gs-record">
      <span className={cx("gs-disc", spinning && "is-spinning")}>
        <span className="gs-print" />
      </span>
      <Sheen />
      <span className="gs-label-text">{year}</span>
    </span>
  );
}

// ------------------------------------------------------------------ SongCard

export interface SongCardProps {
  song: SongFace;
  /** Spin the record, as the design does for a hovered hand card. */
  spinning?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A face-up vinyl song card, 8.4u × 11.8u, its label coloured by decade. */
export function SongCard({ song, spinning, className, style }: SongCardProps) {
  const plate = useFitPlate(`${song.title}\n${song.artist}`);
  return (
    <div
      className={cx("gs-card gs-song", className)}
      style={
        { "--gs-label": decadeColor(song.year), ...style } as CSSProperties
      }
      role="img"
      aria-label={`${song.title}, ${song.artist}, ${song.year}`}
    >
      <FaceRecord year={song.year} spinning={!!spinning} />
      <div ref={plate} className="gs-plate">
        <span className="gs-title gs-fit-title">{song.title}</span>
        <span className="gs-artist gs-fit-artist">
          <Artist name={song.artist} />
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ SongBack

export interface SongBackProps {
  /** The song is audible: the record spins and the equalizer bars bounce. */
  playing?: boolean;
  /** Shown instead of "???" when the table shows title and artist. */
  title?: string | null;
  artist?: string | null;
  className?: string;
  style?: CSSProperties;
}

/** Four bouncing bars under the plate's text while the song plays. */
function Equalizer() {
  return (
    <span className="gs-eq" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * The face-down mystery card. Its label is always gold so the colour cannot
 * give the decade away.
 */
export function SongBack({
  playing,
  title,
  artist,
  className,
  style,
}: SongBackProps) {
  const known = !!title || !!artist;
  const plate = useFitPlate(`${title ?? ""}\n${artist ?? ""}`);
  return (
    <div
      className={cx("gs-card gs-back", playing && "is-playing", className)}
      style={style}
      role="img"
      aria-label={
        known
          ? `Mystery song: ${[title, artist].filter(Boolean).join(", ")}`
          : "Mystery song card"
      }
    >
      <span className="gs-record">
        <span className="gs-disc">
          <span className="gs-print" />
        </span>
        <Sheen />
        <span className="gs-hole" />
      </span>
      <div ref={plate} className={cx("gs-plate", known && "is-known")}>
        {known ? (
          <>
            {title && <span className="gs-title gs-fit-title">{title}</span>}
            {artist && (
              <span className="gs-artist gs-fit-artist">
                <Artist name={artist} />
              </span>
            )}
          </>
        ) : (
          <span className="gs-qmarks">???</span>
        )}
        {playing && <Equalizer />}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- MysteryCard

// `title` is the song's here, not the HTML tooltip attribute.
export interface MysteryCardProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> {
  /** The face to flip to. Without it the card stays face down. */
  song?: SongFace | null;
  revealed?: boolean;
  playing?: boolean;
  /** The face-down plate shows these instead of "???". */
  title?: string | null;
  artist?: string | null;
  /** The card can be picked up: it wiggles and spins its record on hover. */
  interactive?: boolean;
  /** Held under the pointer: lifted off the table with a soft shadow. */
  dragging?: boolean;
  /** Placed correctly: a gold ring around the card. */
  correct?: boolean;
}

/**
 * The current song's card: face down, flipping over to its face when
 * revealed. Ref and any other props (pointer and key handlers, role, label)
 * go to the root, which the parent places and drives.
 */
export const MysteryCard = forwardRef<HTMLDivElement, MysteryCardProps>(
  function MysteryCard(
    {
      song,
      revealed,
      playing,
      title,
      artist,
      interactive,
      dragging,
      correct,
      className,
      ...rest
    },
    ref,
  ) {
    // The face is only rendered once revealed, so the year is never in the DOM early.
    const face = revealed ? song : null;
    const flipped = !!face;
    return (
      <div
        ref={ref}
        className={cx(
          "gs-mystery",
          interactive && "is-interactive",
          dragging && "is-dragging",
          correct && "is-correct",
          flipped && "is-revealed",
          className,
        )}
        {...rest}
      >
        <div className="gs-mystery-hover">
          <div className="gs-mystery-flip">
            <div className="gs-mystery-side" aria-hidden={flipped}>
              <SongBack playing={playing} title={title} artist={artist} />
            </div>
            <div
              className="gs-mystery-side gs-mystery-front"
              aria-hidden={!flipped}
            >
              {face && <SongCard song={face} />}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

// ------------------------------------------------------------------ MiniCard

export interface MiniCardProps extends HTMLAttributes<HTMLDivElement> {
  /** null: the dark face-down "?" card. */
  year: number | null;
  /** Gold ring, for a card that landed in the right place. */
  glow?: boolean;
  /** Enlarges the card in place (the design zooms a hovered one). */
  zoom?: number;
}

/** A small year card, 2.3u × 3.2u, as in the opponents' timelines. */
export function MiniCard({
  year,
  glow,
  zoom = 1,
  className,
  ...rest
}: MiniCardProps) {
  return (
    <div
      className={cx("gs-mini", className)}
      role="img"
      aria-label={year === null ? "Face-down card" : String(year)}
      {...rest}
    >
      <div
        className={cx(
          "gs-mini-face",
          year === null && "is-unknown",
          glow && "is-glowing",
        )}
        style={
          {
            ...(year !== null && { "--gs-label": decadeColor(year) }),
            ...(zoom !== 1 && { transform: `scale(${zoom})` }),
          } as CSSProperties
        }
      >
        {year ?? "?"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- Deck

const DECK_SIZE = 6;

export interface DeckProps {
  /** Riffle the stack, as during the intro. */
  shuffling?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The draw pile: six checker-backed cards stacked a little apart, 8.4u × 11.8u. */
export function Deck({ shuffling, className, style }: DeckProps) {
  return (
    <div
      className={cx("gs-deck", shuffling && "is-shuffling", className)}
      style={style}
      aria-hidden="true"
    >
      {Array.from({ length: DECK_SIZE }, (_, i) => (
        <span
          key={i}
          className="gs-deck-card"
          style={{ "--gs-deck-i": i } as CSSProperties}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------- Pips

export interface PipsProps {
  count: number;
  goal: number;
  /** Fill and border colour; ink by default. */
  color?: string;
  className?: string;
}

/** One small bar per card needed to win, filled for each card held. */
export function Pips({ count, goal, color, className }: PipsProps) {
  const total = Math.max(0, Math.round(goal));
  return (
    <span
      className={cx("gs-pips", className)}
      style={color ? ({ "--gs-pip": color } as CSSProperties) : undefined}
      role="img"
      aria-label={`${count} of ${goal} cards`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx("gs-pip", i < count && "is-filled")} />
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ SeatCard

export interface SeatCardProps {
  player: TablePlayer;
  /** Cards in their timeline and the cards needed to win, shown as "2/5". */
  count: number;
  goal: number;
  /** Their turn: gold ring and a little larger. */
  active?: boolean;
  /** Tilt in degrees; the design gives each seat its own. */
  tilt?: number;
  /** A short tag in the top-right corner, such as "BET". */
  badge?: string | null;
  /** Makes the card a button (the host's player menu). */
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * An opponent's seat card, 6.4u × 8.6u. A disconnected player's chip is
 * greyed out and tagged "away", as in the lobby.
 */
export function SeatCard({
  player,
  count,
  goal,
  active,
  tilt = 0,
  badge,
  onClick,
  className,
  style,
}: SeatCardProps) {
  const away = !player.connected;
  const name = useFitText<HTMLSpanElement>(player.name, 1, NAME_FLOOR);
  const rootClass = cx(
    "gs-seat",
    active && "is-active",
    away && "is-away",
    className,
  );
  const face: ReactNode = (
    <span
      className="gs-seat-face"
      style={
        tilt ? ({ "--gs-tilt": `${tilt}deg` } as CSSProperties) : undefined
      }
    >
      <span
        className="gs-chip"
        style={
          {
            "--gs-chip": player.chip,
            "--gs-chip-edge": player.chipEdge,
          } as CSSProperties
        }
        aria-hidden="true"
      >
        {player.animal}
      </span>
      <span ref={name} className="gs-seat-name">
        {player.name}
      </span>
      <span className="gs-seat-score">
        {count}/{goal}
      </span>
      {away && <span className="gs-seat-away">away</span>}
      {badge && <span className="gs-seat-badge">{badge}</span>}
    </span>
  );
  if (!onClick)
    return (
      <div
        className={rootClass}
        style={style}
        aria-current={active ? "true" : undefined}
      >
        {face}
      </div>
    );
  const label = [
    player.name,
    `${count} of ${goal} cards`,
    away && "away",
    badge,
    "player options",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      className={rootClass}
      style={style}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "true" : undefined}
    >
      {face}
    </button>
  );
}

// --------------------------------------------------------------------- Chips

export interface ChipsProps extends HTMLAttributes<HTMLSpanElement> {
  count: number;
  /** Chip colour and the darker edge under it: the owner's seat colour. */
  chip: string;
  edge: string;
  /** At most this many are drawn; the rest are counted, "+3". */
  max?: number;
  /** With none left, a dashed outline keeps the place. */
  showEmpty?: boolean;
}

/**
 * Betting tokens as a row of poker chips, 1.7u each (the parent scales the
 * row). A chip added later hops in; keyed by position, so only new ones do.
 * Past `max` the count hops instead, keyed by how often it has grown.
 */
export function Chips({
  count,
  chip,
  edge,
  max = 4,
  showEmpty,
  className,
  style,
  ...rest
}: ChipsProps) {
  const drawn = Math.max(0, Math.min(count, max));
  const [last, setLast] = useState(count);
  const [gains, setGains] = useState(0);
  if (count !== last) {
    setLast(count);
    if (count > last) setGains(gains + 1);
  }
  return (
    <span
      className={cx("gs-chips", className)}
      style={
        { "--gs-chip": chip, "--gs-chip-edge": edge, ...style } as CSSProperties
      }
      {...rest}
    >
      {Array.from({ length: drawn }, (_, i) => (
        <span key={i} className="gs-chips-chip" />
      ))}
      {count > max && (
        <span key={`more-${gains}`} className="gs-chips-more">
          +{count - max}
        </span>
      )}
      {count <= 0 && showEmpty && <span className="gs-chips-chip is-empty" />}
    </span>
  );
}

/** A bet token's face: the bettor's animal on their chip colour (cream for the viewer's own). */
export function TokenFace({ player }: { player: TablePlayer }) {
  return (
    <span
      className="gs-token-face"
      style={
        {
          "--gs-chip": player.isMe ? "var(--cream)" : player.chip,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {player.animal}
    </span>
  );
}

// ------------------------------------------------------------------- MePlate

export interface MePlateProps {
  player: TablePlayer;
  count: number;
  goal: number;
  /** The viewer's turn: the plate turns gold. */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** The viewer's own plate in the bottom-left corner: animal, name and progress. */
export function MePlate({
  player,
  count,
  goal,
  active,
  className,
  style,
}: MePlateProps) {
  const name = useFitText<HTMLSpanElement>(player.name, 1, NAME_FLOOR);
  return (
    <div
      className={cx("gs-me", active && "is-active", className)}
      style={style}
    >
      <div className="gs-me-face">
        <span className="gs-me-animal" aria-hidden="true">
          {player.animal}
        </span>
        <span className="gs-me-text">
          <span ref={name} className="gs-me-name">
            {player.name}
          </span>
          <Pips count={count} goal={goal} />
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- ViewerPlate

export interface ViewerPlateProps {
  name: string;
  animal: string;
  /** What the viewer is doing, e.g. "Watching. The table is full." */
  note: string;
  /** One action, such as standing up or taking a seat. */
  action?: { label: string; onClick: () => void } | null;
  className?: string;
  style?: CSSProperties;
}

/** The plate for someone at the table who is not in this game: a note instead of progress. */
export function ViewerPlate({
  name,
  animal,
  note,
  action,
  className,
  style,
}: ViewerPlateProps) {
  const fitted = useFitText<HTMLSpanElement>(name, 1, NAME_FLOOR);
  return (
    <div className={cx("gs-me gs-viewer", className)} style={style}>
      <div className="gs-me-face">
        <span className="gs-me-animal" aria-hidden="true">
          {animal}
        </span>
        <span className="gs-me-text">
          <span ref={fitted} className="gs-me-name">
            {name}
          </span>
          <span className="gs-viewer-note">{note}</span>
        </span>
        {action && (
          <button
            className="tl-button gs-viewer-action"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
