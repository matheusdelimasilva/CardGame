/**
 * Geometry of the game screen, in stage units. The stage is 100u wide and
 * 62.5u tall (see .gs-stage), and every position here is the centre of the
 * thing placed on it unless the name says box. The numbers come from
 * docs/design/game-screen.dc.html; where the design only covered short
 * timelines and five opponents, the extensions are noted. portrait.ts lays
 * the same parts out for a phone held upright; StageLayout, at the end, is
 * what Scene and Stage read, whichever of the two it is.
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
/** "betting": where the status goes while the bet bar is part of it (portrait.ts). */
export type StatusPlace = keyof typeof STATUS_BOX | "betting";

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
  return insertionIndex(handSlot, x, count);
}

/** handInsertionIndex for any hand layout `slot`. */
export function insertionIndex(
  slot: (k: number, total: number) => Point,
  x: number,
  count: number,
): number {
  let index = 0;
  for (let k = 0; k < count; k++) {
    const between = (slot(k, count + 1).x + slot(k + 1, count + 1).x) / 2;
    if (between < x) index++;
  }
  return index;
}

/**
 * Pose of the hand's card `i` of `count` while a gap is open at `gap`
 * (null: no gap), so the cards make room for the one being placed; in the
 * design's hand unless another layout's `slot` is given.
 */
export function handCardWithGap(
  i: number,
  count: number,
  gap: number | null,
  slot: (k: number, total: number) => HandPose = handSlot,
): HandPose {
  return gap === null ? slot(i, count) : slot(i < gap ? i : i + 1, count + 1);
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
   * `rows` rows centred under it; "pile": stacked behind the seat card
   * (portrait.ts), the seat's count telling how many there are.
   */
  lane: Box & { place: "beside" | "below" | "pile"; rows: number };
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

// ---------------------------------------------------------------- betting

/** A bet token's diameter, and the chips beside a seat card (at its scale) and under the plate. */
export const BET_TOKEN = 2.2;
export const SEAT_CHIP = 1.7;
export const PLATE_CHIP = 2.2;
/** Pending tokens wait in a row this far apart, as in the design. */
const PENDING_STEP = 2.7;
/** Tokens bet on the same gap stack upwards this far apart, closer in a tall stack. */
const STACK_STEP = 2.4;
const STACK_MAX = 7.2;
/** The design's pending row and landing spots over a line on the felt, above its cards' top at full size. */
const FELT_PENDING_ABOVE = 4.1;
const FELT_LANDING_ABOVE = 1.9;
/** On the viewer's turn: pending tokens under the card's home, landed ones above the hand's cards. */
const MY_PENDING = { x: 50, y: 36.7 } as const;
const HAND_LANDING_ABOVE = 1.9;

/** How far up the `level`-th of `count` tokens on one gap sits. */
export function stackOffset(level: number, count: number): number {
  const step = count > 1 ? Math.min(STACK_STEP, STACK_MAX / (count - 1)) : 0;
  return level * step;
}

/** The i-th of n tokens in a row centred on `centre`. */
export function tokenRow(centre: Point, i: number, n: number): Point {
  return { x: centre.x + (i - (n - 1) / 2) * PENDING_STEP, y: centre.y };
}

/**
 * Where gap `g` of a line is, from where the line's cards are drawn:
 * `cards` holds them oldest first, with the card being revealed at
 * `placedAt` among them (null: none). On the revealed card for its own gap;
 * else between the two cards around the gap, or half a `step` past the
 * card at an end or at the end of a row. Returns the cards it lies by too,
 * so callers can keep clear of them; null for a line with no cards.
 */
export function gapPoint(
  cards: readonly FeltCard[],
  g: number,
  placedAt: number | null,
  step: number,
): { at: Point; by: FeltCard[] } | null {
  if (placedAt !== null && g === placedAt) {
    const card = cards[placedAt]!;
    return { at: { x: card.x, y: card.y }, by: [card] };
  }
  const count = cards.length - (placedAt === null ? 0 : 1);
  const slot = (j: number) => (placedAt !== null && j >= placedAt ? j + 1 : j);
  const left = g > 0 ? cards[slot(g - 1)] : undefined;
  const right = g < count ? cards[slot(g)] : undefined;
  if (left && right && Math.abs(left.y - right.y) < 1e-6)
    return {
      at: { x: (left.x + right.x) / 2, y: left.y },
      by: [left, right],
    };
  if (left) return { at: { x: left.x + step / 2, y: left.y }, by: [left] };
  if (right) return { at: { x: right.x - step / 2, y: right.y }, by: [right] };
  return null;
}

/** Where a token sits over the cards it lies by: `above` their tallest top, in units at full size. */
const over = (
  spot: { at: Point; by: FeltCard[] },
  h: number,
  above: number,
) => ({
  x: spot.at.x,
  y: Math.min(...spot.by.map((c) => c.y - (h / 2) * c.scale)) - above,
});

/**
 * Where betting things go on one shape of stage. Tokens are placed by their
 * centre; the hand's spots are in hand units (they scroll with the hand).
 */
export interface BetGeometry {
  /** The i-th of n bets waiting on the viewer's own turn. */
  pendingMine(i: number, n: number): Point;
  /** The i-th of n bets waiting over an opponent's line of `count` cards on the felt. */
  pendingFelt(i: number, n: number, count: number): Point;
  /** Where a token bet on gap `g` lands over the felt's line of `count` cards, the revealed card at `placedAt`. */
  feltSpot(g: number, count: number, placedAt: number | null): Point;
  /** Where a token bet on gap `g` lands over the viewer's hand of `count` cards, the revealed card in slot `placedAt`. */
  handSpot(g: number, count: number, placedAt: number | null): Point;
  /** The viewer's chips: the row's left end and its vertical centre. */
  plateChips: Point;
  /** Chips drawn beside a seat card before the rest are counted ("+2"). */
  seatChipsMax: number;
  /** How much lower a seat's chips go while it is that player's turn (their card grows and drops), at scale 1. */
  activeChipsDrop: number;
  /**
   * The bet bar floats centred on `at`, or is part of the status ("betting"
   * place). A floating bar too wide to be centred keeps its right end at
   * `right` and grows leftwards, as far as `left`.
   */
  bar:
    | { kind: "floating"; at: Point; left: number; right: number }
    | { kind: "status" };
}

/** The felt's line and hand as betting reads them, for either stage. */
export function betGeometry(
  layout: Pick<StageLayout, "feltTimeline" | "hand">,
  felt: {
    pending: (count: number) => Point;
    /** Units above the cards' top, at full size (scale 2), a token lands; negative: over them. */
    landing: number;
    /** Distance between neighbouring cards on the felt, at the line's scale. */
    step: (count: number) => number;
  },
  mine: { pending: Point; landing: number },
  plateChips: Point,
  seatChipsMax: number,
  activeChipsDrop: number,
  bar: BetGeometry["bar"],
): BetGeometry {
  const handCards = (count: number, placedAt: number | null) => {
    const total = count + (placedAt === null ? 0 : 1);
    return Array.from({ length: total }, (_, k) => layout.hand.slot(k, total));
  };
  return {
    pendingMine: (i, n) => tokenRow(mine.pending, i, n),
    pendingFelt: (i, n, count) => tokenRow(felt.pending(count), i, n),
    feltSpot(g, count, placedAt) {
      const cards = layout.feltTimeline(count, placedAt);
      const spot = gapPoint(cards, g, placedAt, felt.step(count));
      if (!spot) return felt.pending(count);
      return over(spot, MINI_CARD.h, (felt.landing * spot.by[0]!.scale) / 2);
    },
    handSpot(g, count, placedAt) {
      const cards = handCards(count, placedAt);
      const step =
        cards.length > 1 ? cards[1]!.x - cards[0]!.x : HAND_CARD.w * 1.1;
      const spot = gapPoint(cards, g, placedAt, step);
      if (!spot) return mine.pending;
      return over(spot, HAND_CARD.h, mine.landing);
    },
    plateChips,
    seatChipsMax,
    activeChipsDrop,
    bar,
  };
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

// ------------------------------------------------------- the stage layout

/** Where a status block goes, and how it sits there. */
export interface StatusSpot {
  x: number;
  y: number;
  w: number;
  /** "middle": y is the block's vertical centre; "top": its top edge. */
  anchor: "middle" | "top";
  align: "start" | "center";
  /** Lines the headline and the sub-line may take before their text shrinks. */
  lines: { headline: number; sub: number };
}

/** A mini card's place: its centre and, where it is tilted, its rotation. */
export type MiniPose = Point & { r?: number };

/** How the viewer's hand is laid out, and how it scrolls when it is too long to fit. */
export interface HandGeometry {
  /** Slot `k` of `total`, in hand units: stage units with the hand scrolled to its start. */
  slot(k: number, total: number): HandPose;
  /** The insertion index for hand x over `count` cards (see handInsertionIndex). */
  insertionIndex(x: number, count: number): number;
  /** The strip the hand scrolls in; null where every hand fits and nothing scrolls. */
  view: Box | null;
  /** How far a hand of `total` slots scrolls, in stage units. */
  maxScroll(total: number): number;
  /** The nearest scroll to `scroll` that shows all of slot `k` of `total`. */
  scrollToShow(scroll: number, k: number, total: number): number;
  /** Auto-scroll speed, in units per second, for a card held over the hand at stage x. */
  edgeSpeed(x: number): number;
}

/**
 * Everything about where things go on one shape of screen: the landscape
 * stage of the design, or the portrait one of portrait.ts. Scene and Stage
 * read it and never ask which one it is.
 */
export interface StageLayout {
  kind: "landscape" | "portrait";
  stage: { w: number; h: number };
  table: Box;
  deck: Box;
  /** Where undealt cards wait. */
  deckCentre: Point;
  goalLabel: Box;
  mysteryHome: Pose;
  mysteryDeal: Pose;
  discardExit: Pose;
  dropZone: Box;
  /** A held card counts as over the hand once its centre is below this. */
  dropLineY: number;
  ruler: Box;
  plate: { x: number; bottom: number; w: number };
  status: Record<StatusPlace, StatusSpot>;
  /** The chat card; a drawer is closed until opened from the tools. */
  chat: { box: Box; drawer: boolean };
  /** A corner for the screen's own buttons (sound, chat), if the header has no room for them. */
  tools: Box | null;
  hand: HandGeometry;
  /** One spot per opponent, clockwise from the viewer. */
  opponents: OpponentSpot[];
  /** Where an opponent's cards rest at their seat. */
  miniTimeline(spot: OpponentSpot, count: number): MiniPose[];
  /** Where the status goes while a line of `count` cards is on the felt. */
  feltStatus(count: number): StatusPlace;
  feltTimeline(count: number, placedAt?: number | null): FeltCard[];
  feltGapBox(g: number, count: number): Box;
  bets: BetGeometry;
}

const LANDSCAPE_HAND: HandGeometry = {
  slot: handSlot,
  insertionIndex: handInsertionIndex,
  view: null,
  maxScroll: () => 0,
  scrollToShow: () => 0,
  edgeSpeed: () => 0,
};

/** Where the design's felt line puts pending tokens: centred over the line, above its cards. */
function feltPending(count: number): Point {
  const row = feltTimeline(count);
  const { y, scale } = feltLayout(count);
  const x = row.length ? (row[0]!.x + row.at(-1)!.x) / 2 : feltGapX(0, count);
  return {
    x,
    y:
      y - (MINI_CARD.h / 2) * scale - (FELT_PENDING_ABOVE * scale) / FELT_SCALE,
  };
}

/** The design's stage for `opponents` opponents. */
export function landscapeLayout(opponents: number): StageLayout {
  const lines = { headline: 2, sub: 3 };
  const parts = {
    feltTimeline,
    hand: LANDSCAPE_HAND,
  };
  return {
    kind: "landscape",
    stage: STAGE,
    table: TABLE_BOX,
    deck: DECK_BOX,
    deckCentre: {
      x: DECK_BOX.x + DECK_BOX.w / 2,
      y: DECK_BOX.y + DECK_BOX.h / 2,
    },
    goalLabel: GOAL_LABEL_BOX,
    mysteryHome: MYSTERY_HOME,
    mysteryDeal: MYSTERY_DEAL,
    discardExit: DISCARD_EXIT,
    dropZone: DROP_ZONE,
    dropLineY: DROP_LINE_Y,
    ruler: TIMELINE_ARROW_BOX,
    plate: PLATE,
    status: {
      mine: { ...STATUS_BOX.mine, anchor: "middle", align: "start", lines },
      opponent: {
        ...STATUS_BOX.opponent,
        anchor: "middle",
        align: "start",
        lines,
      },
      // Under a long felt line there is width to spare but little height.
      under: {
        ...STATUS_BOX.under,
        anchor: "top",
        align: "center",
        lines: { headline: 1, sub: 2 },
      },
      // The bar floats under the felt here, so the status stays where the felt puts it.
      betting: {
        ...STATUS_BOX.opponent,
        anchor: "middle",
        align: "start",
        lines,
      },
    },
    chat: { box: CHAT_BOX, drawer: false },
    tools: null,
    hand: LANDSCAPE_HAND,
    opponents: opponentSpots(opponents),
    miniTimeline,
    feltStatus: (count) => feltLayout(count).status,
    feltTimeline,
    feltGapBox,
    bets: betGeometry(
      parts,
      {
        pending: feltPending,
        landing: FELT_LANDING_ABOVE,
        step: (count) =>
          (FELT_STEP_PLACED / FELT_SCALE) * feltLayout(count).scale,
      },
      { pending: MY_PENDING, landing: HAND_LANDING_ABOVE },
      { x: 3.2, y: STAGE.h - 1.2 - PLATE_CHIP / 2 },
      4,
      // Beside the seat card, the chips clear it on its turn too.
      0,
      // Clear of the chat on the right; on the left the plate is lower down.
      {
        kind: "floating",
        at: { x: 50, y: 43.4 },
        left: 3,
        right: CHAT_BOX.x - 1.5,
      },
    ),
  };
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
