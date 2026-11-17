/**
 * Geometry of the game screen, in stage units. The stage is 100u wide and
 * 62.5u tall (see .gs-stage), and every position here is the centre of the
 * thing placed on it unless the name says box. The numbers come from
 * docs/design/game-screen.dc.html; where the design only covered short
 * timelines and five opponents, the extensions are noted.
 */
import type { Box, Point, Pose } from "./types";

export const STAGE = { w: 100, h: 62.5 } as const;
/**
 * The header (ui/TableHeader) is laid over the stage's top edge whenever the
 * window is at least as wide as the stage's 16:10; its marquee, shadow
 * included, reaches this far down. Seat cards stay below it.
 */
export const HEADER_CLEARANCE = 10.5;

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
 * The viewer's plate in the bottom-left corner: its left edge, its distance
 * from the stage's bottom, and the widest it may grow (long names shrink to
 * fit, see MePlate), so the hand knows where it ends.
 */
export const PLATE = { x: 2.5, bottom: 4.6, w: 19.5 } as const;

/**
 * Where the status text goes. y is the vertical centre of the text block,
 * or its top for `under`. The design puts it right of the mystery card on
 * the viewer's own turns and further right while an opponent's short
 * timeline is on the felt; a long timeline needs the whole felt, so the
 * status moves under it, centred (see feltLayout).
 */
export const STATUS_BOX = {
  mine: { x: 58, y: 28.5, w: 24 },
  opponent: { x: 71, y: 28.5, w: 17 },
  under: { x: 41, y: 29.9, w: 45.5 },
} as const;
export type StatusPlace = keyof typeof STATUS_BOX;

// ---------------------------------------------------------------- the hand

const HAND_CENTRE = 50;
const HAND_Y = 53;
const HAND_STEP = 9;
/**
 * Every hand card, tilt included, stays inside this band: clear of the
 * plate on the left and the chat on the right. The design's six-slot fan
 * just fits.
 */
export const HAND_BAND = {
  min: PLATE.x + PLATE.w + 0.5,
  max: CHAT_BOX.x - 2,
} as const;
/** The design's fan at six slots: its outermost tilt and drop, kept as caps for longer hands. */
const HAND_MAX_TILT = 7.5;
const HAND_MAX_DROP = 1.875;
/** Longer hands shrink their cards to fit the band, but no further than this; then they overlap. */
export const HAND_MIN_SCALE = 0.8;

/** A slot in the hand: where a card sits and how large it is drawn. */
export interface HandPose extends Pose {
  scale: number;
}

/** Half the width of a card of size `size` turned by `r` degrees: how far it reaches sideways. */
export function rotatedHalfWidth(
  size: { w: number; h: number },
  r: number,
): number {
  const rad = (Math.abs(r) * Math.PI) / 180;
  return (size.w / 2) * Math.cos(rad) + (size.h / 2) * Math.sin(rad);
}

/**
 * Where card `k` of `total` slots sits in the fanned hand. Up to six slots
 * this is the design's fan exactly. Longer hands keep the outer tilt and
 * drop of a six-slot fan and shrink their cards, keeping the design's
 * spacing, until they fit between the plate and the chat; past
 * HAND_MIN_SCALE the cards overlap instead, newer over older. Smaller cards
 * keep their bottom edge where a full-size card's is, on the ruler.
 */
export function handSlot(k: number, total: number): HandPose {
  const half = (total - 1) / 2;
  const rel = k - half;
  if (half <= 0) return { x: HAND_CENTRE, y: HAND_Y, r: 0, scale: 1 };
  const tilt = Math.min(3, HAND_MAX_TILT / half);
  const drop = Math.min(0.3, HAND_MAX_DROP / (half * half));
  const reach = (HAND_BAND.max - HAND_BAND.min) / 2;
  const outer = rotatedHalfWidth(HAND_CARD, half * tilt);
  const scale = Math.max(
    HAND_MIN_SCALE,
    Math.min(1, reach / (half * HAND_STEP + outer)),
  );
  const step = Math.min(HAND_STEP * scale, (reach - outer * scale) / half);
  return {
    x: HAND_CENTRE + rel * step,
    y: HAND_Y + ((1 - scale) * HAND_CARD.h) / 2 + rel * rel * drop * scale,
    r: rel * tilt,
    scale,
  };
}

/**
 * The insertion index for a pointer at stage x over a hand of `count` cards:
 * the slot, of the count + 1 drawn while a card is held over the hand, whose
 * centre is nearest. Each slot's target is as wide as the slot is apart from
 * its neighbours. For up to five cards this is the design's idxAt (the
 * number of cards left of the pointer).
 */
export function handInsertionIndex(x: number, count: number): number {
  let index = 0;
  for (let k = 0; k < count; k++) {
    const between =
      (handSlot(k, count + 1).x + handSlot(k + 1, count + 1).x) / 2;
    if (between < x) index++;
  }
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
): HandPose {
  return gap === null
    ? handSlot(i, count)
    : handSlot(i < gap ? i : i + 1, count + 1);
}

// -------------------------------------------------------------- opponents

/**
 * One opponent's place at the table: their seat card, and the lane their
 * mini timeline is laid out in.
 */
export interface OpponentSpot {
  /** Centre of the seat card. */
  seat: Point;
  /** Size multiplier for the seat card, its mini cards and tokens. */
  scale: number;
  /** Top-left of the row of betting tokens. */
  tokens: Point;
  /**
   * Where the mini timeline may go. "beside": right of the seat card, in up
   * to `rows` rows centred on it; "below": under the seat card, in up to
   * `rows` rows centred under it.
   */
  lane: Box & { place: "beside" | "below"; rows: number };
}

const OPPONENT_Y = 15.5;
/**
 * The design's top row for one to five opponents: each spot's reference
 * point. Five are 0.6 right of the design's, so the first seat card, grown
 * and ringed on its player's turn, stays on the stage.
 */
const DESIGN_ROWS: Record<number, number[]> = {
  1: [50],
  2: [34, 72],
  3: [26, 50, 74],
  4: [15, 39, 63, 87],
  5: [11.1, 30.85, 50.6, 70.35, 90.1],
};
/** Eight opponents (a spectator's full table) leave six for the top row: evenly spaced and smaller. */
const CROWDED_ROW = { xs: [9, 25.4, 41.8, 58.2, 74.6, 91], scale: 0.8 };
/**
 * From six opponents on, the first and the last sit at the ends of the
 * table, so the order still runs clockwise and the top row keeps the
 * design's spots for four or five. x is the left end's; the right is mirrored.
 */
const END_SEAT = { x: 5.25, y: 27, scale: 0.9 } as const;
export const MAX_OPPONENTS = 8;
/** Offsets from a top spot's reference point at scale 1, from the design. */
const SEAT_OFFSET_X = -6.55;
const MINI_START = -1.6;
const MINI_STEP = 2.5;
const TOKENS_OFFSET = { x: -2.75, y: -4 };
/** Rows of a wrapped mini timeline are this far apart at scale 1. */
const MINI_ROW_PITCH = 3.6;
/**
 * Breathing room between a lane and the next seat card at scale 1: that
 * card grows by 12%, tilted and ringed in gold, while it is its player's turn.
 */
const SPOT_GAP = 1.3;
const STAGE_MARGIN = 0.5;
/** An end seat's lane starts this far under its seat card. */
const END_LANE_GAP = 0.6;
const END_LANE_W = 9;

function topRow(xs: number[], scale: number): OpponentSpot[] {
  const h = SEAT_CARD.h * scale;
  return xs.map((x, i) => {
    const next = xs[i + 1];
    const left = x + (MINI_START - MINI_CARD.w / 2) * scale;
    const right =
      next === undefined
        ? STAGE.w - STAGE_MARGIN
        : next + (SEAT_OFFSET_X - SEAT_CARD.w / 2 - SPOT_GAP) * scale;
    return {
      seat: { x: x + SEAT_OFFSET_X * scale, y: OPPONENT_Y },
      scale,
      tokens: {
        x: x + TOKENS_OFFSET.x * scale,
        y: OPPONENT_Y + TOKENS_OFFSET.y * scale,
      },
      lane: {
        x: left,
        y: OPPONENT_Y - h / 2,
        w: right - left,
        h,
        place: "beside",
        rows: 2,
      },
    };
  });
}

function endSpot(side: "left" | "right"): OpponentSpot {
  const { y, scale } = END_SEAT;
  const x = side === "left" ? END_SEAT.x : STAGE.w - END_SEAT.x;
  const w = SEAT_CARD.w * scale;
  const h = SEAT_CARD.h * scale;
  const top = y + h / 2 + END_LANE_GAP;
  return {
    seat: { x, y },
    scale,
    tokens: { x: x - w / 2, y: y - h / 2 - 2 * scale },
    lane: {
      x: x - END_LANE_W / 2,
      y: top,
      w: END_LANE_W,
      h: (MINI_CARD.h + 2 * MINI_ROW_PITCH) * scale,
      place: "below",
      rows: 3,
    },
  };
}

/**
 * The spots for `count` opponents (clamped to 1–8), clockwise from the
 * viewer: left end, top row left to right, right end.
 */
export function opponentSpots(count: number): OpponentSpot[] {
  const n = Math.max(1, Math.min(MAX_OPPONENTS, Math.round(count)));
  if (n <= 5) return topRow(DESIGN_ROWS[n]!, 1);
  const top =
    n === 8
      ? topRow(CROWDED_ROW.xs, CROWDED_ROW.scale)
      : topRow(DESIGN_ROWS[n - 2]!, 1);
  return [endSpot("left"), ...top, endSpot("right")];
}

/** Bounding box of a spot's seat card. */
export function seatCardBox(spot: OpponentSpot): Box {
  const w = SEAT_CARD.w * spot.scale;
  const h = SEAT_CARD.h * spot.scale;
  return { x: spot.seat.x - w / 2, y: spot.seat.y - h / 2, w, h };
}

/**
 * Centres of the `count` mini cards in a spot's lane, oldest first. They
 * keep the design's single row and spacing while that fits; a longer line
 * wraps into rows of equal length (older rows above), and only squeezes
 * once the lane has no more rows.
 */
export function miniTimeline(spot: OpponentSpot, count: number): Point[] {
  const { lane, scale } = spot;
  const w = MINI_CARD.w * scale;
  const h = MINI_CARD.h * scale;
  const nominal = MINI_STEP * scale;
  const fits = Math.floor((lane.w - w) / nominal + 1e-9) + 1;
  const rows = Math.max(1, Math.min(lane.rows, Math.ceil(count / fits)));
  const perRow = Math.ceil(count / rows);
  const step = perRow > 1 ? Math.min(nominal, (lane.w - w) / (perRow - 1)) : 0;
  const pitch = MINI_ROW_PITCH * scale;
  return Array.from({ length: count }, (_, j) => {
    const row = Math.floor(j / perRow);
    const col = j % perRow;
    return lane.place === "beside"
      ? {
          x: lane.x + w / 2 + col * step,
          y: lane.y + lane.h / 2 + (row - (rows - 1) / 2) * pitch,
        }
      : {
          x: lane.x + lane.w / 2 + (col - (perRow - 1) / 2) * step,
          y: lane.y + h / 2 + row * pitch,
        };
  });
}

// ------------------------------------------------- the active opponent's timeline

/** Centre of the design's line on the felt, beside the status. */
export const FELT_CENTRE: Point = { x: 55.5, y: 28.5 };
/** Full size on the felt; the design's spacing at that size leaves room for a gap button between cards. */
const FELT_SCALE = 2;
const FELT_STEP = 6.6;
/** Narrower once the placed card has opened a gap, as in the design. */
const FELT_STEP_PLACED = 5.6;
/** A gap button (for bets) at full size: as wide as the space between two cards. */
const FELT_GAP_SIZE = { w: 2, h: 8.2 } as const;
/** Clear space between the line and the deck or the status text. */
const FELT_MARGIN = 0.8;
const FELT_MIN_X = DECK_BOX.x + DECK_BOX.w + FELT_MARGIN;
/** Lines up to this long sit beside the status, as in the design. */
const FELT_BESIDE_MAX = 4;
/**
 * A longer line has the felt's whole width, a little higher, with the
 * status under it; a little smaller at most, so the line clears a seat card
 * above it on its player's turn and the status still fits under it.
 */
const FELT_WIDE = { max: 86.5, y: 25.8, scale: 1.8 } as const;

/** How the active opponent's timeline lies on the felt. */
export interface FeltLayout {
  /** The line, gap buttons at both ends included, stays inside this range. */
  range: { min: number; max: number };
  y: number;
  scale: number;
  /** Where the status text goes meanwhile. */
  status: Extract<StatusPlace, "opponent" | "under">;
}

/**
 * The felt's layout for a line of `count` cards (the placed card not
 * counted), the same for the whole turn. Cards are full size while they
 * fit, with room for a gap button at each end and between neighbours, and
 * with the placed card in the line; then they shrink.
 */
export function feltLayout(count: number): FeltLayout {
  const beside = count <= FELT_BESIDE_MAX;
  const range = {
    min: FELT_MIN_X,
    max: beside ? STATUS_BOX.opponent.x - FELT_MARGIN : FELT_WIDE.max,
  };
  const room = range.max - range.min;
  // Widths per unit of scale: with a gap button at each end, and with the placed card in.
  const open = (FELT_STEP * count + FELT_GAP_SIZE.w) / FELT_SCALE;
  const placed =
    (FELT_STEP_PLACED * count + MINI_CARD.w * FELT_SCALE) / FELT_SCALE;
  return {
    range,
    y: beside ? FELT_CENTRE.y : FELT_WIDE.y,
    scale: Math.min(
      beside ? FELT_SCALE : FELT_WIDE.scale,
      room / open,
      room / placed,
    ),
    status: beside ? "opponent" : "under",
  };
}

/** A mini card enlarged on the felt: its centre and its scale. */
export interface FeltCard extends Point {
  scale: number;
}

/** `slots` cards `step` apart (at full size) on the felt, centred: on the design's CX beside the status, else in the range. */
function feltRow(count: number, slots: number, step: number): FeltCard[] {
  const { range, y, scale, status } = feltLayout(count);
  const pitch = (step / FELT_SCALE) * scale;
  const span = (slots - 1) * pitch;
  const reach = span / 2 + (MINI_CARD.w / 2) * scale;
  const preferred =
    status === "opponent" ? FELT_CENTRE.x : (range.min + range.max) / 2;
  const centre = Math.min(
    Math.max(preferred, range.min + reach),
    range.max - reach,
  );
  return Array.from({ length: slots }, (_, k) => ({
    x: centre + (k - (slots - 1) / 2) * pitch,
    y,
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
    ? feltRow(count, count, FELT_STEP)
    : feltRow(count, count + 1, FELT_STEP_PLACED);
}

/** Stage x of gap `g` (0…count) between the felt's cards, before anything is placed. */
export function feltGapX(g: number, count: number): number {
  if (count === 0) return feltRow(0, 1, FELT_STEP)[0]!.x;
  const row = feltRow(count, count, FELT_STEP);
  const pitch = (FELT_STEP / FELT_SCALE) * row[0]!.scale;
  return row[0]!.x + (g - 0.5) * pitch;
}

/** The box of gap button `g` (0…count) between the felt's cards (for bets), scaled with them. */
export function feltGapBox(g: number, count: number): Box {
  const { y, scale } = feltLayout(count);
  const w = (FELT_GAP_SIZE.w / FELT_SCALE) * scale;
  const h = (FELT_GAP_SIZE.h / FELT_SCALE) * scale;
  return { x: feltGapX(g, count) - w / 2, y: y - h / 2, w, h };
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
