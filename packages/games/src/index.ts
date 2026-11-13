import type { GameModule } from "@cardgame/engine";
import { highCard } from "./high-card";

export * from "./high-card";

/** Every game the platform can run, keyed by id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const games: Record<string, GameModule<any, any, any>> = {
  [highCard.id]: highCard,
};

export const defaultGameId = highCard.id;
