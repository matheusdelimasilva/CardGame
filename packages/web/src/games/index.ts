import { demoUI } from "./demo";
import { hitsterUI } from "./hitster";
import type { GameUI } from "./types";

/** The table UI for each game, keyed by the same id as the rules module. */
export const gameUIs: Record<string, GameUI> = {
  demo: demoUI,
  hitster: hitsterUI,
};
