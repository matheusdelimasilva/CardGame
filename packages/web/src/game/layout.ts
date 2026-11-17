/**
 * Geometry of the game screen, in stage units. The stage is 100u wide and
 * 62.5u tall (see .gs-stage), and every position here is the centre of the
 * thing placed on it unless the name says box. The numbers come from
 * docs/design/game-screen.dc.html; where the design only covered short
 * timelines and five opponents, the extensions are noted.
 */
import type { Box, Point, Pose } from "./types";

export const STAGE = { w: 100, h: 62.5 } as const;

/** Card sizes at scale 1. */
export const HAND_CARD = { w: 8.4, h: 11.8 } as const;
export const MINI_CARD = { w: 2.3, h: 3.2 } as const;
export const SEAT_CARD = { w: 6.4, h: 8.6 } as const;

/** The oval table, rail included. */
export const TABLE_BOX: Box = { x: 10, y: 17, w: 80, h: 23 };
export const DECK_BOX: Box = { x: 31.8, y: 22.6, w: 8.4, h: 11.8 };
/** "FIRST TO n" under the deck; text is centred in it. */
export const GOAL_LABEL_BOX: Box = { x: 28, y: 35.3, w: 16, h: 1.6 };
/** Where the mystery card waits face down for the viewer to pick it up. */
export const MYSTERY_HOME: Pose = { x: 50, y: 28.5, r: -3 };
/** Where the mystery card appears when it is dealt, just off the deck. */
export const MYSTERY_DEAL: Pose = { x: 36, y: 27.5, r: 0 };
/** A discarded card flies off the right edge of the stage. */
export const DISCARD_EXIT: Pose = { x: 108, y: 30, r: 70 };
/** Highlighted while dragging; a held card counts as over it below DROP_LINE_Y. */
export const DROP_ZONE: Box = { x: 22, y: 43.5, w: 56, h: 17 };
export const DROP_LINE_Y = 41;
/** "← older … newer →" under the hand. */
export const TIMELINE_ARROW_BOX: Box = { x: 20, y: 60.6, w: 60, h: 1.9 };
/** The chat panel; nothing of the hand may reach under it. */
export const CHAT_BOX: Box = { x: 79.5, y: 42.6, w: 19, h: 18.9 };

/**
 * The status headline sits to the right of the mystery card on the viewer's
 * own turns, and further right when an opponent's timeline fills the felt.
 * y is the vertical centre of the text block.
 */
export const STATUS_BOX = {
  mine: { x: 58, y: 28.5, w: 24 },
  opponent: { x: 71, y: 28.5, w: 17 },
} as const;

// ---------------------------------------------------------------- the hand

const HAND_CENTRE = 50;
const HAND_Y = 53;
const HAND_STEP = 9;
/** Hand card centres stay inside this range so they clear the player plate and the chat. */
export const HAND_X_RANGE = { min: 24, max: 76 } as const;
/** The design's fan at six slots: its outermost tilt and drop, kept as caps for longer hands. */
const HAND_MAX_TILT = 7.5;
const HAND_MAX_DROP = 1.875;

/**
 * Where card `k` of `total` slots sits in the fanned hand. Up to six slots
 * this is the design's fan exactly; longer hands squeeze the spacing (cards
 * overlap) and keep the outer tilt and drop of a six-slot fan.
 */
export function handSlot(k: number, total: number): Pose {
  const half = (total - 1) / 2;
  const rel = k - half;
  if (half <= 0) return { x: HAND_CENTRE, y: HAND_Y, r: 0 };
  const reach = Math.min(
    HAND_CENTRE - HAND_X_RANGE.min,
    HAND_X_RANGE.max - HAND_CENTRE,
  );
  const step = Math.min(HAND_STEP, reach / half);
  const tilt = Math.min(3, HAND_MAX_TILT / half);
  const drop = Math.min(0.3, HAND_MAX_DROP / (half * half));
  return {
    x: HAND_CENTRE + rel * step,
    y: HAND_Y + rel * rel * drop,
    r: rel * tilt,
  };
}

/**
 * The insertion index for a pointer at stage x over a hand of `count` cards:
 * how many of the cards sit left of it, as laid out before the gap opens.
 */
export function handInsertionIndex(x: number, count: number): number {
  let index = 0;
  for (let k = 0; k < count; k++) if (handSlot(k, count).x < x) index++;
  return index;
}

/**
 * Pose of the hand's card `i` of `count` while a gap is open at `gap`
 * (null: no gap), so the cards make room for the one being placed.
 */
export function handCardWithGap(
  i: number,
  count: number,
  gap: number | null,
): Pose {
  return gap === null
    ? handSlot(i, count)
    : handSlot(i < gap ? i : i + 1, count + 1);
}

// -------------------------------------------------------------- opponents

/** One opponent's corner of the rail: their seat card and the timeline beside it. */
export interface OpponentSpot {
  /** The design's reference point: seat card on its left, mini timeline to its right. */
  anchor: Point;
  /** Size multiplier for the seat card, its mini cards and tokens. */
  scale: number;
  /** Centre of the seat card. */
  seat: Point;
  /** Top-left of the row of betting tokens above the mini timeline. */
  tokens: Point;
  /** Furthest right a mini card's centre may go before it would touch the next spot. */
  maxMiniX: number;
}

const OPPONENT_Y = 15.5;
/** The design's spots for one to five opponents, all at full size. */
const DESIGN_SPOTS: Record<number, number[]> = {
  1: [50],
  2: [34, 72],
  3: [26, 50, 74],
  4: [15, 39, 63, 87],
  5: [10.5, 30.25, 50, 69.75, 89.5],
};
/**
 * Six and seven opponents are not in the design: they share the same row,
 * evenly spaced and shrunk so the outer seat cards stay on the stage.
 */
const CROWDED_SPOTS: Record<number, { xs: number[]; scale: number }> = {
  6: { xs: [9, 25.4, 41.8, 58.2, 74.6, 91], scale: 0.85 },
  7: { xs: [7.7, 21.8, 35.9, 50, 64.1, 78.2, 92.3], scale: 0.72 },
};
export const MAX_OPPONENTS = 7;
/** Offsets from the anchor at scale 1, from the design. */
const SEAT_OFFSET_X = -6.55;
const SEAT_LEFT = -9.75;
const MINI_START = -1.6;
const MINI_STEP = 2.5;
const TOKENS_OFFSET = { x: -2.75, y: -4 };
/** Breathing room between one spot's last mini card and the next spot's seat card. */
const SPOT_GAP = 0.6;
const STAGE_MARGIN = 0.5;

/** The spots for `count` opponents (clamped to 1–7), left to right. */
export function opponentSpots(count: number): OpponentSpot[] {
  const n = Math.max(1, Math.min(MAX_OPPONENTS, Math.round(count)));
  const crowded = CROWDED_SPOTS[n];
  const xs = crowded?.xs ?? DESIGN_SPOTS[n]!;
  const scale = crowded?.scale ?? 1;
  return xs.map((x, i) => {
    const next = xs[i + 1];
    const right =
      next === undefined
        ? STAGE.w - STAGE_MARGIN
        : next + SEAT_LEFT * scale - SPOT_GAP;
    return {
      anchor: { x, y: OPPONENT_Y },
      scale,
      seat: { x: x + SEAT_OFFSET_X * scale, y: OPPONENT_Y },
      tokens: {
        x: x + TOKENS_OFFSET.x * scale,
        y: OPPONENT_Y + TOKENS_OFFSET.y * scale,
      },
      maxMiniX: right - (MINI_CARD.w / 2) * scale,
    };
  });
}

/** Bounding box of a spot's seat card. */
export function seatCardBox(spot: OpponentSpot): Box {
  const w = SEAT_CARD.w * spot.scale;
  const h = SEAT_CARD.h * spot.scale;
  return { x: spot.seat.x - w / 2, y: spot.seat.y - h / 2, w, h };
}

/**
 * Centres of the `count` mini cards beside a seat card. They keep the
 * design's spacing until the line would reach the next spot, then overlap.
 */
export function miniTimeline(spot: OpponentSpot, count: number): Point[] {
  const start = spot.anchor.x + MINI_START * spot.scale;
  const step =
    count > 1
      ? Math.min(MINI_STEP * spot.scale, (spot.maxMiniX - start) / (count - 1))
      : 0;
  return Array.from({ length: count }, (_, j) => ({
    x: start + j * step,
    y: spot.anchor.y,
  }));
}

// ------------------------------------------------- the active opponent's timeline

/** Centre line of the enlarged timeline on the felt. */
export const FELT_CENTRE: Point = { x: 55.5, y: 28.5 };
/** Its cards must clear the deck on the left and the status text on the right. */
export const FELT_X_RANGE = {
  min: DECK_BOX.x + DECK_BOX.w,
  max: STATUS_BOX.opponent.x,
} as const;
const FELT_STEP = 6.6;
/** Narrower once the placed card has opened a gap, as in the design. */
const FELT_STEP_PLACED = 5.6;
const FELT_SCALE = 2;
/** Clear space between the outer cards and the deck or the status text. */
const FELT_MARGIN = 0.3;

/** A mini card enlarged on the felt: its centre and its scale. */
export interface FeltCard extends Point {
  scale: number;
}

/** Scale of the felt's cards when `slots` cards share it: full size up to six, then shrinking to 1.6. */
function feltScale(slots: number): number {
  return Math.max(1.6, FELT_SCALE - Math.max(0, slots - 6) * 0.1);
}

/** Positions of `slots` cards in a row on the felt, centred, squeezed to fit. */
function feltRow(slots: number, nominalStep: number): FeltCard[] {
  const scale = feltScale(slots);
  const half = (MINI_CARD.w / 2) * scale + FELT_MARGIN;
  const room = FELT_X_RANGE.max - FELT_X_RANGE.min - 2 * half;
  const step = slots > 1 ? Math.min(nominalStep, room / (slots - 1)) : 0;
  // Centred on the design's CX, nudged inward if squeezing alone is not enough.
  const span = (slots - 1) * step;
  const centre = Math.min(
    Math.max(FELT_CENTRE.x, FELT_X_RANGE.min + half + span / 2),
    FELT_X_RANGE.max - half - span / 2,
  );
  return Array.from({ length: slots }, (_, k) => ({
    x: centre + (k - (slots - 1) / 2) * step,
    y: FELT_CENTRE.y,
    scale,
  }));
}

/**
 * The active opponent's `count` cards on the felt. With `placedAt` the
 * placed card is shown in that gap: the result then has count + 1 entries
 * and the placed card is the one at index `placedAt`.
 */
export function feltTimeline(
  count: number,
  placedAt: number | null = null,
): FeltCard[] {
  return placedAt === null
    ? feltRow(count, FELT_STEP)
    : feltRow(count + 1, FELT_STEP_PLACED);
}

/** A gap marker between the felt's cards (for bets): its size and vertical extent; x comes from feltGapX. */
export const FELT_GAP = { y: 24.4, w: 2, h: 8.2 } as const;

/** Stage x of gap `g` (0…count) between the felt's cards, before anything is placed. */
export function feltGapX(g: number, count: number): number {
  if (count === 0) return FELT_CENTRE.x;
  const row = feltRow(count, FELT_STEP);
  const step = count > 1 ? row[1]!.x - row[0]!.x : FELT_STEP;
  return row[0]!.x + (g - 0.5) * step;
}

// ------------------------------------------------------------------ colour

// Same palette as games/hitster-cards.tsx, from docs/design/song-cards.html.
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

/** A song card's accent colour for its release year. */
export function decadeColor(year: number): string {
  let color = DECADES[0]![1];
  for (const [decade, c] of DECADES) if (year >= decade) color = c;
  return color;
}

// --------------------------------------------------------------------- CSS

/** Stage units as a CSS length, e.g. u(4.2) → "calc(var(--u) * 4.2)". */
export function u(n: number): string {
  return `calc(var(--u) * ${+n.toFixed(2)})`;
}

/**
 * A transform that puts an element of size `size` (absolutely positioned at
 * the stage's top-left) with its centre on `pose`.
 */
export function placeAt(
  pose: Point & { r?: number },
  size: { w: number; h: number },
  scale = 1,
): string {
  const r = pose.r ?? 0;
  return `translate(${u(pose.x - size.w / 2)}, ${u(pose.y - size.h / 2)}) rotate(${+r.toFixed(1)}deg) scale(${+scale.toFixed(3)})`;
}

/** Absolute-position style for a box. */
export function boxStyle(box: Box): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return { left: u(box.x), top: u(box.y), width: u(box.w), height: u(box.h) };
}
