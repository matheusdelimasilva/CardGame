import { describe, expect, it } from "vitest";
import { games, type HitsterState } from "@cardgame/games";
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
      settings: { guessInChat: true },
      game: {
        ...v0.rooms[0]!.game,
        trackKey: "",
        trackNonce: null,
        resumeAt: null,
        state: {
          table: { zones: [] },
          songList: "international",
          revealing: false,
          tokens: [],
          bets: [],
          declined: [],
          locked: null,
          guessInChat: true,
          guessed: { title: [], artist: [] },
        },
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
      rooms: [createRoom("ABC234", "host@example.com", "hitster")],
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
  it("upgrades v1 rooms without a pause and preserves a current persisted deadline", () => {
    const room = structuredClone(v0.rooms[0]!);
    const migrated = migrateRoom({
      ...room,
      version: 1,
      settings: {},
      game: {
        ...room.game,
        trackKey: "",
        trackNonce: null,
        state: { ...room.game.state, songList: "international" },
      },
    });
    expect(migrated.version).toBe(ROOM_VERSION);
    expect(migrated.game!.resumeAt).toBeNull();
    expect(migrated.game!.state).toMatchObject({ revealing: false });
    migrated.game!.resumeAt = 1234;
    (migrated.game!.state as { revealing: boolean }).revealing = true;
    expect(migrateRoom(structuredClone(migrated))).toEqual(migrated);
    expect(
      migrateRoom({
        ...createRoom("HITS12", "host@example.com", "hitster"),
        version: 1,
      }).game,
    ).toBeNull();
  });

  it("upgrades a v2 Hitster room saved mid-turn so it plays on with starting tokens and no bets", () => {
    const hitster = games.hitster;
    const live = hitster.resume!(
      hitster.setup({
        players: ["p1", "p2"],
        seed: 3,
        settings: { cardsToWin: "10" },
      }),
    ) as HitsterState;
    const saved = structuredClone(live);
    delete saved.tokens;
    delete saved.bets;
    delete saved.declined;
    delete saved.locked;
    delete saved.guessInChat;
    delete saved.guessed;
    const room = {
      ...createRoom("HITS12", "host@example.com", "hitster"),
      version: 2,
      game: {
        gameId: "hitster",
        players: ["p1", "p2"],
        state: saved,
        result: null,
        turnKey: "p1",
        deadline: null,
        resumeAt: null,
        turnMs: 0,
        trackKey: "",
        trackNonce: null,
      },
    };
    const migrated = migrateRoom(structuredClone(room));
    expect(migrated.version).toBe(ROOM_VERSION);
    expect(migrated.game!.state).toEqual(live);
    expect(migrated.game!.state).toMatchObject({
      tokens: [2, 2],
      bets: [],
      declined: [],
      locked: null,
    });
    expect(migrateRoom(structuredClone(migrated))).toEqual(migrated);
    const bet = hitster.applyMove(migrated.game!.state, "p2", {
      type: "bet",
      index: 0,
    });
    expect(bet).toMatchObject({ ok: true, state: { tokens: [2, 1] } });
    const otherGame = migrateRoom({ ...room, gameId: "fixture", game: null });
    expect(otherGame.game).toBeNull();
  });

  it("upgrades a v3 Hitster room so its table guesses in chat, as the new default, and nobody has guessed yet", () => {
    const hitster = games.hitster;
    const settings = {
      songList: "international",
      cardsToWin: "10",
      showSongInfo: false,
    };
    const live = hitster.resume!(
      hitster.setup({ players: ["p1", "p2"], seed: 5, settings }),
    ) as HitsterState;
    expect(live).toMatchObject({
      guessInChat: true,
      guessed: { title: [], artist: [] },
    });
    const saved = structuredClone(live);
    delete saved.guessInChat;
    delete saved.guessed;
    const room = {
      ...createRoom("HITS12", "host@example.com", "hitster"),
      version: 3,
      settings,
      game: {
        gameId: "hitster",
        players: ["p1", "p2"],
        state: saved,
        result: null,
        turnKey: "",
        deadline: null,
        resumeAt: null,
        turnMs: 0,
        trackKey: "",
        trackNonce: null,
      },
    };
    const migrated = migrateRoom(structuredClone(room));
    expect(migrated.version).toBe(ROOM_VERSION);
    expect(migrated.settings).toEqual({ ...settings, guessInChat: true });
    expect(migrated.game!.state).toEqual(live);
    expect(migrateRoom(structuredClone(migrated))).toEqual(migrated);
    expect(games.hitster.view(migrated.game!.state, "p1")).toMatchObject({
      guessing: true,
      yourGuess: { title: false, artist: false },
    });

    // A host who turned guessing off keeps it off, and other games are left alone.
    const off = migrateRoom({
      ...structuredClone(room),
      settings: { ...settings, guessInChat: false },
      game: null,
    });
    expect(off.settings.guessInChat).toBe(false);
    const otherGame = migrateRoom({ ...room, gameId: "fixture", game: null });
    expect(otherGame.settings).toEqual(settings);
  });
});
