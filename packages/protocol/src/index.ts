/** Messages and views shared by the server and the web client. */

export const SEAT_COUNT = 8;
export const MAX_NAME_LENGTH = 14;

export interface GameInfo {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
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
}

export interface RoomView {
  code: string;
  gameId: string;
  games: GameInfo[];
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
  | { type: "setGame"; gameId: string }
  | { type: "start" }
  | { type: "move"; move: unknown }
  | { type: "skip"; playerId: string }
  | { type: "kick"; playerId: string }
  | { type: "endGame" };

export type ServerMessage =
  | { type: "welcome"; memberToken: string }
  | { type: "state"; room: RoomView }
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
