import { describe, expect, it } from "vitest";
import {
  DATA_VERSION,
  emptyData,
  ROOM_VERSION,
  migrateData,
  migrateRoom,
} from "../src/migrations";
import { createRoom } from "../src/rooms";

// v0 matches the unversioned main format, before session timestamps and song lists.
const v0 = {
  sessions: {
    token: "host@example.com",
    partial: { email: "partial@example.com" },
  },
  history: { "host@example.com": [] },
  rooms: [
    {
      code: "ABC234",
      hostEmail: "host@example.com",
      gameId: "hitster",
      members: [],
      updatedAt: 100,
      game: {
        gameId: "hitster",
        players: [],
        state: { table: { zones: [] } },
        result: null,
        turnKey: "",
        deadline: null,
        turnMs: 0,
      },
    },
  ],
};

describe("snapshot migrations", () => {
  it("uses null-prototype dictionaries for new and loaded sessions and history", () => {
    for (const data of [
      emptyData(),
      migrateData({}),
      migrateData({
        version: DATA_VERSION,
        sessions: {},
        history: {},
        rooms: [],
      }),
    ]) {
      expect(Object.getPrototypeOf(data.sessions)).toBeNull();
      expect(Object.getPrototypeOf(data.history)).toBeNull();
      expect(data.sessions.__proto__).toBeUndefined();
      expect(data.history.constructor).toBeUndefined();
    }
  });
  it("upgrades a main-format v0 fixture and preserves identities and game state", () => {
    const data = migrateData(structuredClone(v0), 1234);
    expect(data.version).toBe(DATA_VERSION);
    expect(data.sessions).toEqual({
      token: { email: "host@example.com", lastUsed: 1234 },
      partial: { email: "partial@example.com", lastUsed: 1234 },
    });
    expect(data.rooms[0]).toEqual({
      ...v0.rooms[0],
      version: ROOM_VERSION,
      settings: {},
      game: {
        ...v0.rooms[0]!.game,
        trackKey: "",
        trackNonce: null,
        state: { table: { zones: [] }, songList: "international" },
      },
    });
    expect(migrateData(structuredClone(data), 9999)).toEqual(data);
  });

  it("supports empty v0 data and preserves existing settings, timestamps and Brasil state", () => {
    expect(migrateData({})).toEqual({
      version: DATA_VERSION,
      sessions: {},
      history: {},
      rooms: [],
    });
    const input = structuredClone(v0);
    const room = {
      ...input.rooms[0]!,
      settings: { songList: "brasil" },
      game: {
        ...input.rooms[0]!.game,
        trackKey: "track",
        trackNonce: "nonce",
        state: { songList: "brasil" },
      },
    };
    expect(migrateRoom(room)).toMatchObject({
      version: ROOM_VERSION,
      settings: room.settings,
      game: {
        trackKey: "track",
        trackNonce: "nonce",
        state: { songList: "brasil" },
      },
    });
    const current = {
      version: DATA_VERSION,
      sessions: { saved: { email: "saved@example.com", lastUsed: 42 } },
      history: {},
      rooms: [createRoom("ABC234", "host@example.com", "demo")],
    };
    expect(migrateData(current)).toEqual(current);
  });

  it("refuses future data and room versions", () => {
    expect(() => migrateData({ version: DATA_VERSION + 1 })).toThrow(
      /newer than supported/,
    );
    expect(() =>
      migrateData({
        ...v0,
        rooms: [{ ...v0.rooms[0], version: ROOM_VERSION + 1 }],
      }),
    ).toThrow(/Room snapshot version/);
    expect(() => migrateRoom({ version: -1 })).toThrow();
  });
});
