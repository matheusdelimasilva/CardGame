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

  it("migrates legacy sessions at load time and persists sliding timestamps", () => {
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
      store.close();
      expect(new JsonStore(file).data.sessions.old).toEqual({
        email,
        lastUsed: later,
      });
      expect(auth.emailFor("old", later + 30 * 24 * 60 * 60 * 1000)).toBeNull();
      store.close();
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
        sessions: { token: session },
        history: { [email]: [entry] },
        rooms: [room],
      };
      store.save();
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
    store.save();
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
    store.save();
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
    restored.save();
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

  it("debounces in-place room mutations and never rewrites unchanged rooms", async () => {
    const store = await open();
    const changed = runningRoom();
    const untouched = runningRoom("DEF567");
    store.data.rooms = [changed, untouched];
    await store.flush();
    const versions = async () =>
      (
        await sql.query<{ code: string; version: string }>(
          "SELECT code, xmin::text AS version FROM rooms ORDER BY code",
        )
      ).rows;
    const before = await versions();
    changed.members[0]!.name = "Changed";
    store.save();
    changed.members[0]!.name = "Latest";
    store.save();
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
    store.save();
    await store.flush();
    expect(await versions()).toEqual(after);
    store.data.rooms = [untouched];
    await store.flush();
    expect(await versions()).toEqual([before[1]]);
  });

  it("rolls back failed batches and retries all changes without losing the baseline", async () => {
    const store = await open();
    await sql.query(
      "ALTER TABLE rooms ADD CONSTRAINT reject_test_room CHECK (code <> 'ABC234')",
    );
    store.data.sessions.token = { ...session };
    store.data.history[email] = [entry];
    store.data.rooms = [runningRoom()];
    await expect(store.flush()).rejects.toThrow(/reject_test_room/);
    expect((await sql.query("SELECT * FROM sessions")).rows).toEqual([]);
    expect((await sql.query("SELECT * FROM history")).rows).toEqual([]);
    await sql.query("ALTER TABLE rooms DROP CONSTRAINT reject_test_room");
    await store.flush();
    expect((await sql.query("SELECT * FROM sessions")).rows).toEqual([
      { token: "token", email, last_used: String(session.lastUsed) },
    ]);
    expect(
      (await sql.query("SELECT snapshot FROM rooms")).rows[0].snapshot,
    ).toEqual(store.data.rooms[0]);
  });

  it("serializes overlapping flushes and preserves mutations made during database IO", async () => {
    const store = await open();
    const room = runningRoom();
    store.data.rooms = [room];
    await store.flush();
    const lock = await sql.connect();
    await lock.query("BEGIN");
    await lock.query("LOCK TABLE rooms IN ACCESS EXCLUSIVE MODE");
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    try {
      room.members[0]!.name = "First";
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
      sessions: { token: session },
      history: { [email]: [entry] },
      rooms: [room],
    };
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
