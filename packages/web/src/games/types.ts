import type { GameView } from "@cardgame/protocol";
import type { ReactNode } from "react";

export interface GameProps {
  game: GameView;
  /** Your player id, or null when you are watching. */
  you: string | null;
  /** Display name for a player id. */
  nameOf: (id: string) => string;
  /** Sends a move to the server. */
  move: (move: unknown) => void;
}

/** What a game supplies so the shared table can draw it. */
export interface GameUI {
  /** Middle of the table: piles, round counter. */
  Center(props: GameProps): ReactNode;
  /** Cards shown next to one player's seat. */
  SeatCards(props: GameProps & { playerId: string }): ReactNode;
  /** Short label under a player's name, such as a score. */
  seatTag(game: GameView, playerId: string): string | null;
  /** Your own cards, large, at the bottom of the screen. */
  Hand?(props: GameProps): ReactNode;
  /** Status line and buttons for your possible moves. */
  Actions?(props: GameProps): ReactNode;
  /**
   * Replaces Hand and Actions with one full-width area, for games where your
   * cards and your buttons share state or need the whole width of a phone.
   */
  Dock?(props: GameProps): ReactNode;
  /** Short-lived announcement, such as a round result. null shows nothing. */
  announcement(game: GameView, nameOf: (id: string) => string): { key: string; title: string; detail: string } | null;
}
