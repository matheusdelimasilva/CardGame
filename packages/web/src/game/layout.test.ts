import { describe, expect, it } from "vitest";
import {
  CHAT_BOX,
  DECK_BOX,
  DROP_LINE_Y,
  HAND_BAND,
  HAND_CARD,
  HAND_MIN_SCALE,
  HEADER_CLEARANCE,
  MAX_OPPONENTS,
  MINI_CARD,
  PLATE,
  SEAT_CARD,
  STAGE,
  STATUS_BOX,
  TABLE_BOX,
  decadeColor,
  feltGapBox,
  gapPoint,
  landscapeLayout,
  stackOffset,
  feltGapX,
  feltLayout,
  feltTimeline,
  handCardWithGap,
  handInsertionIndex,
  handSlot,
  miniTimeline,
  opponentSpots,
  placeAt,
  rotatedHalfWidth,
  seatCardBox,
  u,
  type OpponentSpot,
} from "./layout";
import { dropTarget } from "./placement";
import type { Box, Point } from "./types";

/** The design's fan, copied from docs/design/game-screen.dc.html. */
const mockSlot = (k: number, total: number) => {
  const rel = k - (total - 1) / 2;
  return { x: 50 + rel * 9, y: 53 + rel * rel * 0.3, r: rel * 3 };
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("handSlot", () => {
  it("matches the design for up to six slots", () => {
    for (let total = 1; total <= 6; total++)
      for (const k of range(total)) {
        const got = handSlot(k, total);
        const want = mockSlot(k, total);
        expect(got.x).toBeCloseTo(want.x, 10);
        expect(got.y).toBeCloseTo(want.y, 10);
        expect(got.r).toBeCloseTo(want.r, 10);
        expect(got.scale).toBe(1);
      }
  });

  it("keeps the band between the player plate and the chat", () => {
    expect(HAND_BAND.min).toBeGreaterThan(PLATE.x + PLATE.w);
    expect(HAND_BAND.max).toBeLessThan(CHAT_BOX.x);
  });

  it("keeps every card, tilt included, inside the band for up to eleven slots", () => {
    for (let total = 1; total <= 11; total++)
      for (const k of range(total)) {
        const { x, r, scale } = handSlot(k, total);
        const reach = rotatedHalfWidth(HAND_CARD, r) * scale;
        expect(x - reach).toBeGreaterThanOrEqual(HAND_BAND.min - 1e-9);
        expect(x + reach).toBeLessThanOrEqual(HAND_BAND.max + 1e-9);
      }
  });

  it("shrinks longer hands, never below the floor, the same for every card", () => {
    let last = 1;
    for (let total = 7; total <= 11; total++) {
      const scales = range(total).map((k) => handSlot(k, total).scale);
      expect(new Set(scales).size).toBe(1);
      expect(scales[0]!).toBeLessThan(1);
      expect(scales[0]!).toBeLessThanOrEqual(last);
      expect(scales[0]!).toBeGreaterThanOrEqual(HAND_MIN_SCALE);
      last = scales[0]!;
    }
  });

  it("does not overlap cards up to eight slots, and shows most of each up to ten", () => {
    for (let total = 2; total <= 10; total++) {
      const { scale } = handSlot(0, total);
      const step = handSlot(1, total).x - handSlot(0, total).x;
      const width = HAND_CARD.w * scale;
      if (total <= 8) expect(step).toBeGreaterThanOrEqual(width - 1e-9);
      else expect(step).toBeGreaterThanOrEqual(0.75 * width);
    }
  });

  it("caps tilt and keeps the bottom edge on the stage", () => {
    for (let total = 1; total <= 11; total++)
      for (const k of range(total)) {
        const { y, r, scale } = handSlot(k, total);
        expect(Math.abs(r)).toBeLessThanOrEqual(7.5 + 1e-9);
        // A rotated card's lowest corner, measured from its centre.
        const rad = (Math.abs(r) * Math.PI) / 180;
        const reach =
          ((HAND_CARD.w / 2) * Math.sin(rad) +
            (HAND_CARD.h / 2) * Math.cos(rad)) *
          scale;
        expect(y + reach).toBeLessThanOrEqual(STAGE.h);
      }
  });

  it("keeps a shrunken card's bottom edge where a full-size one's is", () => {
    const full = handSlot(0, 1);
    const small = handSlot(4, 9);
    expect(small.scale).toBeLessThan(1);
    expect(small.y + (HAND_CARD.h / 2) * small.scale).toBeCloseTo(
      full.y + HAND_CARD.h / 2,
      10,
    );
  });

  it("is symmetric and strictly increasing in x", () => {
    for (let total = 2; total <= 11; total++) {
      const xs = range(total).map((k) => handSlot(k, total).x);
      for (let k = 1; k < total; k++)
        expect(xs[k]!).toBeGreaterThan(xs[k - 1]!);
      expect(xs[0]! + xs.at(-1)!).toBeCloseTo(100, 10);
    }
  });
});

describe("handInsertionIndex", () => {
  /** The design's idxAt: how many cards of the unparted hand sit left of x. */
  const designIndex = (x: number, count: number) =>
    range(count).filter((k) => mockSlot(k, count).x < x).length;

  it("is the design's idxAt for up to five cards", () => {
    for (let count = 0; count <= 5; count++)
      for (let x = 0; x <= 100; x += 0.25)
        expect(handInsertionIndex(x, count)).toBe(designIndex(x, count));
  });

  it("targets the slot drawn under the pointer, each as wide as the slots are apart", () => {
    // Nine cards and the gap: the longest hand a card is ever dropped into.
    for (let count = 0; count <= 9; count++) {
      const slots = range(count + 1).map((i) => handSlot(i, count + 1).x);
      for (const [i, x] of slots.entries()) {
        expect(handInsertionIndex(x, count)).toBe(i);
        expect(dropTarget({ x, y: DROP_LINE_Y + 1 }, count)).toBe(i);
      }
      // Comfortably wide: the targets' edges are halfway between slots.
      for (let i = 1; i < slots.length; i++) {
        const edge = (slots[i - 1]! + slots[i]!) / 2;
        expect(handInsertionIndex(edge - 0.01, count)).toBe(i - 1);
        expect(handInsertionIndex(edge + 0.01, count)).toBe(i);
        expect(slots[i]! - slots[i - 1]!).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("never decreases as the pointer moves right", () => {
    for (const count of [1, 5, 9, 10]) {
      let last = 0;
      for (let x = 0; x <= 100; x += 0.5) {
        const index = handInsertionIndex(x, count);
        expect(index).toBeGreaterThanOrEqual(last);
        expect(index).toBeLessThanOrEqual(count);
        last = index;
      }
      expect(last).toBe(count);
    }
  });
});

describe("handCardWithGap", () => {
  it("lays cards out as one more slot, skipping the gap", () => {
    expect(handCardWithGap(0, 3, null)).toEqual(handSlot(0, 3));
    expect(handCardWithGap(0, 3, 1)).toEqual(handSlot(0, 4));
    expect(handCardWithGap(1, 3, 1)).toEqual(handSlot(2, 4));
  });
});

/**
 * A seat card's reach on screen at its tilt (up to 3°). While active it is
 * 12% larger, 0.75u lower and ringed 0.65u in gold, as cards.css draws it.
 */
function seatReach(spot: OpponentSpot, active: boolean): Box {
  const s = spot.scale;
  const grow = active ? 1.12 : 1;
  const ring = active ? 0.65 * s : 0;
  const centre = spot.seat.y + (active ? 0.75 * s : 0);
  const rad = (3 * Math.PI) / 180;
  const hw = (SEAT_CARD.w / 2) * s * grow;
  const hh = (SEAT_CARD.h / 2) * s * grow;
  const rx = hw * Math.cos(rad) + hh * Math.sin(rad) + ring;
  const ry = hh * Math.cos(rad) + hw * Math.sin(rad) + ring;
  return { x: spot.seat.x - rx, y: centre - ry, w: 2 * rx, h: 2 * ry };
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const miniBox = (p: Point, scale: number): Box => ({
  x: p.x - (MINI_CARD.w / 2) * scale,
  y: p.y - (MINI_CARD.h / 2) * scale,
  w: MINI_CARD.w * scale,
  h: MINI_CARD.h * scale,
});

describe("opponentSpots", () => {
  it("uses the design's spots for one to five opponents", () => {
    // The design's seat card: left x - 9.75, top y - 4.3, for spots at x.
    const lefts = (n: number) =>
      opponentSpots(n).map((s) => +seatCardBox(s).x.toFixed(2));
    expect(lefts(3)).toEqual([16.25, 40.25, 64.25]);
    // Five sit 0.6 right of the design's, so the first one's turn stays on the stage.
    expect(lefts(5)).toEqual([1.35, 21.1, 40.85, 60.6, 80.35]);
    for (let n = 1; n <= 5; n++)
      for (const spot of opponentSpots(n)) {
        expect(spot.scale).toBe(1);
        expect(seatCardBox(spot).y).toBeCloseTo(11.2, 10);
      }
  });

  it("clamps the count to 1–8", () => {
    expect(opponentSpots(0)).toHaveLength(1);
    expect(opponentSpots(12)).toHaveLength(MAX_OPPONENTS);
    expect(MAX_OPPONENTS).toBe(8);
  });

  it("seats the first and last of six or more at the ends of the table, the rest in the design's row", () => {
    const six = opponentSpots(6);
    const seven = opponentSpots(7);
    expect(six[0]!.lane.place).toBe("below");
    expect(six.at(-1)!.lane.place).toBe("below");
    expect(six.slice(1, -1).map((s) => s.seat)).toEqual(
      opponentSpots(4).map((s) => s.seat),
    );
    expect(seven.slice(1, -1).map((s) => s.seat)).toEqual(
      opponentSpots(5).map((s) => s.seat),
    );
    expect(six[0]!.seat.x + six.at(-1)!.seat.x).toBeCloseTo(STAGE.w, 10);
  });

  for (let n = 1; n <= 8; n++)
    it(`places ${n} opponent(s) clear of each other, the header, the chat and the stage's edges`, () => {
      const spots = opponentSpots(n);
      expect(spots).toHaveLength(n);
      for (const [i, spot] of spots.entries()) {
        for (const active of [false, true]) {
          const seat = seatReach(spot, active);
          expect(seat.x).toBeGreaterThanOrEqual(0);
          expect(seat.x + seat.w).toBeLessThanOrEqual(STAGE.w);
          expect(seat.y).toBeGreaterThanOrEqual(HEADER_CLEARANCE);
          // Whoever's turn it is, no seat touches another.
          for (const other of spots)
            if (other !== spot)
              expect(overlaps(seat, seatReach(other, false))).toBe(false);
        }
        // The lane is on the stage, clear of the chat and of the table's ends.
        const { lane } = spot;
        expect(lane.x).toBeGreaterThanOrEqual(0);
        expect(lane.x + lane.w).toBeLessThanOrEqual(STAGE.w);
        expect(overlaps(lane, CHAT_BOX)).toBe(false);
        if (lane.place === "below")
          expect(
            lane.x + lane.w <= TABLE_BOX.x ||
              lane.x >= TABLE_BOX.x + TABLE_BOX.w,
          ).toBe(true);
        // Its full line touches no seat card, its own included, whoever's turn it is.
        for (const p of miniTimeline(spot, 10)) {
          const card = miniBox(p, spot.scale);
          for (const [j, other] of spots.entries())
            expect(overlaps(card, seatReach(other, i !== j))).toBe(false);
        }
      }
    });
});

describe("miniTimeline", () => {
  it("uses the design's single row and spacing when there is room", () => {
    const spot = opponentSpots(3)[0]!;
    expect(miniTimeline(spot, 3)).toEqual([
      { x: 26 - 1.6, y: 15.5 },
      { x: 26 - 1.6 + 2.5, y: 15.5 },
      { x: 26 - 1.6 + 5, y: 15.5 },
    ]);
    expect(miniTimeline(spot, 0)).toEqual([]);
  });

  it("wraps a long line beside the seat into two even rows, older first", () => {
    const spot = opponentSpots(5)[1]!;
    const line = miniTimeline(spot, 9);
    const rows = [...new Set(line.map((p) => p.y))];
    expect(rows).toHaveLength(2);
    expect(line.filter((p) => p.y === rows[0]).length).toBe(5);
    expect(rows[0]!).toBeLessThan(rows[1]!);
    // Centred on the seat card.
    expect((rows[0]! + rows[1]!) / 2).toBeCloseTo(spot.seat.y, 10);
  });

  it("lays an end seat's line under it, three to a row", () => {
    const spot = opponentSpots(7)[0]!;
    const line = miniTimeline(spot, 9);
    expect(new Set(line.map((p) => p.y)).size).toBe(3);
    expect(line[0]!.y).toBeGreaterThan(seatCardBox(spot).y);
    expect(line[1]!.x - line[0]!.x).toBeCloseTo(2.5 * spot.scale, 10);
  });

  it("keeps every line up to ten cards in its lane, in reading order, cards not overlapping", () => {
    for (let n = 1; n <= 8; n++)
      for (const spot of opponentSpots(n))
        for (let count = 1; count <= 10; count++) {
          const line = miniTimeline(spot, count);
          for (const p of line) {
            const card = miniBox(p, spot.scale);
            expect(card.x).toBeGreaterThanOrEqual(spot.lane.x - 1e-9);
            expect(card.x + card.w).toBeLessThanOrEqual(
              spot.lane.x + spot.lane.w + 1e-9,
            );
            expect(card.y).toBeGreaterThanOrEqual(spot.lane.y - 1e-9);
            expect(card.y + card.h).toBeLessThanOrEqual(
              spot.lane.y + spot.lane.h + 1e-9,
            );
          }
          for (let j = 1; j < line.length; j++) {
            const [a, b] = [line[j - 1]!, line[j]!];
            const sameRow = a.y === b.y;
            expect(sameRow ? b.x > a.x : b.y > a.y).toBe(true);
            // Only a spectator's crowded table may let neighbours touch, by a hair.
            if (sameRow)
              expect(b.x - a.x).toBeGreaterThanOrEqual(
                MINI_CARD.w * spot.scale * 0.99,
              );
          }
        }
  });
});

describe("feltTimeline", () => {
  const halfWidth = (scale: number) => (MINI_CARD.w / 2) * scale;

  it("follows the design for short lines", () => {
    const xs = feltTimeline(3).map((c) => c.x);
    expect(xs).toEqual([55.5 - 6.6, 55.5, 55.5 + 6.6]);
    expect(feltTimeline(3).every((c) => c.scale === 2 && c.y === 28.5)).toBe(
      true,
    );
    // Placed card shown in gap 1 of 3: four slots, 5.6 apart, centred.
    const placed = feltTimeline(3, 1).map((c) => c.x);
    expect(placed).toHaveLength(4);
    expect(placed[0]!).toBeCloseTo(55.5 - 1.5 * 5.6, 10);
    expect(placed[3]!).toBeCloseTo(55.5 + 1.5 * 5.6, 10);
    expect(feltLayout(4).status).toBe("opponent");
  });

  it("gives a long line the felt's width and puts the status under it", () => {
    const layout = feltLayout(9);
    expect(layout.status).toBe("under");
    expect(layout.range.max).toBeGreaterThan(STATUS_BOX.opponent.x);
    expect(layout.scale).toBeGreaterThanOrEqual(1.3);
  });

  it("keeps up to ten cards plus the placed one clear of the deck and the status text", () => {
    for (let count = 0; count <= 10; count++) {
      const layout = feltLayout(count);
      for (const placedAt of [null, 0, count]) {
        const cards = feltTimeline(count, placedAt);
        expect(cards).toHaveLength(count + (placedAt === null ? 0 : 1));
        for (const c of cards) {
          // The same size whether or not the placed card is in the line.
          expect(c.scale).toBe(layout.scale);
          expect(c.x - halfWidth(c.scale)).toBeGreaterThanOrEqual(
            DECK_BOX.x + DECK_BOX.w,
          );
          const bottom = c.y + (MINI_CARD.h / 2) * c.scale;
          if (layout.status === "opponent")
            expect(c.x + halfWidth(c.scale)).toBeLessThanOrEqual(
              STATUS_BOX.opponent.x,
            );
          else expect(bottom).toBeLessThan(STATUS_BOX.under.y);
          // Inside the felt.
          expect(c.x + halfWidth(c.scale)).toBeLessThan(
            TABLE_BOX.x + TABLE_BOX.w - 1.6,
          );
          expect(c.y - (MINI_CARD.h / 2) * c.scale).toBeGreaterThan(
            TABLE_BOX.y + 1.6,
          );
          expect(bottom).toBeLessThan(TABLE_BOX.y + TABLE_BOX.h - 1.6);
        }
        for (let k = 1; k < cards.length; k++)
          expect(cards[k]!.x - cards[k - 1]!.x).toBeGreaterThan(
            2 * halfWidth(cards[k]!.scale),
          );
      }
    }
  });

  it("keeps a long line clear of the seat cards above it, whoever's turn it is", () => {
    for (let n = 1; n <= 8; n++)
      for (const spot of opponentSpots(n))
        for (let count = 5; count <= 10; count++) {
          const seat = seatReach(spot, true);
          const line = [
            ...feltTimeline(count).map((c) => miniBox(c, c.scale)),
            ...range(count + 1).map((g) => feltGapBox(g, count)),
          ];
          for (const box of line) expect(overlaps(seat, box)).toBe(false);
        }
  });

  it("leaves room for a gap button between neighbours and at both ends", () => {
    for (let count = 0; count <= 10; count++) {
      const { range: within, status } = feltLayout(count);
      const cards = feltTimeline(count);
      for (let g = 0; g <= count; g++) {
        const gap = feltGapBox(g, count);
        expect(gap.x).toBeGreaterThanOrEqual(within.min - 1e-9);
        expect(gap.x + gap.w).toBeLessThanOrEqual(within.max + 1e-9);
        if (status === "under")
          expect(gap.y + gap.h).toBeLessThan(STATUS_BOX.under.y);
        const left = cards[g - 1];
        const right = cards[g];
        if (left)
          expect(gap.x).toBeGreaterThanOrEqual(
            left.x + halfWidth(left.scale) - 1e-9,
          );
        if (right)
          expect(gap.x + gap.w).toBeLessThanOrEqual(
            right.x - halfWidth(right.scale) + 1e-9,
          );
      }
    }
  });

  it("puts gaps halfway between neighbouring cards", () => {
    const cards = feltTimeline(4);
    expect(feltGapX(2, 4)).toBeCloseTo((cards[1]!.x + cards[2]!.x) / 2, 10);
    expect(feltGapX(0, 4)).toBeLessThan(cards[0]!.x);
    expect(feltGapX(4, 4)).toBeGreaterThan(cards[3]!.x);
    expect(feltGapX(0, 0)).toBe(55.5);
    // The design's gap buttons: 2 wide, 8.2 tall, 6.6 apart.
    const gap = feltGapBox(1, 3);
    expect(gap.x).toBeCloseTo(55.5 + (1 - 1.5) * 6.6 - 1, 10);
    expect(gap).toMatchObject({ y: 24.4, w: 2, h: 8.2 });
  });
});

describe("decadeColor", () => {
  it("uses the song cards' palette", () => {
    expect(decadeColor(1955)).toBe("#ef4a3c");
    expect(decadeColor(1969)).toBe("#ff8a3d");
    expect(decadeColor(1976)).toBe("#ffd84a");
    expect(decadeColor(1983)).toBe("#ff6fae");
    expect(decadeColor(1995)).toBe("#3b8cf0");
    expect(decadeColor(2003)).toBe("#45c486");
    expect(decadeColor(2010)).toBe("#9b7bff");
    expect(decadeColor(2024)).toBe("#33cccc");
  });
});

describe("CSS helpers", () => {
  it("writes stage units as calc() lengths", () => {
    expect(u(4.2)).toBe("calc(var(--u) * 4.2)");
    expect(u(1 / 3)).toBe("calc(var(--u) * 0.33)");
    expect(u(-0.001)).toBe("calc(var(--u) * 0)");
  });

  it("centres an element on a pose", () => {
    expect(placeAt({ x: 50, y: 53, r: -3 }, HAND_CARD)).toBe(
      "translate(calc(var(--u) * 45.8), calc(var(--u) * 47.1)) rotate(-3deg) scale(1)",
    );
    expect(placeAt({ x: 10, y: 10 }, MINI_CARD, 2)).toBe(
      "translate(calc(var(--u) * 8.85), calc(var(--u) * 8.4)) rotate(0deg) scale(2)",
    );
  });
});

describe("betting on the design's stage", () => {
  const layout = landscapeLayout(3);
  const bets = layout.bets;

  it("finds a gap between its cards, past the ends, and on the revealed card", () => {
    const cards = [
      { x: 10, y: 5, scale: 1 },
      { x: 14, y: 5, scale: 1 },
      { x: 18, y: 5, scale: 1 },
    ];
    expect(gapPoint(cards, 1, null, 4)!.at).toEqual({ x: 12, y: 5 });
    expect(gapPoint(cards, 0, null, 4)!.at).toEqual({ x: 8, y: 5 });
    expect(gapPoint(cards, 3, null, 4)!.at).toEqual({ x: 20, y: 5 });
    // With the revealed card at 1, gap 1 is on it and gap 2 is past it.
    expect(gapPoint(cards, 1, 1, 4)!.at).toEqual({ x: 14, y: 5 });
    expect(gapPoint(cards, 2, 1, 4)!.at).toEqual({ x: 20, y: 5 });
    expect(gapPoint(cards, 0, 1, 4)!.at).toEqual({ x: 8, y: 5 });
    // A row break: beside the card before it.
    const rows = [cards[0]!, { x: 10, y: 9, scale: 1 }];
    expect(gapPoint(rows, 1, null, 4)!.at).toEqual({ x: 12, y: 5 });
    expect(gapPoint([], 0, null, 4)).toBeNull();
  });

  it("stacks tokens upwards, closer in a tall stack", () => {
    expect(stackOffset(0, 1)).toBe(0);
    expect(stackOffset(1, 2)).toBe(2.4);
    expect(stackOffset(5, 6)).toBeCloseTo(7.2, 9);
  });

  it("puts the design's waiting row and landing spots over a short line on the felt", () => {
    const pending = bets.pendingFelt(0, 1, 4);
    expect(pending.x).toBeCloseTo(55.5, 9);
    expect(pending.y).toBeCloseTo(21.2, 9);
    const gap = feltGapX(2, 4);
    const landed = bets.feltSpot(2, 4, null);
    expect(landed.x).toBeCloseTo(gap, 9);
    expect(landed.y).toBeCloseTo(23.4, 9);
    // Tokens wait in a row 2.7 apart.
    expect(
      bets.pendingFelt(1, 2, 4).x - bets.pendingFelt(0, 2, 4).x,
    ).toBeCloseTo(2.7, 9);
    expect(bets.pendingMine(0, 1)).toEqual({ x: 50, y: 36.7 });
  });

  it("lands tokens over the viewer's hand, clear of its cards", () => {
    for (let count = 1; count <= 9; count++)
      for (let g = 0; g <= count; g++) {
        const spot = bets.handSpot(g, count, 0);
        const slot = handSlot(0, count + 1);
        expect(spot.y + 1.1).toBeLessThan(
          slot.y - (HAND_CARD.h / 2) * slot.scale + 1e-9,
        );
      }
  });

  it("keeps the viewer's chips under the plate and the bar under the felt", () => {
    expect(bets.plateChips.x).toBe(3.2);
    expect(bets.plateChips.y + 1.1).toBeCloseTo(STAGE.h - 1.2, 9);
    expect(bets.bar).toMatchObject({
      kind: "floating",
      at: { x: 50, y: 43.4 },
    });
    // It may grow leftwards past the plate's column (the plate is lower), never under the chat.
    if (bets.bar.kind === "floating") {
      expect(bets.bar.right).toBeLessThan(CHAT_BOX.x);
      expect(bets.bar.left).toBeGreaterThan(0);
      expect(bets.bar.at.y + 3).toBeLessThan(STAGE.h - PLATE.bottom - 6);
    }
    expect(bets.seatChipsMax).toBe(4);
  });
});
