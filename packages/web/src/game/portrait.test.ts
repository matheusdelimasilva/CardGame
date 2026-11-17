import { describe, expect, it } from "vitest";
import { HAND_CARD, MINI_CARD, SEAT_CARD, type OpponentSpot } from "./layout";
import { dropTarget } from "./placement";
import {
  EDGE_SPEED,
  EDGE_ZONE,
  PORTRAIT_HEADER,
  PORTRAIT_MAX_UNIT,
  PORTRAIT_W,
  portraitLayout,
  portraitMinHeight,
  stageShape,
} from "./portrait";
import type { Box } from "./types";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** Touching edges, to rounding, do not count. */
const overlaps = (a: Box, b: Box, e = 1e-9) =>
  a.x < b.x + b.w - e &&
  b.x < a.x + a.w - e &&
  a.y < b.y + b.h - e &&
  b.y < a.y + a.h - e;
const inside = (a: Box, b: Box) =>
  a.x >= b.x - 1e-9 &&
  a.y >= b.y - 1e-9 &&
  a.x + a.w <= b.x + b.w + 1e-9 &&
  a.y + a.h <= b.y + b.h + 1e-9;
const around = (p: { x: number; y: number }, w: number, h: number): Box => ({
  x: p.x - w / 2,
  y: p.y - h / 2,
  w,
  h,
});

/** A seat card's reach at its tilt (up to 3°), larger and lower on its turn, as cards.css draws it. */
function seatReach(spot: OpponentSpot, active: boolean): Box {
  const s = spot.scale;
  const grow = active ? 1.12 : 1;
  const ring = active ? 0.65 * s : 0;
  const rad = (3 * Math.PI) / 180;
  const hw = (SEAT_CARD.w / 2) * s * grow;
  const hh = (SEAT_CARD.h / 2) * s * grow;
  const rx = hw * Math.cos(rad) + hh * Math.sin(rad) + ring;
  const ry = hh * Math.cos(rad) + hw * Math.sin(rad) + ring;
  const y = spot.seat.y + (active ? 0.75 * s : 0);
  return { x: spot.seat.x - rx, y: y - ry, w: 2 * rx, h: 2 * ry };
}

/** Phones from 360×640 to 430×932, in a browser (toolbars take some height) and full screen. */
const PHONES = [
  [360, 560],
  [360, 640],
  [375, 548],
  [375, 812],
  [390, 664],
  [390, 844],
  [430, 740],
  [430, 932],
] as const;
const layoutsFor = (opponents: number) =>
  PHONES.map(([w, h]) => {
    const shape = stageShape(w, h, opponents);
    if (shape.kind !== "portrait") throw new Error(`${w}×${h} is not portrait`);
    return { shape, layout: portraitLayout(shape.height, opponents) };
  });

describe("stageShape", () => {
  it("gives every phone held upright the portrait stage, filling its width while there is height", () => {
    for (const [w, h] of PHONES) {
      const shape = stageShape(w, h, 4);
      expect(shape.kind).toBe("portrait");
      if (shape.kind !== "portrait") continue;
      expect(shape.unit * shape.height).toBeCloseTo(h, 6);
      if (h / w >= 1.8) expect(shape.unit).toBeCloseTo(w / PORTRAIT_W, 6);
    }
  });

  it("shrinks the units on a short screen so the stage still fits", () => {
    const shape = stageShape(360, 520, 8);
    expect(shape.kind).toBe("portrait");
    if (shape.kind !== "portrait") return;
    expect(shape.unit).toBeLessThan(360 / PORTRAIT_W);
    expect(shape.height).toBeCloseTo(portraitMinHeight(8), 6);
  });

  it("keeps the landscape stage for windows wider than tall and for large tablets", () => {
    expect(stageShape(844, 390, 4).kind).toBe("landscape");
    expect(stageShape(1280, 800, 4).kind).toBe("landscape");
    expect(stageShape(1024, 1366, 4).kind).toBe("landscape");
  });

  it("gives small tablets held upright the portrait stage, its units capped", () => {
    for (const [w, h] of [
      [768, 1024],
      [834, 1194],
    ]) {
      const shape = stageShape(w!, h!, 7);
      expect(shape.kind).toBe("portrait");
      if (shape.kind === "portrait")
        expect(shape.unit).toBeLessThanOrEqual(PORTRAIT_MAX_UNIT);
    }
  });
});

describe("portrait seats", () => {
  for (let n = 1; n <= 8; n++)
    it(`seats ${n} opponent(s) under the header, on the stage, apart whoever's turn it is`, () => {
      for (const { layout } of layoutsFor(n)) {
        const spots = layout.opponents;
        expect(spots).toHaveLength(n);
        // Clockwise: left to right.
        for (let i = 1; i < n; i++)
          expect(spots[i]!.seat.x).toBeGreaterThan(spots[i - 1]!.seat.x);
        for (const spot of spots) {
          for (const active of [false, true]) {
            const seat = seatReach(spot, active);
            expect(seat.x).toBeGreaterThanOrEqual(0);
            expect(seat.x + seat.w).toBeLessThanOrEqual(PORTRAIT_W);
            expect(seat.y).toBeGreaterThanOrEqual(PORTRAIT_HEADER);
            // Clear of the deck and the status beside it.
            expect(seat.y + seat.h).toBeLessThanOrEqual(layout.deck.y);
            for (const other of spots)
              if (other !== spot)
                expect(overlaps(seat, seatReach(other, false))).toBe(false);
          }
          // Names stay readable: seat cards are never under 85% of the design's.
          expect(spot.scale).toBeGreaterThanOrEqual(0.85);
        }
      }
    });

  it("piles each opponent's cards behind their seat card, the newest on top and fanned", () => {
    const { layout } = layoutsFor(4)[3]!;
    const spot = layout.opponents[1]!;
    const pile = layout.miniTimeline(spot, 6);
    expect(pile).toHaveLength(6);
    expect(spot.lane.place).toBe("pile");
    for (const card of pile)
      expect(
        overlaps(
          around(card, MINI_CARD.w * spot.scale, MINI_CARD.h * spot.scale),
          seatReach(spot, false),
        ),
      ).toBe(true);
    expect(new Set(pile.slice(0, 4).map((p) => p.x)).size).toBe(1);
    expect(pile[5]!.x).toBeGreaterThan(pile[4]!.x);
    expect(layout.miniTimeline(spot, 0)).toEqual([]);
  });
});

describe("the portrait felt", () => {
  it("puts the deck, the card's home and the status inside the felt, clear of each other", () => {
    for (let n = 1; n <= 8; n++)
      for (const { layout } of layoutsFor(n)) {
        const felt: Box = {
          x: layout.table.x + 1.6,
          y: layout.table.y + 1.6,
          w: layout.table.w - 3.2,
          h: layout.table.h - 3.2,
        };
        const home = around(layout.mysteryHome, HAND_CARD.w, HAND_CARD.h);
        expect(inside(layout.deck, felt)).toBe(true);
        expect(inside(home, felt)).toBe(true);
        expect(overlaps(home, layout.deck)).toBe(false);
        const beside = layout.status.opponent;
        expect(beside.x).toBeGreaterThanOrEqual(layout.deck.x + layout.deck.w);
        expect(beside.x + beside.w).toBeLessThanOrEqual(felt.x + felt.w);
        const mine = layout.status.mine;
        expect(mine.y).toBeGreaterThan(layout.goalLabel.y + layout.goalLabel.h);
        expect(mine.x).toBeGreaterThanOrEqual(felt.x);
        expect(mine.x + mine.w).toBeLessThanOrEqual(felt.x + felt.w);
      }
  });

  it("lays the active opponent's line out under the deck, up to ten cards and the placed one", () => {
    for (const n of [1, 5, 8])
      for (const { layout } of layoutsFor(n)) {
        const felt: Box = {
          x: layout.table.x + 1.6,
          y: layout.table.y + 1.6,
          w: layout.table.w - 3.2,
          h: layout.table.h - 3.2,
        };
        for (let count = 0; count <= 10; count++) {
          const line = layout.feltTimeline(count);
          for (const placedAt of [null, 0, count]) {
            const cards = layout.feltTimeline(count, placedAt);
            expect(cards).toHaveLength(count + (placedAt === null ? 0 : 1));
            const boxes = cards.map((c) =>
              around(c, MINI_CARD.w * c.scale, MINI_CARD.h * c.scale),
            );
            for (const [i, box] of boxes.entries()) {
              expect(inside(box, felt)).toBe(true);
              expect(box.y).toBeGreaterThan(
                layout.goalLabel.y + layout.goalLabel.h,
              );
              // At least as large as the design's seat lines; in reading order.
              expect(cards[i]!.scale).toBeGreaterThanOrEqual(1);
              for (const other of boxes.slice(i + 1))
                expect(overlaps(box, other)).toBe(false);
              if (i > 0) {
                const [a, b] = [cards[i - 1]!, cards[i]!];
                expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true);
              }
            }
          }
          // Room for a gap button at both ends and between neighbours (for bets).
          const gaps = range(count + 1).map((g) => layout.feltGapBox(g, count));
          for (const gap of gaps) {
            expect(inside(gap, felt)).toBe(true);
            for (const card of line)
              expect(
                overlaps(
                  gap,
                  around(
                    card,
                    MINI_CARD.w * card.scale,
                    MINI_CARD.h * card.scale,
                  ),
                ),
              ).toBe(false);
          }
          for (let g = 1; g < gaps.length; g++)
            expect(overlaps(gaps[g - 1]!, gaps[g]!)).toBe(false);
        }
      }
  });
});

describe("the portrait hand", () => {
  it("draws its slots apart, as large as the design's cards and wide enough for a thumb", () => {
    for (const n of [1, 8])
      for (const { shape, layout } of layoutsFor(n)) {
        const { hand } = layout;
        const step = hand.slot(1, 5).x - hand.slot(0, 5).x;
        expect(step * shape.unit).toBeGreaterThanOrEqual(44);
        expect(hand.slot(0, 5).scale).toBeGreaterThanOrEqual(1);
        expect(step).toBeGreaterThan(HAND_CARD.w * hand.slot(0, 5).scale);
      }
  });

  it("centres a hand that fits and scrolls one that does not", () => {
    const { hand } = layoutsFor(4)[3]!.layout;
    expect(hand.maxScroll(3)).toBe(0);
    expect(hand.slot(0, 1).x).toBeCloseTo(PORTRAIT_W / 2, 9);
    expect(hand.maxScroll(10)).toBeGreaterThan(0);
    expect(hand.maxScroll(10)).toBeGreaterThan(hand.maxScroll(6));
  });

  it("keeps the hand clear of the felt's contents, the ruler and the plate", () => {
    for (let n = 1; n <= 8; n++)
      for (const { layout } of layoutsFor(n)) {
        const scale = layout.hand.slot(0, 1).scale;
        const top = layout.hand.slot(0, 1).y - (HAND_CARD.h / 2) * scale;
        const bottom = top + HAND_CARD.h * scale;
        expect(top).toBeGreaterThan(layout.table.y + layout.table.h);
        expect(bottom).toBeLessThan(layout.ruler.y);
        expect(layout.ruler.y + layout.ruler.h).toBeLessThan(layout.tools!.y);
        expect(layout.dropLineY).toBeLessThan(top);
        // Any felt line's lowest card is above the drop line, so it is never mistaken for the hand.
        const line = layout.feltTimeline(10, 3);
        for (const c of line)
          expect(c.y + (MINI_CARD.h / 2) * c.scale).toBeLessThan(
            layout.dropLineY + 3,
          );
        // The chat drawer never covers the hand.
        expect(layout.chat.box.y + layout.chat.box.h).toBeLessThan(top);
      }
  });

  it("drops where the slot is drawn, at any scroll", () => {
    const { layout } = layoutsFor(5)[2]!;
    const { hand } = layout;
    for (let count = 0; count <= 9; count++) {
      const total = count + 1;
      const max = hand.maxScroll(total);
      for (const scroll of [0, max / 3, max]) {
        // The slots as the stage draws them: hand units, less the scroll.
        const drawn = range(total).map((k) => hand.slot(k, total).x - scroll);
        const y = hand.slot(0, total).y;
        for (const [i, x] of drawn.entries())
          expect(dropTarget({ x, y }, count, layout, scroll)).toBe(i);
        for (let i = 1; i < drawn.length; i++) {
          const edge = (drawn[i - 1]! + drawn[i]!) / 2;
          expect(dropTarget({ x: edge - 0.01, y }, count, layout, scroll)).toBe(
            i - 1,
          );
          expect(dropTarget({ x: edge + 0.01, y }, count, layout, scroll)).toBe(
            i,
          );
        }
        expect(
          dropTarget(
            { x: drawn[0]!, y: layout.dropLineY - 0.1 },
            count,
            layout,
            scroll,
          ),
        ).toBeNull();
      }
    }
  });

  it("scrolls the least that shows a whole slot", () => {
    const { hand } = layoutsFor(4)[3]!.layout;
    const view = hand.view!;
    const total = 10;
    const max = hand.maxScroll(total);
    for (const k of range(total))
      for (const from of [0, max / 2, max]) {
        const s = hand.scrollToShow(from, k, total);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(max);
        const { x, scale } = hand.slot(k, total);
        const half = (HAND_CARD.w / 2) * scale;
        expect(x - half - s).toBeGreaterThanOrEqual(view.x);
        expect(x + half - s).toBeLessThanOrEqual(view.x + view.w);
        // Already in view: no scroll at all.
        expect(hand.scrollToShow(s, k, total)).toBeCloseTo(s, 9);
      }
  });

  it("scrolls under a card held near either edge, faster closer to it", () => {
    const { hand } = layoutsFor(4)[3]!.layout;
    const view = hand.view!;
    expect(hand.edgeSpeed(view.x + view.w / 2)).toBe(0);
    expect(hand.edgeSpeed(view.x + EDGE_ZONE + 0.1)).toBe(0);
    expect(hand.edgeSpeed(view.x)).toBe(-EDGE_SPEED);
    expect(hand.edgeSpeed(view.x + view.w)).toBe(EDGE_SPEED);
    expect(hand.edgeSpeed(view.x + view.w - 1)).toBeGreaterThan(
      hand.edgeSpeed(view.x + view.w - 3),
    );
    expect(hand.edgeSpeed(view.x + view.w + 5)).toBe(EDGE_SPEED);
  });
});

describe("the portrait bottom row", () => {
  it("keeps the plate, the tools and the stage's edges apart", () => {
    for (const { layout } of layoutsFor(4)) {
      const tools = layout.tools!;
      expect(layout.plate.x + layout.plate.w).toBeLessThan(tools.x);
      expect(tools.x + tools.w).toBeLessThanOrEqual(PORTRAIT_W);
      expect(tools.y + tools.h).toBeLessThanOrEqual(layout.stage.h);
      expect(layout.chat.drawer).toBe(true);
    }
  });
});
