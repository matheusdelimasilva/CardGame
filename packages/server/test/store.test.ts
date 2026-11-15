import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { HistoryEntry, ServerMessage } from "@cardgame/protocol";
import { Pool } from "pg";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { Auth } from "../src/auth";
import * as rooms from "../src/rooms";
import { startClock } from "../src/rooms/clock";
import { RoomRegistry } from "../src/rooms/registry";
import { RoomService } from "../src/rooms/service";
import { createStore, JsonStore, PostgresStore } from "../src/store";

const email = "host@example.com";
const session = { email, lastUsed: Date.now() };
const entry: HistoryEntry = {
  roomCode: "ABC234",
  gameId: "demo",
  gameName: "Demo",
  players: ["Ana", "Bo"],
  winners: ["Ana"],
  endedAt: "2026-11-14T12:00:00.000Z",
};

function runningRoom(code = "ABC234") {
  const room = rooms.createRoom(code, email, "demo");
  for (const [i, name] of ["Ana", "Bo"].entries()) {
    const member = rooms.join(room, undefined, i === 0);
    member.connected = true;
    rooms.setName(room, member, name);
    rooms.sit(room, member, i);
  }
  expect(rooms.start(room, room.members[0]!, 7)).toBeNull();
  return room;
}

describe("JSON store and selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("migrates legacy sessions at load time and persists sliding timestamps", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cardgame-legacy-"));
    try {
      const file = join(dir, "db.json");
      writeFileSync(
        file,
        JSON.stringify({
          sessions: {
            old: email,
            missingTimestamp: { email },
            existing: session,
          },
        }),
      );
      const before = Date.now();
      const store = new JsonStore(file);
      expect(store.data.sessions.old!.email).toBe(email);
      expect(store.data.sessions.old!.lastUsed).toBeGreaterThanOrEqual(before);
      expect(store.data.sessions.missingTimestamp).toEqual(
        store.data.sessions.old,
      );
      expect(store.data.sessions.existing).toEqual(session);
      const auth = new Auth(store, null);
      const later = Date.now() + 1000;
      expect(auth.emailFor("old", later)).toBe(email);
      await store.close();
      expect(new JsonStore(file).data.sessions.old).toEqual({
        email,
        lastUsed: later,
      });
      expect(auth.emailFor("old", later + 30 * 24 * 60 * 60 * 1000)).toBeNull();
      await store.close();
      expect(new JsonStore(file).data.sessions.old).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to JSON and round-trips sessions, ordered history and a running game", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const dir = mkdtempSync(join(tmpdir(), "cardgame-store-"));
    try {
      const file = join(dir, "nested", "db.json");
      const store = createStore(file);
      expect(store).toBeInstanceOf(JsonStore);
      const room = runningRoom();
      store.data = {
        version: 1,
        sessions: { token: session },
        history: { [email]: [entry] },
        rooms: [room],
      };
      store.save({ rooms: [room.code], sessions: ["token"], history: [email] });
      await store.close();
      const restored = new JsonStore(file);
      expect(restored.data).toEqual(store.data);
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(store.data);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps explicit null in memory even when DATABASE_URL is set", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://invalid:invalid@localhost:1/invalid",
    );
    const store = createStore(null);
    expect(store).toBeInstanceOf(JsonStore);
    store.data.sessions.token = { ...session };
    store.save({ sessions: ["token"] });
    await store.close();
    expect(createStore(null).data.sessions).toEqual({});
    const app = createApp({ dataFile: null, sendEmail: null });
    await app.ready;
    await app.close();
  });
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("Postgres store (TEST_DATABASE_URL)", () => {
  let admin: Pool;
  let sql: Pool;
  let url: string;
  let schema: string;
  const stores = new Set<PostgresStore>();
  const apps = new Set<ReturnType<typeof createApp>>();

  beforeEach(async () => {
    // Each test owns a fresh schema; no existing application tables are touched.
    schema = `cardgame_test_${randomUUID().replaceAll("-", "")}`;
    admin = new Pool({ connectionString: testDatabaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const connection = new URL(testDatabaseUrl!);
    const options = connection.searchParams.get("options") ?? "";
    connection.searchParams.set(
      "options",
      `${options} -c search_path=${schema}`.trim(),
    );
    url = connection.toString();
    sql = new Pool({ connectionString: url });
  });

  afterEach(async () => {
    try {
      for (const app of apps) await app.close();
      for (const store of stores) await store.close();
    } finally {
      apps.clear();
      stores.clear();
      vi.unstubAllEnvs();
      await sql?.end();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.end();
      }
    }
  });

  async function open() {
    const store = new PostgresStore(url);
    stores.add(store);
    await store.ready;
    return store;
  }

  async function close(store: PostgresStore) {
    stores.delete(store);
    await store.close();
  }

  it("creates its schema, restores all data and keeps pending sign-in codes in memory", async () => {
    vi.stubEnv("DATABASE_URL", url);
    const store = createStore("unused.json");
    expect(store).toBeInstanceOf(PostgresStore);
    stores.add(store as PostgresStore);
    await store.ready;
    const auth = new Auth(store, null);
    const { devCode } = await auth.requestCode(email);
    const { token } = auth.verify(email, devCode!);
    const pending = await auth.requestCode("pending@example.com");
    const room = runningRoom();
    store.data.history[email] = [
      entry,
      { ...entry, endedAt: "2026-11-13T12:00:00.000Z" },
    ];
    store.data.rooms = [room];
    store.save({ rooms: [room.code], history: [email] });
    await close(store as PostgresStore);

    const restored = await open();
    expect(restored.data).toEqual(store.data);
    const restartedAuth = new Auth(restored, null);
    expect(restartedAuth.emailFor(token)).toBe(email);
    expect(
      restartedAuth.verify("pending@example.com", pending.devCode!).error,
    ).toMatch(/expired/);
    restartedAuth.signOut(token!);
    restored.data.rooms = [];
    restored.save({ rooms: [room.code] });
    await close(restored);
    const final = await open();
    expect(final.data.sessions).toEqual({});
    expect(final.data.rooms).toEqual([]);
    expect(final.data.history[email]).toEqual(store.data.history[email]);
    expect(
      (
        await sql.query(
          "SELECT data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'rooms' AND column_name = 'snapshot'",
          [schema],
        )
      ).rows[0].data_type,
    ).toBe("jsonb");
  });

  it("migrates legacy Postgres sessions without losing tokens", async () => {
    await sql.query(
      "CREATE TABLE sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL)",
    );
    await sql.query("INSERT INTO sessions VALUES ($1, $2)", ["legacy", email]);
    const before = Date.now();
    const store = await open();
    expect(store.data.sessions.legacy!.email).toBe(email);
    expect(store.data.sessions.legacy!.lastUsed).toBeGreaterThanOrEqual(before);
    const later = Date.now() + 1000;
    new Auth(store, null).emailFor("legacy", later);
    await close(store);
    expect((await open()).data.sessions.legacy).toEqual({
      email,
      lastUsed: later,
    });
  });

  it("persists a normal room after unauthenticated sign-out of inherited session keys", async () => {
    const store = await open();
    const auth = new Auth(store, null);
    for (const token of ["__proto__", "constructor", "toString"]) {
      expect(auth.emailFor(token)).toBeNull();
      auth.signOut(token);
    }
    const room = runningRoom();
    store.data.rooms = [room];
    store.save({ rooms: [room.code] });
    await expect(store.flush()).resolves.toBeUndefined();
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows[0].snapshot,
    ).toEqual(room);
    expect((await sql.query("SELECT * FROM sessions")).rows).toEqual([]);
  });

  it("ignores inherited session and history values even if dirty keys are passed directly", async () => {
    const store = await open();
    store.data.sessions = {};
    store.data.history = {};
    const room = runningRoom();
    store.data.rooms = [room];
    store.save({
      rooms: [room.code],
      sessions: ["__proto__", "constructor"],
      history: ["__proto__", "constructor"],
    });
    await store.flush();
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows[0].snapshot,
    ).toEqual(room);
    expect((await sql.query("SELECT * FROM sessions")).rows).toEqual([]);
    expect((await sql.query("SELECT * FROM history")).rows).toEqual([]);
  });

  it("isolates a permanently bad row without blocking good rows or dropping pending data", async () => {
    const store = await open();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await sql.query(
      "ALTER TABLE rooms ADD CONSTRAINT reject_test_room CHECK (code <> 'ABC234')",
    );
    const bad = runningRoom();
    const good = runningRoom("DEF567");
    store.data.rooms = [bad, good];
    store.data.sessions.token = { ...session };
    store.data.history[email] = [entry];
    store.save({
      rooms: [bad.code, good.code],
      sessions: ["token"],
      history: [email],
    });
    for (let attempt = 0; attempt < 4; attempt++)
      await expect(store.flush()).rejects.toThrow(/reject_test_room/);
    expect(log).toHaveBeenCalledWith(
      "Saving Postgres row failed; retained for retry:",
      { table: "rooms", code: bad.code },
      expect.any(Error),
    );
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows.map(
        (row) => row.snapshot,
      ),
    ).toEqual([good]);
    expect((await sql.query("SELECT token FROM sessions")).rows).toEqual([
      { token: "token" },
    ]);
    expect((await sql.query("SELECT entries FROM history")).rows).toEqual([
      { entries: [entry] },
    ]);
    good.members[0]!.name = "Updated";
    store.save({ rooms: [good.code] });
    await expect(store.flush()).rejects.toThrow(/reject_test_room/);
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows.map(
        (row) => row.snapshot,
      ),
    ).toEqual([good]);
    await sql.query("ALTER TABLE rooms DROP CONSTRAINT reject_test_room");
    await store.flush();
    expect(
      (await sql.query("SELECT snapshot FROM rooms ORDER BY code")).rows.map(
        (row) => row.snapshot,
      ),
    ).toEqual([bad, good]);
    log.mockRestore();
  });

  it("retains sessions, history and rooms through a temporary database write outage", async () => {
    const store = await open();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await sql.query(`CREATE FUNCTION reject_outage() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'temporary storage outage'; END $$`);
    for (const table of ["sessions", "history", "rooms"])
      await sql.query(
        `CREATE TRIGGER unavailable BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_outage()`,
      );
    const room = runningRoom();
    store.data.sessions.token = { ...session };
    store.data.history[email] = [entry];
    store.data.rooms = [room];
    store.save({ sessions: ["token"], history: [email], rooms: [room.code] });
    for (let attempt = 0; attempt < 4; attempt++)
      await expect(store.flush()).rejects.toThrow(/temporary storage outage/);
    for (const table of ["sessions", "history", "rooms"]) {
      expect((await sql.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
      await sql.query(`DROP TRIGGER unavailable ON ${table}`);
    }
    await store.flush();
    await close(store);
    expect((await open()).data).toEqual(store.data);
    log.mockRestore();
  });

  it("debounces in-place room mutations and never rewrites unchanged rooms", async () => {
    const store = await open();
    const changed = runningRoom();
    const untouched = runningRoom("DEF567");
    store.data.rooms = [changed, untouched];
    store.save({ rooms: [changed.code, untouched.code] });
    await store.flush();
    const versions = async () =>
      (
        await sql.query<{ code: string; version: string }>(
          "SELECT code, xmin::text AS version FROM rooms ORDER BY code",
        )
      ).rows;
    const before = await versions();
    const serialized = vi.fn(() => {
      throw new Error("Untouched room was serialized");
    });
    Object.defineProperty(untouched, "toJSON", { value: serialized });
    changed.members[0]!.name = "Changed";
    store.save({ rooms: [changed.code] });
    changed.members[0]!.name = "Latest";
    store.save({ rooms: [changed.code] });
    expect(await versions()).toEqual(before);
    await expect
      .poll(
        async () =>
          (
            await sql.query("SELECT snapshot FROM rooms WHERE code = $1", [
              changed.code,
            ])
          ).rows[0].snapshot.members[0].name,
      )
      .toBe("Latest");
    const after = await versions();
    expect(after[0]!.version).not.toBe(before[0]!.version);
    expect(after[1]).toEqual(before[1]);
    store.data.sessions.another = { ...session };
    store.save({ sessions: ["another"] });
    await store.flush();
    expect(await versions()).toEqual(after);
    store.data.rooms = [untouched];
    store.save({ rooms: [changed.code] });
    await store.flush();
    expect(await versions()).toEqual([before[1]]);
    expect(serialized).not.toHaveBeenCalled();
  });

  it("migrates unversioned Postgres room snapshots and records versions atomically", async () => {
    await sql.query(
      "CREATE TABLE rooms (code TEXT PRIMARY KEY, snapshot JSONB NOT NULL)",
    );
    const room = runningRoom();
    const legacy = JSON.parse(JSON.stringify(room));
    delete legacy.version;
    delete legacy.settings;
    delete legacy.game.trackKey;
    delete legacy.game.trackNonce;
    delete legacy.game.resumeAt;
    await sql.query("INSERT INTO rooms VALUES ($1, $2)", [
      room.code,
      JSON.stringify(legacy),
    ]);
    const store = await open();
    expect(store.data.version).toBe(1);
    expect(store.data.rooms[0]).toEqual({
      ...room,
      settings: {},
      game: { ...room.game, trackKey: "", trackNonce: null },
    });
    expect(
      (await sql.query("SELECT version FROM store_metadata")).rows,
    ).toEqual([{ version: 1 }]);
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows[0].snapshot,
    ).toEqual(store.data.rooms[0]);
    await close(store);
    expect((await open()).data.rooms).toEqual(store.data.rooms);
  });

  it("persists a reveal deadline and resumes an overdue restored Hitster game on the next clock tick", async () => {
    const store = await open();
    const room = rooms.createRoom("PAUSE1", email, "hitster");
    for (const [i, name] of ["Ana", "Bo"].entries()) {
      const member = rooms.join(room, undefined, i === 0);
      rooms.setName(room, member, name);
      rooms.sit(room, member, i);
    }
    const host = room.members[0]!;
    rooms.start(room, host, 7, 1000);
    const nonce = room.game!.trackNonce;
    expect(rooms.move(room, host, { type: "pass" }, 1000)).toBeNull();
    expect(room.game!.resumeAt).toBe(5000);
    store.data.rooms = [room];
    store.save({ rooms: [room.code] });
    await close(store);

    const restored = await open();
    const registry = new RoomRegistry(restored);
    await registry.ready;
    const loaded = registry.get(room.code)!;
    expect(loaded.game).toEqual(room.game);
    expect(loaded.game).toMatchObject({
      resumeAt: 5000,
      trackNonce: nonce,
      state: { revealing: true },
    });
    const service = new RoomService(registry, restored);
    const changed = vi.fn();
    service.onChange(changed);
    const intervals = vi.spyOn(globalThis, "setInterval");
    const stop = startClock(registry, service);
    try {
      const clock = intervals.mock.calls.at(-1)![0] as () => void;
      expect(changed).not.toHaveBeenCalled();
      clock();
      expect(loaded.game).toMatchObject({
        resumeAt: null,
        state: { revealing: false, turnNumber: 2 },
      });
      expect(loaded.game!.trackNonce).not.toBe(nonce);
      expect(changed).toHaveBeenCalledExactlyOnceWith(loaded);
      clock();
      expect(changed).toHaveBeenCalledOnce();
      await restored.flush();
    } finally {
      stop();
      intervals.mockRestore();
    }
    await close(restored);
    expect((await open()).data.rooms[0]!.game).toEqual(loaded.game);
  });

  it("refuses future data versions without changing the database", async () => {
    await sql.query(
      "CREATE TABLE store_metadata (id INTEGER PRIMARY KEY, version INTEGER NOT NULL); INSERT INTO store_metadata VALUES (1, 99)",
    );
    const store = new PostgresStore(url);
    await expect(store.ready).rejects.toThrow(
      /version 99 is newer than supported/,
    );
    await expect(store.close()).rejects.toThrow(/version 99/);
    expect(
      (await sql.query("SELECT version FROM store_metadata")).rows,
    ).toEqual([{ version: 99 }]);
    expect(
      (await sql.query("SELECT to_regclass('sessions') AS table_name")).rows[0]
        .table_name,
    ).toBeNull();
  });

  it("refuses future room versions and rolls back startup migrations", async () => {
    await sql.query(
      "CREATE TABLE sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL); CREATE TABLE rooms (code TEXT PRIMARY KEY, snapshot JSONB NOT NULL)",
    );
    const future = { ...runningRoom(), version: 99 };
    await sql.query("INSERT INTO rooms VALUES ($1, $2)", [
      future.code,
      JSON.stringify(future),
    ]);
    const store = new PostgresStore(url);
    await expect(store.ready).rejects.toThrow(/Room snapshot version 99/);
    await expect(store.close()).rejects.toThrow(/Room snapshot version 99/);
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows[0].snapshot,
    ).toEqual(future);
    expect(
      (await sql.query("SELECT to_regclass('store_metadata') AS table_name"))
        .rows[0].table_name,
    ).toBeNull();
    expect(
      (
        await sql.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'sessions' ORDER BY column_name",
          [schema],
        )
      ).rows.map((row) => row.column_name),
    ).toEqual(["email", "token"]);
  });

  it("rolls back failed batches, saves valid rows and retries only failed rows", async () => {
    const store = await open();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await sql.query(
      "ALTER TABLE rooms ADD CONSTRAINT reject_test_room CHECK (code <> 'ABC234')",
    );
    store.data.sessions.token = { ...session };
    store.data.history[email] = [entry];
    store.data.rooms = [runningRoom()];
    store.save({ sessions: ["token"], history: [email], rooms: ["ABC234"] });
    await expect(store.flush()).rejects.toThrow(/reject_test_room/);
    expect((await sql.query("SELECT * FROM sessions")).rows).toEqual([
      { token: "token", email, last_used: String(session.lastUsed) },
    ]);
    expect((await sql.query("SELECT entries FROM history")).rows).toEqual([
      { entries: [entry] },
    ]);
    expect((await sql.query("SELECT * FROM rooms")).rows).toEqual([]);
    const before = (await sql.query("SELECT xmin::text FROM sessions")).rows;
    await sql.query("ALTER TABLE rooms DROP CONSTRAINT reject_test_room");
    await store.flush();
    expect((await sql.query("SELECT * FROM sessions")).rows).toEqual([
      { token: "token", email, last_used: String(session.lastUsed) },
    ]);
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows[0].snapshot,
    ).toEqual(store.data.rooms[0]);
    expect((await sql.query("SELECT xmin::text FROM sessions")).rows).toEqual(
      before,
    );
    log.mockRestore();
  });

  it("isolates serialization errors without blocking other rooms", async () => {
    const store = await open();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = runningRoom();
    const good = runningRoom("DEF567");
    Object.defineProperty(bad, "toJSON", {
      configurable: true,
      value: () => {
        throw new Error("cannot serialize room");
      },
    });
    store.data.rooms = [bad, good];
    store.save({ rooms: [bad.code, good.code] });
    await expect(store.flush()).rejects.toThrow("cannot serialize room");
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows.map(
        (row) => row.snapshot,
      ),
    ).toEqual([good]);
    Reflect.deleteProperty(bad, "toJSON");
    await store.flush();
    expect(
      (await sql.query("SELECT code FROM rooms ORDER BY code")).rows,
    ).toEqual([{ code: bad.code }, { code: good.code }]);
    log.mockRestore();
  });

  it("serializes overlapping flushes and preserves mutations made during database IO", async () => {
    const store = await open();
    const room = runningRoom();
    store.data.rooms = [room];
    store.save({ rooms: [room.code] });
    await store.flush();
    const lock = await sql.connect();
    await lock.query("BEGIN");
    await lock.query("LOCK TABLE rooms IN ACCESS EXCLUSIVE MODE");
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    try {
      room.members[0]!.name = "First";
      store.save({ rooms: [room.code] });
      first = store.flush();
      await expect
        .poll(async () =>
          Number(
            (
              await sql.query(
                "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'INSERT INTO rooms%'",
              )
            ).rows[0].count,
          ),
        )
        .toBeGreaterThan(0);
      room.members[0]!.name = "Second";
      store.save({ rooms: [room.code] });
      second = store.flush();
    } finally {
      await lock.query("ROLLBACK");
      lock.release();
      await Promise.all([first, second]);
    }
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows[0].snapshot
        .members[0].name,
    ).toBe("Second");
  });

  it("restores sessions, history, seats and a running game through createApp after restart", async () => {
    const store = await open();
    const room = runningRoom();
    store.data = {
      version: 1,
      sessions: { token: session },
      history: { [email]: [entry] },
      rooms: [room],
    };
    store.save({ rooms: [room.code], sessions: ["token"], history: [email] });
    await close(store);
    vi.stubEnv("DATABASE_URL", url);
    const app = createApp({ dataFile: "unused.json", sendEmail: null });
    apps.add(app);
    // Even callers that listen immediately have their requests gated on ready.
    await new Promise<void>((resolve) => app.server.listen(0, resolve));
    const base = `localhost:${(app.server.address() as AddressInfo).port}`;
    const me = await fetch(`http://${base}/api/me`, {
      headers: { Authorization: "Bearer token" },
    });
    expect(await me.json()).toEqual({ email });
    const history = await fetch(`http://${base}/api/history`, {
      headers: { Authorization: "Bearer token" },
    });
    expect(await history.json()).toEqual({ history: [entry] });
    const ws = new WebSocket(`ws://${base}/ws?room=${room.code}`);
    try {
      const state = new Promise<Extract<ServerMessage, { type: "state" }>>(
        (resolve, reject) => {
          ws.on("error", reject);
          ws.on("message", (raw) => {
            const msg = JSON.parse(String(raw)) as ServerMessage;
            if (msg.type === "state") resolve(msg);
          });
        },
      );
      await new Promise<void>((resolve) => ws.once("open", resolve));
      ws.send(
        JSON.stringify({
          type: "hello",
          memberToken: room.members[0]!.token,
          sessionToken: "token",
        }),
      );
      const { room: view } = await state;
      expect(view.you).toMatchObject({
        id: room.members[0]!.id,
        seat: 0,
        isHost: true,
      });
      expect(view.seats[1]).toMatchObject({ name: "Bo", connected: false });
      expect(view.game).not.toBeNull();
      expect(view.game!.players).toEqual(room.game!.players);
    } finally {
      ws.terminate();
    }
    apps.delete(app);
    await app.close();
    const restored = await open();
    expect(restored.data.rooms[0]!.game).toEqual(room.game);
    expect(restored.data.rooms[0]!.members.every((m) => !m.connected)).toBe(
      true,
    );
  });
});
