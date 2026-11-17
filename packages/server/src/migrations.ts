import { z } from "zod";
import { STARTING_TOKENS } from "@cardgame/games";
import type { HistoryEntry } from "@cardgame/protocol";
import type { Room } from "./rooms";

export interface Session {
  email: string;
  lastUsed: number;
}

export interface Data {
  version: number;
  sessions: Record<string, Session>;
  history: Record<string, HistoryEntry[]>;
  rooms: Room[];
}

export const ROOM_VERSION = 4;
export const DATA_VERSION = 1;
const dictionary = <T>(values: Record<string, T> = {}): Record<string, T> =>
  Object.assign(Object.create(null) as Record<string, T>, values);
export const emptyData = (): Data => ({
  version: DATA_VERSION,
  sessions: dictionary<Session>(),
  history: dictionary<HistoryEntry[]>(),
  rooms: [],
});

const versioned = z
  .object({ version: z.number().int().nonnegative().optional() })
  .passthrough();

/** Reject unknown versions before modifying snapshots or opening them for writes. */
export function checkVersion(
  version: number,
  latest: number,
  kind: string,
): void {
  if (!Number.isInteger(version) || version < 0)
    throw new Error(`${kind} has invalid version ${version}`);
  if (version > latest)
    throw new Error(
      `${kind} version ${version} is newer than supported version ${latest}`,
    );
}

const roomMigrations: ((room: Room) => void)[] = [
  (room) => {
    room.settings ??= {};
    if (!room.game) return;
    room.game.trackKey ??= "";
    room.game.trackNonce ??= null;
    if (
      room.game.gameId === "hitster" &&
      typeof room.game.state === "object" &&
      room.game.state !== null
    ) {
      const state = room.game.state as { songList?: string };
      state.songList ??= "international";
    }
  },
  (room) => {
    if (!room.game) return;
    room.game.resumeAt ??= null;
    if (
      room.game.gameId === "hitster" &&
      typeof room.game.state === "object" &&
      room.game.state !== null
    ) {
      const state = room.game.state as { revealing?: boolean };
      state.revealing ??= false;
    }
  },
  (room) => {
    // Betting: a game saved mid-turn plays on with everyone at the starting tokens and no bets.
    if (
      room.game?.gameId !== "hitster" ||
      typeof room.game.state !== "object" ||
      room.game.state === null
    )
      return;
    const state = room.game.state as {
      players?: unknown;
      tokens?: number[];
      bets?: unknown[];
      declined?: string[];
      locked?: number | null;
    };
    const players = Array.isArray(state.players) ? state.players : [];
    state.tokens ??= players.map(() => STARTING_TOKENS);
    state.bets ??= [];
    state.declined ??= [];
    state.locked ??= null;
  },
  (room) => {
    // Guessing in chat: on for tables made before the setting existed, like its default; nobody has guessed yet.
    if (room.gameId !== "hitster") return;
    room.settings.guessInChat ??= true;
    if (typeof room.game?.state !== "object" || room.game.state === null)
      return;
    const state = room.game.state as {
      guessInChat?: boolean;
      guessed?: { title: string[]; artist: string[] };
    };
    state.guessInChat ??= true;
    state.guessed ??= { title: [], artist: [] };
  },
];

/** Ordered room migrations also apply to independently stored Postgres rows. */
export function migrateRoom(input: unknown): Room {
  const parsed = versioned.parse(input);
  const version = parsed.version ?? 0;
  checkVersion(version, ROOM_VERSION, "Room snapshot");
  const room = parsed as unknown as Room;
  for (let v = version; v < ROOM_VERSION; v++) {
    roomMigrations[v]!(room);
    room.version = v + 1;
  }
  return room;
}

const dataMigrations: ((data: Data, now: number) => void)[] = [
  (data, now) => {
    data.sessions ??= {};
    data.history ??= {};
    data.rooms ??= [];
    for (const [token, session] of Object.entries(data.sessions)) {
      if (typeof session === "string")
        data.sessions[token] = { email: session, lastUsed: now };
      else session.lastUsed ??= now;
    }
  },
];

/** v0 is the unversioned format, including string sessions and partial room fields. */
export function migrateData(input: unknown, now = Date.now()): Data {
  const parsed = versioned.parse(input);
  const version = parsed.version ?? 0;
  checkVersion(version, DATA_VERSION, "Stored data");
  const data = parsed as unknown as Data;
  for (let v = version; v < DATA_VERSION; v++) {
    dataMigrations[v]!(data, now);
    data.version = v + 1;
  }
  data.rooms = data.rooms.map(migrateRoom);
  data.sessions = dictionary(data.sessions);
  data.history = dictionary(data.history);
  return data;
}

/** SQL counterparts to the ordered data migrations, run in the startup transaction. */
export const postgresMigrations = [
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL);
   ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used BIGINT;
   CREATE TABLE IF NOT EXISTS history (host_email TEXT PRIMARY KEY, entries JSONB NOT NULL);
   CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, snapshot JSONB NOT NULL);`,
];
