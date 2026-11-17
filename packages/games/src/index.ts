import { defineGame, type AnyGame } from "@cardgame/engine";
import { demo } from "./demo";
import { hitster } from "./hitster";

export * from "./demo";
export * from "./hitster";

/** Every game the platform can run, keyed by id. */
export const games = {
  hitster: defineGame(hitster),
  demo: defineGame(demo),
};

const registry = new Map(Object.values(games).map((game) => [game.id, game]));

/** Finds a game without treating inherited object properties as registered modules. */
export function getGame(id: string): AnyGame | null {
  return registry.get(id) ?? null;
}

/** Resolves a stored game id; room guards contain unknown or removed modules. */
export function requireGame(id: string): AnyGame {
  const game = getGame(id);
  if (!game) throw new Error(`Unknown game ${id}`);
  return game;
}
