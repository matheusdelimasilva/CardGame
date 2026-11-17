// Types only: the song list (with its years) must never be bundled into the client.
import type { SongCardView, TurnSummary } from "@cardgame/games";
import type { SeatLook } from "../ui/seats";

export type { SongCardView, TurnSummary };

/** A point in stage units (the stage is 100u wide and 62.5u tall). */
export interface Point {
  x: number;
  y: number;
}

/** A point plus the rotation, in degrees, of whatever sits on it. */
export interface Pose extends Point {
  r: number;
}

/** An axis-aligned rectangle in stage units: top-left corner and size. */
export interface Box extends Point {
  w: number;
  h: number;
}

/** One person in the running game, as the table draws them. */
export interface TablePlayer extends SeatLook {
  id: string;
  name: string;
  /** null when the player is no longer seated (they stood up or were kicked mid-game). */
  seat: number | null;
  connected: boolean;
  isHost: boolean;
  isMe: boolean;
}

/** The viewer's own placement while it is still local: nothing has been sent yet. */
export interface Placement {
  /** Insertion index in the viewer's timeline (0 = before the oldest card). */
  index: number;
  /** True while the card is still held under the pointer. */
  dragging: boolean;
}

/**
 * Where the game is. New rules (bets, steals) add kinds here rather than
 * flags elsewhere, so every screen part switches on one value.
 */
export type Stage =
  /** The held pause before the first turn. */
  | { kind: "intro"; remainingMs: number | null }
  /** Between turns, when the server has no current song to show yet. */
  | { kind: "dealing" }
  /** `player` is choosing where the current song goes. */
  | {
      kind: "placing";
      player: string;
      song: { id: string; title: string | null; artist: string | null };
    }
  /** The last turn's song is face up for everyone. */
  | { kind: "revealing"; turn: TurnSummary; next: string | null }
  | { kind: "over"; winners: string[] };

export type StageKind = Stage["kind"];

/** Whose turn the stage belongs to, from the viewer's side of the table. */
export type Whose = "mine" | "opponent" | "nobody";

/** Everything the game screen draws, derived from one RoomView. */
export interface GameModel {
  code: string;
  /** The viewer, when they are playing in this game. */
  me: TablePlayer | null;
  /** Everyone else in the game, clockwise from the viewer's seat. */
  opponents: TablePlayer[];
  goal: number;
  timelines: Record<string, SongCardView[]>;
  stage: Stage;
  whose: Whose;
  /** The player the stage is about: placing, being revealed, or null. */
  active: TablePlayer | null;
  lastTurn: TurnSummary | null;
  /** Empty until the game is over. */
  winners: TablePlayer[];
  deckCount: number;
  /** Counts turns from 1; a turn's placing and its reveal share the number. */
  turnNumber: number;
  /** Time left on a held state (intro or reveal) when the view was sent. */
  pauseMs: number | null;
  /** Time left on a timed turn when the view was sent. */
  timer: { remainingMs: number; totalMs: number } | null;
  viewerIsHost: boolean;
}

/** A status headline and the line under it. */
export interface StatusText {
  headline: string;
  sub: string;
}

/** One row of the final scores. */
export interface RankRow {
  /** "1ST", "2ND"…; tied rows share a label. */
  rank: string;
  player: TablePlayer;
  count: number;
  winner: boolean;
  isMe: boolean;
}
