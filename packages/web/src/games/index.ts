import { hitsterUI } from "./hitster";
import { defineGameUI, type GameUI } from "./types";

/** The table UI for each game, keyed by the same id as the rules module. */
export const gameUIs: Record<string, GameUI> = {
  hitster: defineGameUI(hitsterUI),
};
