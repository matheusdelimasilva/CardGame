// Types only: the song list (with its years) must never be bundled into the client.
import type {
  BetResult,
  HitsterView as RulesView,
  SongCardView,
  TurnSummary as RulesTurn,
} from "@cardgame/games";
import type { SeatLook } from "../ui/seats";

export type { BetResult, SongCardView };

/** A finished turn. The server always sends its bets now, so they are not optional here. */
export type TurnSummary = Omit<RulesTurn, "bets" | "thief"> &
  Required<Pick<RulesTurn, "bets" | "thief">>;

/** A bet of the turn in play: the gap is known only for the viewer's own. */
export type PendingBet = NonNullable<RulesView["bets"]>[number];

/**
 * The Hitster view as the client reads it: the betting fields, optional in
 * the rules only for views from before betting, are always sent now.
 */
export type HitsterView = Omit<
  RulesView,
  | "lastTurn"
  | "tokens"
  | "locked"
  | "lockedIndex"
  | "bets"
  | "declined"
  | "canBet"
> &
  Required<
    Pick<
      RulesView,
      "tokens" | "locked" | "lockedIndex" | "bets" | "declined" | "canBet"
    >
  > & { lastTurn: TurnSummary | null };

/** A point in stage units (the landscape stage is 100u × 62.5u; see StageLayout). */
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
  /**
   * `player` is choosing where the current song goes, and the others may
   * bet on it. Once `locked`, the placement is final and the betting window
   * runs (GameModel.timer) until everyone who may still bet has decided.
   */
  | {
      kind: "placing";
      player: string;
      song: { id: string; title: string | null; artist: string | null };
      locked: boolean;
      /** Where the viewer locked their own song in; null on anyone else's turn. */
      lockedIndex: number | null;
      /** This turn's bets so far, oldest first. */
      bets: PendingBet[];
      /** Who passed on betting this turn. */
      declined: string[];
      /** Who may still bet this turn. */
      canBet: string[];
    }
  /** The last turn's song is face up for everyone. */
  | { kind: "revealing"; turn: TurnSummary; next: string | null }
  | { kind: "over"; winners: string[] };

export type StageKind = Stage["kind"];

/** Whose turn the stage belongs to, from the viewer's side of the table. */
export type Whose = "mine" | "opponent" | "nobody";

/**
 * The viewer's part in this turn's betting. "none": nothing to decide (their
 * own turn, not playing, or no song in play); "open": they may bet or pass.
 */
export type MyBet =
  | { kind: "none" }
  | { kind: "open" }
  | { kind: "placed"; index: number }
  | { kind: "passed" }
  | { kind: "noTokens" };

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
  /** Time left on a timed turn (the betting window) when the view was sent. */
  timer: { remainingMs: number; totalMs: number } | null;
  viewerIsHost: boolean;
  /** Betting tokens per player id, as the server counts them now. */
  tokens: Record<string, number>;
  myBet: MyBet;
}

/** A status headline and the line under it. */
export interface StatusText {
  headline: string;
  sub: string;
  /**
   * A countdown after the sub, such as "Bets close in 3s.". Kept apart so
   * it can tick without a screen reader announcing every second.
   */
  timer?: string;
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
