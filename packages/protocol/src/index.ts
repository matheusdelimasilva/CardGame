/** Messages and views shared by the server and the web client. */

import type { SettingDef, SettingValues } from "@cardgame/engine";
import { z } from "zod";

export type {
  SelectSetting,
  SettingDef,
  SettingValues,
  ToggleSetting,
} from "@cardgame/engine";

export const SEAT_COUNT = 8;
export const MAX_NAME_LENGTH = 14;

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
  /**
   * Audio everyone should hear right now. The URL is unguessable and changes
   * with every recording; it does not say which recording it is.
   */
  track: { url: string } | null;
  /** Time left on the current turn when this view was sent, if the turn is timed. */
  timer: { remainingMs: number; totalMs: number } | null;
  /** Time left before the held game state resumes when this view was sent. */
  pause: { remainingMs: number } | null;
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

const token = z.string().min(1).max(128).optional();
const playerId = z.string().min(1).max(128);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    memberToken: token,
    sessionToken: token,
  }),
  z.object({
    type: z.literal("setName"),
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  }),
  z.object({
    type: z.literal("sit"),
    seat: z
      .number()
      .int()
      .min(0)
      .max(SEAT_COUNT - 1),
  }),
  z.object({ type: z.literal("stand") }),
  z.object({ type: z.literal("start") }),
  z.object({
    type: z.literal("move"),
    move: z.unknown().refine((value): boolean => value !== undefined),
  }),
  z.object({ type: z.literal("skip"), playerId }),
  z.object({ type: z.literal("kick"), playerId }),
  z.object({ type: z.literal("endGame") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

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
