import { describe, expect, it } from "vitest";
import { scenarios } from "./game/dev/fixtures";
import { roomScreen } from "./Room";

describe("which screen a table shows", () => {
  it("plays a running game on the game screen, whether or not it was watched", () => {
    for (const name of ["intro", "myTurn", "spectator", "benched"] as const) {
      expect(roomScreen(scenarios[name](), false)).toBe("game");
      expect(roomScreen(scenarios[name](), true)).toBe("game");
    }
  });

  it("keeps the final scores only for a viewer who watched the game run", () => {
    const over = scenarios.overIWin();
    expect(roomScreen(over, true)).toBe("game");
    expect(roomScreen(over, false)).toBe("lobby");
  });

  it("shows the lobby when no game is running", () => {
    expect(roomScreen({ ...scenarios.myTurn(), game: null }, true)).toBe(
      "lobby",
    );
  });
});
