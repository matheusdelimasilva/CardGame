import type { GameResult, SettingValues } from "@cardgame/engine";

/** Persisted room data, independent of transports and lifecycle services. */
export interface Member {
  id: string;
  /** Secret kept in the member's browser; it is how they get their seat back. */
  token: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  seat: number | null;
}

export interface RunningGame {
  gameId: string;
  players: string[];
  state: unknown;
  result: GameResult | null;
  /** Who the game was waiting on when the turn clock last started. */
  turnKey: string;
  /** When the current turn runs out (epoch ms), or null if it is not timed. */
  deadline: number | null;
  turnMs: number;
  /** Which recording the nonce below stands for; "" when nothing is playing. */
  trackKey: string;
  /** Random id for the current recording's URL. A new one is made for every recording. */
  trackNonce: string | null;
}

export interface Room {
  code: string;
  hostEmail: string;
  gameId: string;
  settings: SettingValues;
  members: Member[];
  game: RunningGame | null;
  updatedAt: number;
}

/** null means the action was applied; a string is the reason it was refused. */
export type Refusal = string | null;

export const isRunning = (room: Room) =>
  room.game !== null && room.game.result === null;
export const inRunningGame = (room: Room, m: Member) =>
  isRunning(room) && room.game!.players.includes(m.id);
