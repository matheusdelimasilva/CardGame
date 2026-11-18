/**
 * The stage for a phone held upright. The design only covers landscape, so
 * this restacks its parts top to bottom, in the same units and the same
 * cards: the header; the opponents' seats in one or two rows along the top
 * rail of a tall table, each with their cards piled behind the seat card;
 * on the felt the deck with the mystery card's home beside it, and under
 * them the room for the status or the active opponent's timeline; the
 * viewer's hand as one row of large cards that scrolls sideways when it
 * does not fit; the plate, the sound switch and the chat button at the
 * bottom. The stage is PORTRAIT_W units wide and as tall as the screen.
 */
import {
  HAND_CARD,
  MINI_CARD,
  betGeometry,
  insertionIndex,
  type FeltCard,
  type HandGeometry,
  type HandPose,
  type MiniPose,
  type OpponentSpot,
  type StageLayout,
  type StatusSpot,
} from "./layout";
import type { Box } from "./types";

export const PORTRAIT_W = 42;
/**
 * A window taller than wide gets the portrait stage when that draws the
 * table this much larger than the landscape one: every phone held upright,
 * and small tablets, where the landscape stage would leave the cards too
 * small to read; a large tablet keeps the design's stage.
 */
export const PORTRAIT_GAIN = 1.4;
/** On a tablet larger units would only blow the cards up: the stage is centred instead. */
export const PORTRAIT_MAX_UNIT = 14;
/** The compact header's height; nothing on the stage reaches into it. */
export const PORTRAIT_HEADER = 6.4;
const CENTRE = PORTRAIT_W / 2;

/** What the window's size makes of the stage. */
export type StageShape =
  | { kind: "landscape" }
  | {
      kind: "portrait";
      /** Pixels per stage unit. */
      unit: number;
      /** The stage's height in units. */
      height: number;
    };

/**
 * The stage for a window `width` × `height` pixels with `opponents`
 * opponents. The portrait stage fills the width, unless the window is too
 * short for its parts: then its units shrink so it still fits the height.
 */
export function stageShape(
  width: number,
  height: number,
  opponents: number,
): StageShape {
  if (height <= width) return { kind: "landscape" };
  const unit = Math.min(
    width / PORTRAIT_W,
    height / portraitMinHeight(opponents),
    PORTRAIT_MAX_UNIT,
  );
  // The landscape stage's unit, as game.css sets it.
  const landscape = Math.min(width / 100, height / 62.5);
  return unit >= landscape * PORTRAIT_GAIN
    ? { kind: "portrait", unit, height: height / unit }
    : { kind: "landscape" };
}

// ------------------------------------------------------------------ seats

/** How far a seat card at scale 1, tilted up to 3°, reaches from its centre (cards.css). */
const TILT_COS = Math.cos((3 * Math.PI) / 180);
const TILT_SIN = Math.sin((3 * Math.PI) / 180);
const SEAT_HALF = {
  w: 3.2 * TILT_COS + 4.3 * TILT_SIN,
  h: 4.3 * TILT_COS + 3.2 * TILT_SIN,
};
/** On its player's turn a seat card grows 12% around a centre 0.75 lower, ringed 0.65 in gold. */
const ACTIVE = { grow: 1.12, drop: 0.75, ring: 0.65 };
const ACTIVE_HALF_H = SEAT_HALF.h * ACTIVE.grow + ACTIVE.ring;

/** Seat rows start this far under the header. */
const SEAT_TOP_GAP = 0.2;
/** Five opponents fit one row at a little under full size; six or more take two rows. */
const ONE_ROW_MAX = 5;
const ONE_ROW_SCALE = (n: number) => (n <= 4 ? 1 : 0.92);
const TWO_ROW_SCALE = 0.85;
const SEAT_PITCH_MAX = 12;
const SEAT_SPAN = 40;
/**
 * The rows' seat cards overlap sideways, so one row starts where the other's
 * reach ends, either way round: a far seat on its turn above a near one, or
 * a near seat on its turn under a far one.
 */
const ROW_PITCH = Math.max(
  ACTIVE.drop + ACTIVE_HALF_H + SEAT_HALF.h,
  SEAT_HALF.h + ACTIVE_HALF_H - ACTIVE.drop,
);

interface SeatRows {
  /** Seat centres, clockwise (left to right). */
  seats: { x: number; y: number }[];
  scale: number;
  /** The row on the table's rail. */
  nearY: number;
}

/** Top edge of a seat row whose cards, on their turn too, stay under the header. */
const firstRowY = (scale: number) =>
  PORTRAIT_HEADER +
  SEAT_TOP_GAP +
  Math.max(SEAT_HALF.h, ACTIVE_HALF_H - ACTIVE.drop) * scale;

const evenly = (count: number, pitch: number) =>
  Array.from(
    { length: count },
    (_, i) => CENTRE + (i - (count - 1) / 2) * pitch,
  );

function seatRows(count: number): SeatRows {
  const n = Math.max(1, Math.min(8, Math.round(count)));
  if (n <= ONE_ROW_MAX) {
    const scale = ONE_ROW_SCALE(n);
    const y = firstRowY(scale);
    return {
      seats: evenly(n, Math.min(SEAT_PITCH_MAX, SEAT_SPAN / n)).map((x) => ({
        x,
        y,
      })),
      scale,
      nearY: y,
    };
  }
  const scale = TWO_ROW_SCALE;
  const farY = firstRowY(scale);
  const nearY = farY + ROW_PITCH * scale;
  const near = Math.ceil(n / 2);
  const far = n - near;
  const pitch = Math.min(SEAT_PITCH_MAX, (SEAT_SPAN - 2) / near);
  const base = evenly(near, pitch);
  // One fewer far seat sits in the gaps; as many are staggered a quarter pitch.
  const shift = far === near ? pitch / 4 : 0;
  const nearXs = base.map((x) => x - shift);
  const farXs =
    far === near
      ? base.map((x) => x + shift)
      : base.slice(1).map((x) => x - pitch / 2);
  const seats = [
    ...nearXs.map((x) => ({ x, y: nearY })),
    ...farXs.map((x) => ({ x, y: farY })),
  ].sort((a, b) => a.x - b.x);
  return { seats, scale, nearY };
}

/** The lowest any seat card of these rows reaches, whoever's turn it is. */
const rowsBottom = (rows: SeatRows) =>
  rows.nearY + (ACTIVE.drop + ACTIVE_HALF_H) * rows.scale;

/** Cards rest behind the seat card's right edge, the newest three fanned. */
const PILE = { x: 3, y: -1.3, step: 0.3, tilt: 8, fan: 6 } as const;

function seatSpot(seat: { x: number; y: number }, scale: number): OpponentSpot {
  const w = 6.4 * scale;
  const h = 8.6 * scale;
  const at = { x: seat.x + PILE.x * scale, y: seat.y + PILE.y * scale };
  return {
    seat,
    scale,
    // Just under the seat card, clear of its score: between the two rows there is room for a chip.
    tokens: { x: seat.x - w / 2, y: seat.y + h / 2 + 0.1 * scale },
    lane: {
      x: at.x - MINI_CARD.w * scale,
      y: at.y - MINI_CARD.h * scale,
      w: 2 * MINI_CARD.w * scale,
      h: 2 * MINI_CARD.h * scale,
      place: "pile",
      rows: 1,
    },
  };
}

/** A seat's pile: every card at the same spot, the newest three fanned out a little. */
function pile(spot: OpponentSpot, count: number): MiniPose[] {
  const { lane, scale } = spot;
  const at = { x: lane.x + lane.w / 2, y: lane.y + lane.h / 2 };
  return Array.from({ length: count }, (_, j) => {
    const fan = Math.max(0, j - (count - 3));
    return {
      x: at.x + fan * PILE.step * scale,
      y: at.y - fan * PILE.step * scale,
      r: PILE.tilt + fan * PILE.fan,
    };
  });
}

// --------------------------------------------------------------- the felt

const TABLE_X = 1;
const RAIL = 1.6;
/** Content keeps this far inside the felt. */
const FELT_PAD = 1;
const FELT_MIN_X = TABLE_X + RAIL + FELT_PAD;
const FELT_MAX_X = PORTRAIT_W - TABLE_X - RAIL - FELT_PAD;
/** The seats straddle the table's top rail. */
const TABLE_OVER_SEATS = 1;
const DECK_X = 4.4;
/** The deck's top under the seats; the room for the status or the felt line starts under its label. */
const ZONE_A_GAP = 0.5;
const ZONE_A_H = 14.6;
/** The felt line needs this much height for two rows at full size. */
const ZONE_B_MIN = 14;
/** The mystery card's home: right of the deck, near the middle. */
const HOME_X = 23;
/** The top of the felt line's room is kept for the tokens of bets waiting on it. */
const BET_ROW = 2.8;
/** Bet tokens land over a felt card's upper half rather than above it: the rows are close. */
const FELT_LANDING = -MINI_CARD.h / 2;
/** Above the hand's cards. */
const HAND_LANDING = 1.6;

/** The active opponent's line: as large as the felt allows, up to the design's size on the felt. */
const FELT_SCALES = [2, 1.8, 1.6, 1.4, 1.25, 1.1, 1];
/** Per unit of scale: card spacing (room for a gap button between cards), gap button size, row gap. */
const FELT_STEP = 3.3;
const FELT_GAP = { w: 1, h: 4.1 };
const FELT_ROW_GAP = 0.6;

interface FeltGrid {
  scale: number;
  perRow: number;
  rows: number;
  /** Centre of the first row. */
  top: number;
}

/**
 * Rows for a line of `count` cards, with room for the placed card too so
 * the rows hold still for the whole turn; the largest scale whose rows fit
 * the room's height.
 */
function feltGrid(count: number, zone: { top: number; bottom: number }) {
  const slots = count + 1;
  const width = FELT_MAX_X - FELT_MIN_X;
  const height = zone.bottom - zone.top;
  let grid: FeltGrid | null = null;
  for (const scale of FELT_SCALES) {
    const step = FELT_STEP * scale;
    const perRowMax = Math.max(
      1,
      Math.floor((width - FELT_GAP.w * scale) / step + 1e-9),
    );
    const rows = Math.ceil(slots / perRowMax);
    const pitch = (FELT_GAP.h + FELT_ROW_GAP) * scale;
    const block = (rows - 1) * pitch + FELT_GAP.h * scale;
    const top =
      zone.top + Math.max(0, (height - block) / 2) + (FELT_GAP.h * scale) / 2;
    grid = { scale, perRow: Math.ceil(slots / rows), rows, top };
    if (block <= height) break;
  }
  return grid!;
}

function feltCards(grid: FeltGrid, total: number): FeltCard[] {
  const { scale, perRow, top } = grid;
  const step = FELT_STEP * scale;
  const pitch = (FELT_GAP.h + FELT_ROW_GAP) * scale;
  const middle = (FELT_MIN_X + FELT_MAX_X) / 2;
  return Array.from({ length: total }, (_, j) => {
    const row = Math.floor(j / perRow);
    const length = Math.min(perRow, total - row * perRow);
    return {
      x: middle + ((j % perRow) - (length - 1) / 2) * step,
      y: top + row * pitch,
      scale,
    };
  });
}

// --------------------------------------------------------------- the hand

/** Hand cards are a little larger than the design's: titles stay readable on a phone. */
export const PORTRAIT_HAND_SCALE = 1.12;
const HAND_W = HAND_CARD.w * PORTRAIT_HAND_SCALE;
const HAND_H = HAND_CARD.h * PORTRAIT_HAND_SCALE;
const HAND_GAP = 0.6;
const HAND_STEP = HAND_W + HAND_GAP;
/** Room at each end of the scrolled row, and around a slot scrolled into view. */
const HAND_PAD = 1;
/** Within this distance of the screen's edge a held card scrolls the hand, up to this fast. */
export const EDGE_ZONE = 5;
export const EDGE_SPEED = 40;

const handWidth = (total: number) => total * HAND_W + (total - 1) * HAND_GAP;

function handGeometry(y: number, view: Box): HandGeometry {
  const maxScroll = (total: number) =>
    Math.max(0, handWidth(total) + 2 * HAND_PAD - view.w);
  const slot = (k: number, total: number): HandPose => {
    const start =
      maxScroll(total) > 0
        ? view.x + HAND_PAD
        : view.x + (view.w - handWidth(total)) / 2;
    return {
      x: start + HAND_W / 2 + k * HAND_STEP,
      y,
      r: 0,
      scale: PORTRAIT_HAND_SCALE,
    };
  };
  return {
    slot,
    insertionIndex: (x, count) => insertionIndex(slot, x, count),
    view,
    maxScroll,
    scrollToShow(scroll, k, total) {
      const { x } = slot(k, total);
      const left = x - HAND_W / 2 - HAND_PAD - view.x;
      const right = x + HAND_W / 2 + HAND_PAD - view.x - view.w;
      const wanted = Math.min(Math.max(scroll, right), left);
      return Math.max(0, Math.min(maxScroll(total), wanted));
    },
    edgeSpeed(x) {
      const into = Math.max(
        view.x + EDGE_ZONE - x,
        x - (view.x + view.w - EDGE_ZONE),
      );
      if (into <= 0) return 0;
      return (
        Math.sign(x - (view.x + view.w / 2)) *
        EDGE_SPEED *
        Math.min(1, into / EDGE_ZONE)
      );
    },
  };
}

// ------------------------------------------------------------- the layout

/** Room under the hand: the ruler, then the plate and the buttons. */
const BOTTOM = { ruler: 9.3, tools: 6.2, toolsH: 4.8, plate: 1.2 };
/** The hand's bottom edge clears the ruler; the table ends a little above its top. */
const HAND_BOTTOM = 9.6;
const TABLE_UNDER = 1.4;
const DROP_ABOVE_HAND = 3;
const TOOLS_W = 20;

/** Vertical structure shared by the layout and its minimum height. */
function zones(opponents: number) {
  const rows = seatRows(opponents);
  const zoneATop = rowsBottom(rows) + ZONE_A_GAP;
  return { rows, zoneATop, zoneBTop: zoneATop + ZONE_A_H };
}

/** The hand's top edge and what lies under it, measured from the stage's bottom. */
const HAND_TOP_FROM_BOTTOM = HAND_BOTTOM + HAND_H;
const ZONE_B_FROM_BOTTOM = HAND_TOP_FROM_BOTTOM + TABLE_UNDER + RAIL + 0.6;

/** The shortest stage, in units, that fits everything for `opponents` opponents. */
export function portraitMinHeight(opponents: number): number {
  return zones(opponents).zoneBTop + ZONE_B_MIN + ZONE_B_FROM_BOTTOM;
}

/** The portrait stage, `height` units tall (at least portraitMinHeight), for `opponents` opponents. */
export function portraitLayout(height: number, opponents: number): StageLayout {
  const h = Math.max(height, portraitMinHeight(opponents));
  const { rows, zoneATop, zoneBTop } = zones(opponents);
  const handTop = h - HAND_TOP_FROM_BOTTOM;
  const handY = handTop + HAND_H / 2;
  const tableTop = rows.nearY - TABLE_OVER_SEATS;
  const tableBottom = handTop - TABLE_UNDER;
  const zoneB = { top: zoneBTop, bottom: h - ZONE_B_FROM_BOTTOM };
  const feltZone = { top: zoneB.top + BET_ROW, bottom: zoneB.bottom };
  const deck: Box = { x: DECK_X, y: zoneATop, w: 8.4, h: 11.8 };
  const deckCentre = { x: deck.x + deck.w / 2, y: deck.y + deck.h / 2 };
  const statusMine: StatusSpot = {
    x: FELT_MIN_X + 0.4,
    y: (zoneB.top + zoneB.bottom) / 2,
    w: FELT_MAX_X - FELT_MIN_X - 0.8,
    anchor: "middle",
    align: "center",
    lines: { headline: 2, sub: 3 },
  };
  const opponentsSpots = rows.seats.map((seat) => seatSpot(seat, rows.scale));
  const view: Box = { x: 0, y: handTop - 1, w: PORTRAIT_W, h: HAND_H + 2 };
  const statusX = deck.x + deck.w + 1.6;
  // The viewer's chips sit at the ruler's left end; the ruler starts after them.
  const ruler: Box = { x: 14, y: h - BOTTOM.ruler, w: PORTRAIT_W - 20, h: 1.9 };
  const hand = handGeometry(handY, view);
  const feltTimeline = (count: number, placedAt: number | null = null) =>
    feltCards(feltGrid(count, feltZone), count + (placedAt === null ? 0 : 1));
  return {
    kind: "portrait",
    stage: { w: PORTRAIT_W, h },
    table: {
      x: TABLE_X,
      y: tableTop,
      w: PORTRAIT_W - 2 * TABLE_X,
      h: tableBottom - tableTop,
    },
    deck,
    deckCentre,
    goalLabel: {
      x: deck.x - 2,
      y: deck.y + deck.h + 0.6,
      w: deck.w + 4,
      h: 1.6,
    },
    mysteryHome: { x: HOME_X, y: deckCentre.y, r: -3 },
    mysteryDeal: { x: deckCentre.x, y: deckCentre.y - 1, r: 0 },
    discardExit: { x: PORTRAIT_W + 8, y: deckCentre.y, r: 70 },
    dropZone: {
      x: 0.6,
      y: handTop - 1,
      w: PORTRAIT_W - 1.2,
      h: HAND_H + 1.6,
    },
    dropLineY: handTop - DROP_ABOVE_HAND,
    ruler,
    plate: {
      x: 1.2,
      bottom: BOTTOM.plate,
      w: PORTRAIT_W - TOOLS_W - 1 - 2.2,
    },
    status: {
      mine: statusMine,
      under: statusMine,
      opponent: {
        x: statusX,
        y: deckCentre.y,
        w: FELT_MAX_X - statusX,
        anchor: "middle",
        align: "start",
        lines: { headline: 2, sub: 3 },
      },
      // Over the bet bar's buttons, from the top of the deck's row.
      betting: {
        x: statusX,
        y: zoneATop + 0.3,
        w: FELT_MAX_X - statusX,
        anchor: "top",
        align: "start",
        lines: { headline: 1, sub: 2 },
      },
    },
    chat: {
      box: {
        x: 1,
        y: PORTRAIT_HEADER + 0.4,
        w: PORTRAIT_W - 2,
        h: Math.min(34, Math.max(24, h * 0.5 - PORTRAIT_HEADER)),
      },
      drawer: true,
    },
    tools: {
      x: PORTRAIT_W - 1 - TOOLS_W,
      y: h - BOTTOM.tools,
      w: TOOLS_W,
      h: BOTTOM.toolsH,
    },
    hand,
    opponents: opponentsSpots,
    miniTimeline: pile,
    feltStatus: () => "opponent",
    feltTimeline,
    feltGapBox(g, count) {
      const grid = feltGrid(count, feltZone);
      const { scale, perRow } = grid;
      const step = FELT_STEP * scale;
      const w = FELT_GAP.w * scale;
      const gh = FELT_GAP.h * scale;
      const cards = feltCards(grid, count);
      // A gap opening a row is drawn at the end of the row before it.
      const before = g > 0 && (g === count || g % perRow === 0);
      const card = before ? cards[g - 1] : cards[g];
      const x = card
        ? card.x + (before ? step : -step) / 2
        : (FELT_MIN_X + FELT_MAX_X) / 2;
      const y = card ? card.y : grid.top;
      return { x: x - w / 2, y: y - gh / 2, w, h: gh };
    },
    bets: betGeometry(
      { feltTimeline, hand },
      {
        pending: () => ({
          x: (FELT_MIN_X + FELT_MAX_X) / 2,
          y: zoneB.top + BET_ROW / 2,
        }),
        landing: FELT_LANDING,
        step: (count) => FELT_STEP * feltGrid(count, feltZone).scale,
      },
      {
        // Under the card's home, a little right so a long row clears the deck's label.
        pending: { x: HOME_X + 2, y: deck.y + deck.h + 1.4 },
        landing: HAND_LANDING,
      },
      { x: 1.4, y: ruler.y + ruler.h / 2 },
      // Four and a count would reach past the stage at the rightmost seat.
      3,
      // Under the seat card, they keep clear of its lower edge on its turn.
      ACTIVE.drop + SEAT_HALF.h * (ACTIVE.grow - 1),
      { kind: "status" },
    ),
  };
}
