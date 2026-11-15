import { describe, expect, it } from "vitest";
import { games, getGame, requireGame } from "../src";

describe("typed game registry", () => {
  it("returns registered modules and rejects absent/inherited ids", () => {
    expect(getGame("demo")).toBe(games.demo);
    expect(getGame("hitster")).toBe(games.hitster);
    for (const id of ["", "missing", "__proto__", "constructor"]) {
      expect(getGame(id)).toBeNull();
      expect(() => requireGame(id)).toThrow("Unknown game");
    }
  });
  it("wraps pause and pure resume hooks without requiring them on Demo", () => {
    const state = games.hitster.setup({
      players: ["a", "b"],
      seed: 1,
      settings: { cardsToWin: "10" },
    });
    expect(games.hitster.pauseMs!(state)).toBeNull();
    const outcome = games.hitster.applyMove(state, "a", { type: "pass" });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(games.hitster.pauseMs!(outcome.state)).toBe(4000);
    const resumed = games.hitster.resume!(outcome.state);
    expect(games.hitster.view(outcome.state, null)).toMatchObject({
      revealing: true,
      turnNumber: 1,
    });
    expect(games.hitster.view(resumed, null)).toMatchObject({
      revealing: false,
      turnNumber: 2,
    });
    const demo = games.demo.setup({
      players: ["a", "b"],
      seed: 1,
      settings: {},
    });
    expect(games.demo.pauseMs!(demo)).toBeNull();
    expect(games.demo.resume!(demo)).toBe(demo);
  });

  it.each([
    ["demo", { type: "peek" }],
    ["demo", { type: "reveal" }],
    ["hitster", { type: "place", index: 0 }],
    ["hitster", { type: "pass" }],
  ])("accepts a valid move for %s", (id, move) => {
    expect(requireGame(String(id)).moveSchema.safeParse(move).success).toBe(
      true,
    );
  });

  it.each([
    null,
    {},
    { type: "nope" },
    { type: "place", index: -1 },
    { type: "place", index: 0.5 },
    { type: "place", index: "0" },
  ])("rejects invalid moves: %j", (move) => {
    for (const game of Object.values(games))
      expect(game.moveSchema.safeParse(move).success).toBe(false);
  });
});
