import { describe, expect, it } from "vitest";
import { rankValue } from "@cardgame/engine";
import {
  TARGET_SCORE,
  TURN_SECONDS,
  demo,
  roundWinners,
  type DemoState,
} from "../src";

const players = ["a", "b", "c"];
const defaults = { turnTimer: false, tiebreaker: "none" };
const start = (seed = 42, settings = defaults) =>
  demo.setup({ players, seed, settings });

function play(
  state: DemoState,
  player: string,
  type: "peek" | "reveal",
): DemoState {
  const result = demo.applyMove(state, player, { type });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("demo", () => {
  it("deals one hidden card to each player", () => {
    const state = start();
    for (const viewer of [...players, null]) {
      const view = demo.view(state, viewer);
      for (const p of players) {
        expect(view.table.zones[`slot:${p}`]!.cards).toEqual([
          { id: expect.any(String), face: null, faceUp: false },
        ]);
      }
    }
    expect(demo.view(state, "a").currentPlayer).toBe("a");
  });

  it("lets a player peek at their own card only", () => {
    const state = play(start(), "b", "peek");
    const faceFor = (viewer: string | null) =>
      demo.view(state, viewer).table.zones["slot:b"]!.cards[0]!.face;
    expect(faceFor("b")).not.toBeNull();
    expect(faceFor("a")).toBeNull();
    expect(faceFor(null)).toBeNull();
  });

  it("rejects reveals out of turn and moves from outsiders", () => {
    const state = start();
    expect(demo.applyMove(state, "b", { type: "reveal" })).toEqual({
      ok: false,
      error: "It is not your turn.",
    });
    expect(demo.applyMove(state, "zed", { type: "peek" }).ok).toBe(false);
  });

  it("scores the highest card and starts the next round with the next player", () => {
    let state = start();
    for (const p of players) state = play(state, p, "reveal");
    const summary = state.lastRound!;
    const best = Math.max(...players.map((p) => rankValue(summary.cards[p]!)));
    expect(summary.winners).toEqual(
      players.filter((p) => rankValue(summary.cards[p]!) === best),
    );
    for (const p of players)
      expect(state.scores[p]).toBe(summary.winners.includes(p) ? 1 : 0);
    expect(state.round).toBe(2);
    expect(demo.view(state, null).currentPlayer).toBe("b");
    expect(state.table.zones.discard!.cards).toHaveLength(3);
  });

  it("plays to a winner, reshuffling the discard pile when the deck runs low", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let state = demo.setup({
        players: ["a", "b", "c", "d", "e", "f", "g", "h"],
        seed,
        settings: defaults,
      });
      let moves = 0;
      while (!demo.result(state)) {
        state = play(state, demo.view(state, null).currentPlayer!, "reveal");
        const total = Object.values(state.table.zones).reduce(
          (n, z) => n + z.cards.length,
          0,
        );
        expect(total).toBe(52);
        expect(++moves).toBeLessThan(5000);
      }
      const { winners } = demo.result(state)!;
      expect(winners.length).toBeGreaterThan(0);
      for (const w of winners) expect(state.scores[w]).toBe(TARGET_SCORE);
      expect(demo.applyMove(state, "a", { type: "reveal" }).ok).toBe(false);
    }
  });

  it("breaks ties with the chosen suit, and only when a tied card has it", () => {
    const cards = { a: "KH", b: "KS", c: "2D" };
    expect(roundWinners(players, cards, "none")).toEqual(["a", "b"]);
    expect(roundWinners(players, cards, "S")).toEqual(["b"]);
    expect(roundWinners(players, cards, "H")).toEqual(["a"]);
    // Nobody tied holds a club or a diamond, so the tie stands; a lower card's suit does not count.
    expect(roundWinners(players, cards, "C")).toEqual(["a", "b"]);
    expect(roundWinners(players, cards, "D")).toEqual(["a", "b"]);
    expect(roundWinners(players, { a: "10H", b: "9S", c: "2D" }, "S")).toEqual([
      "a",
    ]);
  });

  it("times turns only when the setting is on", () => {
    expect(demo.turnTimeLimit!(start())).toBeNull();
    expect(
      demo.turnTimeLimit!(start(42, { turnTimer: true, tiebreaker: "none" })),
    ).toBe(TURN_SECONDS);
  });

  it("declares a toggle and a dropdown whose defaults are valid", () => {
    expect(demo.settings.map((s) => [s.id, s.type, s.default])).toEqual([
      ["turnTimer", "toggle", false],
      ["tiebreaker", "select", "none"],
    ]);
  });
});
