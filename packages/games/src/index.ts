import type { GameModule } from "@cardgame/engine";
import { demo } from "./demo";

export * from "./demo";

/** Every game the platform can run, keyed by id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const games: Record<string, GameModule<any, any, any>> = {
  [demo.id]: demo,
};
