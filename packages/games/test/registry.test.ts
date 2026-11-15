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
