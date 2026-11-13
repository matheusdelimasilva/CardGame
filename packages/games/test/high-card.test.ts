import { describe, expect, it } from "vitest";
import { rankValue } from "@cardgame/engine";
import { TARGET_SCORE, highCard, type HighCardState } from "../src";

const players = ["a", "b", "c"];
const start = (seed = 42) => highCard.setup({ players, seed });

function play(state: HighCardState, player: string, type: "peek" | "reveal"): HighCardState {
  const result = highCard.applyMove(state, player, { type });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("high card", () => {
  it("deals one hidden card to each player", () => {
    const state = start();
    for (const viewer of [...players, null]) {
      const view = highCard.view(state, viewer);
      for (const p of players) {
        expect(view.table.zones[`slot:${p}`]!.cards).toEqual([
          { id: expect.any(String), face: null, faceUp: false },
        ]);
      }
    }
    expect(highCard.view(state, "a").currentPlayer).toBe("a");
  });

  it("lets a player peek at their own card only", () => {
    const state = play(start(), "b", "peek");
    const faceFor = (viewer: string | null) => highCard.view(state, viewer).table.zones["slot:b"]!.cards[0]!.face;
    expect(faceFor("b")).not.toBeNull();
    expect(faceFor("a")).toBeNull();
    expect(faceFor(null)).toBeNull();
  });

  it("rejects reveals out of turn and moves from outsiders", () => {
    const state = start();
    expect(highCard.applyMove(state, "b", { type: "reveal" })).toEqual({ ok: false, error: "It is not your turn." });
    expect(highCard.applyMove(state, "zed", { type: "peek" }).ok).toBe(false);
  });

  it("scores the highest card and starts the next round with the next player", () => {
    let state = start();
    for (const p of players) state = play(state, p, "reveal");
    const summary = state.lastRound!;
    const best = Math.max(...players.map((p) => rankValue(summary.cards[p]!)));
    expect(summary.winners).toEqual(players.filter((p) => rankValue(summary.cards[p]!) === best));
    for (const p of players) expect(state.scores[p]).toBe(summary.winners.includes(p) ? 1 : 0);
    expect(state.round).toBe(2);
    expect(highCard.view(state, null).currentPlayer).toBe("b");
    expect(state.table.zones.discard!.cards).toHaveLength(3);
  });

  it("plays to a winner, reshuffling the discard pile when the deck runs low", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let state = highCard.setup({ players: ["a", "b", "c", "d", "e", "f", "g", "h"], seed });
      let moves = 0;
      while (!highCard.result(state)) {
        state = play(state, highCard.view(state, null).currentPlayer!, "reveal");
        const total = Object.values(state.table.zones).reduce((n, z) => n + z.cards.length, 0);
        expect(total).toBe(52);
        expect(++moves).toBeLessThan(5000);
      }
      const { winners } = highCard.result(state)!;
      expect(winners.length).toBeGreaterThan(0);
      for (const w of winners) expect(state.scores[w]).toBe(TARGET_SCORE);
      expect(highCard.applyMove(state, "a", { type: "reveal" }).ok).toBe(false);
    }
  });
});
