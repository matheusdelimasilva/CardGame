/** Messages and views shared by the server and the web client. */

import type { SettingDef, SettingValues } from "@cardgame/engine";

export type { SelectSetting, SettingDef, SettingValues, ToggleSetting } from "@cardgame/engine";

export const SEAT_COUNT = 8;
export const MAX_NAME_LENGTH = 14;
export const MAX_CHAT_LENGTH = 500;
/** At most this many chat messages per member in any CHAT_WINDOW_MS. */
export const CHAT_RATE_LIMIT = 5;
export const CHAT_WINDOW_MS = 10_000;

/** One plain-text chat line. Identity and time are stamped by the server. */
export interface ChatMessage {
  id: string;
  from: { id: string; name: string };
  text: string;
  at: number;
}

export interface GameInfo {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  description: string;
  settings: SettingDef[];
}

export interface SeatView {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  /** True when this player is part of the game being played right now. */
  inGame: boolean;
}

export interface SpectatorView {
  id: string;
  name: string;
  connected: boolean;
}

export interface GameView {
  gameId: string;
  /** Player ids in turn order. */
  players: string[];
  /** Players the game is waiting on. */
  active: string[];
  /** The game's own view, already filtered for this viewer. */
  view: unknown;
  result: { winners: string[] } | null;
  /** Time left on the current turn when this view was sent, if the turn is timed. */
  timer: { remainingMs: number; totalMs: number } | null;
}

export interface RoomView {
  code: string;
  /** The game this table was created for, and the host's settings for it. */
  gameInfo: GameInfo;
  settings: SettingValues;
  you: { id: string; name: string; seat: number | null; isHost: boolean };
  /** Always SEAT_COUNT entries; null is an open seat. */
  seats: (SeatView | null)[];
  spectators: SpectatorView[];
  game: GameView | null;
}

export type ClientMessage =
  | { type: "hello"; memberToken?: string; sessionToken?: string }
  | { type: "setName"; name: string }
  | { type: "sit"; seat: number }
  | { type: "stand" }
  | { type: "start" }
  | { type: "move"; move: unknown }
  | { type: "skip"; playerId: string }
  | { type: "kick"; playerId: string }
  | { type: "endGame" }
  | { type: "chat"; text: string };

export type ServerMessage =
  | { type: "welcome"; memberToken: string }
  | { type: "state"; room: RoomView }
  | { type: "chat"; message: ChatMessage }
  | { type: "error"; message: string }
  | { type: "kicked" };

export interface HistoryEntry {
  roomCode: string;
  gameId: string;
  gameName: string;
  players: string[];
  winners: string[];
  endedAt: string;
}
