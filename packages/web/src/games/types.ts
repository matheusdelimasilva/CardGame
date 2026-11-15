import type { GameView } from "@cardgame/protocol";
import type { ReactNode } from "react";
import type { TrackAudio } from "../audio";

export type TypedGameView<V = unknown> = Omit<GameView, "view"> & { view: V };

export interface GameProps<V = unknown, M = unknown> {
  game: TypedGameView<V>;
  /** Your player id, or null when you are watching. */
  you: string | null;
  /** Display name for a player id. */
  nameOf: (id: string) => string;
  /** Sends a move to the server. */
  move: (move: M) => void;
  /** Playback of the table's current recording on this device, for games that have sound. */
  audio: TrackAudio;
}

/** What a game supplies so the shared table can draw it. */
export interface GameUI<V = unknown, M = unknown> {
  /** Middle of the table: piles, round counter. */
  Center(props: GameProps<V, M>): ReactNode;
  /** Cards shown next to one player's seat. */
  SeatCards(props: GameProps<V, M> & { playerId: string }): ReactNode;
  /** Short label under a player's name, such as a score. */
  seatTag(game: TypedGameView<V>, playerId: string): string | null;
  /** Your own cards, large, at the bottom of the screen. */
  Hand?(props: GameProps<V, M>): ReactNode;
  /** Status line and buttons for your possible moves. */
  Actions?(props: GameProps<V, M>): ReactNode;
  /**
   * Replaces Hand and Actions with one full-width area, for games where your
   * cards and your buttons share state or need the whole width of a phone.
   */
  Dock?(props: GameProps<V, M>): ReactNode;
  /** Short-lived announcement, such as a round result. null shows nothing. */
  announcement(
    game: TypedGameView<V>,
    nameOf: (id: string) => string,
  ): { key: string; title: string; detail: string } | null;
}

/** Erases the view type only where a server message selects its registered UI. */
export function defineGameUI<V, M>(ui: GameUI<V, M>): GameUI {
  return ui as unknown as GameUI;
}
