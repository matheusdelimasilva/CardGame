import type { GameModule } from "@cardgame/engine";
import { demo } from "./demo";
import { hitster } from "./hitster";

export * from "./demo";
export * from "./hitster";

/** Every game the platform can run, keyed by id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const games: Record<string, GameModule<any, any, any>> = {
  [hitster.id]: hitster,
  [demo.id]: demo,
};
