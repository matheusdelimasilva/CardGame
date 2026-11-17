import { describe, expect, it } from "vitest";
import {
  DECK_BOX,
  FELT_X_RANGE,
  HAND_CARD,
  MINI_CARD,
  STAGE,
  STATUS_BOX,
  TABLE_BOX,
  decadeColor,
  feltGapX,
  feltTimeline,
  handCardWithGap,
  handInsertionIndex,
  handSlot,
  miniTimeline,
  opponentSpots,
  placeAt,
  seatCardBox,
  u,
} from "./layout";

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
      }
  });

  it("keeps every centre between the player plate and the chat for up to ten slots", () => {
    for (let total = 1; total <= 10; total++)
      for (const k of range(total)) {
        const { x } = handSlot(k, total);
        expect(x).toBeGreaterThanOrEqual(24 - 1e-9);
        expect(x).toBeLessThanOrEqual(76 + 1e-9);
      }
  });

  it("caps tilt and drop so the outer cards stay on the stage", () => {
    for (let total = 1; total <= 10; total++)
      for (const k of range(total)) {
        const { y, r } = handSlot(k, total);
        expect(Math.abs(r)).toBeLessThanOrEqual(7.5 + 1e-9);
        // A rotated card's lowest corner, measured from its centre.
        const rad = (Math.abs(r) * Math.PI) / 180;
        const reach =
          (HAND_CARD.w / 2) * Math.sin(rad) + (HAND_CARD.h / 2) * Math.cos(rad);
        expect(y + reach).toBeLessThanOrEqual(STAGE.h);
      }
  });

  it("is symmetric and strictly increasing in x", () => {
    for (let total = 2; total <= 10; total++) {
      const xs = range(total).map((k) => handSlot(k, total).x);
      for (let k = 1; k < total; k++)
        expect(xs[k]!).toBeGreaterThan(xs[k - 1]!);
      expect(xs[0]! + xs.at(-1)!).toBeCloseTo(100, 10);
    }
  });
});

describe("handInsertionIndex", () => {
  it("counts the cards left of the pointer, like the design's idxAt", () => {
    expect(handInsertionIndex(50, 0)).toBe(0);
    expect(handInsertionIndex(10, 2)).toBe(0);
    expect(handInsertionIndex(50, 2)).toBe(1);
    expect(handInsertionIndex(90, 2)).toBe(2);
    expect(handInsertionIndex(handSlot(3, 9).x + 0.01, 9)).toBe(4);
  });

  it("never decreases as the pointer moves right", () => {
    for (const count of [1, 5, 9]) {
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

describe("opponentSpots", () => {
  it("uses the design's spots for one to five opponents", () => {
    expect(opponentSpots(3).map((s) => s.anchor)).toEqual([
      { x: 26, y: 15.5 },
      { x: 50, y: 15.5 },
      { x: 74, y: 15.5 },
    ]);
    expect(opponentSpots(5).map((s) => s.anchor.x)).toEqual([
      10.5, 30.25, 50, 69.75, 89.5,
    ]);
    for (let n = 1; n <= 5; n++)
      expect(opponentSpots(n).every((s) => s.scale === 1)).toBe(true);
    // The design's seat card: left x - 9.75, top y - 4.3.
    const box = seatCardBox(opponentSpots(1)[0]!);
    expect(box.x).toBeCloseTo(40.25, 10);
    expect(box.y).toBeCloseTo(11.2, 10);
  });

  it("clamps the count to 1–7", () => {
    expect(opponentSpots(0)).toHaveLength(1);
    expect(opponentSpots(12)).toHaveLength(7);
  });

  for (let n = 1; n <= 7; n++)
    it(`places ${n} opponent(s) on the stage, with full timelines not overlapping`, () => {
      const spots = opponentSpots(n);
      expect(spots).toHaveLength(n);
      let lastRight = -Infinity;
      for (const spot of spots) {
        const seat = seatCardBox(spot);
        expect(seat.x).toBeGreaterThanOrEqual(0);
        expect(seat.y).toBeGreaterThanOrEqual(0);
        // Above the felt.
        expect(seat.y + seat.h).toBeLessThanOrEqual(TABLE_BOX.y + 3);
        expect(seat.x).toBeGreaterThan(lastRight);
        const minis = miniTimeline(spot, 9);
        const half = (MINI_CARD.w / 2) * spot.scale;
        // The line starts right of the seat card.
        expect(minis[0]!.x - half).toBeGreaterThan(seat.x + seat.w);
        lastRight = minis.at(-1)!.x + half;
        expect(lastRight).toBeLessThanOrEqual(STAGE.w);
      }
    });
});

describe("miniTimeline", () => {
  it("uses the design's spacing when there is room", () => {
    const spot = opponentSpots(3)[0]!;
    expect(miniTimeline(spot, 3).map((p) => p.x)).toEqual([
      26 - 1.6,
      26 - 1.6 + 2.5,
      26 - 1.6 + 5,
    ]);
    expect(miniTimeline(spot, 0)).toEqual([]);
  });

  it("squeezes long lines and keeps them in order", () => {
    const spot = opponentSpots(5)[1]!;
    const xs = miniTimeline(spot, 9).map((p) => p.x);
    for (let j = 1; j < xs.length; j++)
      expect(xs[j]!).toBeGreaterThan(xs[j - 1]!);
    expect(xs.at(-1)!).toBeLessThanOrEqual(spot.maxMiniX + 1e-9);
    expect(xs[1]! - xs[0]!).toBeLessThan(2.5);
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
  });

  it("keeps up to nine cards plus the placed one clear of the deck and the status text", () => {
    for (let count = 0; count <= 9; count++)
      for (const placedAt of [null, 0, count]) {
        const cards = feltTimeline(count, placedAt);
        expect(cards).toHaveLength(count + (placedAt === null ? 0 : 1));
        for (const c of cards) {
          expect(c.x - halfWidth(c.scale)).toBeGreaterThanOrEqual(
            DECK_BOX.x + DECK_BOX.w,
          );
          expect(c.x + halfWidth(c.scale)).toBeLessThanOrEqual(
            STATUS_BOX.opponent.x,
          );
          // Inside the felt vertically.
          expect(c.y - (MINI_CARD.h / 2) * c.scale).toBeGreaterThan(
            TABLE_BOX.y + 1.6,
          );
          expect(c.y + (MINI_CARD.h / 2) * c.scale).toBeLessThan(
            TABLE_BOX.y + TABLE_BOX.h - 1.6,
          );
        }
        for (let k = 1; k < cards.length; k++)
          expect(cards[k]!.x).toBeGreaterThan(cards[k - 1]!.x);
      }
  });

  it("puts gaps halfway between neighbouring cards", () => {
    const cards = feltTimeline(4);
    expect(feltGapX(2, 4)).toBeCloseTo((cards[1]!.x + cards[2]!.x) / 2, 10);
    expect(feltGapX(0, 4)).toBeLessThan(cards[0]!.x);
    expect(feltGapX(4, 4)).toBeGreaterThan(cards[3]!.x);
    expect(feltGapX(0, 0)).toBe(55.5);
    for (let g = 0; g <= 9; g++) {
      expect(feltGapX(g, 9)).toBeGreaterThanOrEqual(FELT_X_RANGE.min);
      expect(feltGapX(g, 9)).toBeLessThanOrEqual(FELT_X_RANGE.max);
    }
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
