import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Pool } from "pg";
import type { HistoryEntry } from "@cardgame/protocol";
import type { Room } from "./rooms";

export interface Session {
  email: string;
  lastUsed: number;
}

interface Data {
  sessions: Record<string, Session>;
  /** Host email -> finished games, newest first. */
  history: Record<string, HistoryEntry[]>;
  rooms: Room[];
}

/** Callers mutate the cache synchronously, then schedule persistence with save(). */
export interface Store {
  data: Data;
  ready: Promise<void>;
  save(): void;
  flush(): void | Promise<void>;
  close(): void | Promise<void>;
}

const emptyData = (): Data => ({ sessions: {}, history: {}, rooms: [] });
const WRITE_DELAY_MS = 300;

/** The default local store; null keeps everything in memory. */
export class JsonStore implements Store {
  data = emptyData();
  readonly ready = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.data = { ...this.data, ...JSON.parse(readFileSync(file, "utf8")) };
      const now = Date.now();
      for (const [token, session] of Object.entries(this.data.sessions)) {
        if (typeof session === "string")
          this.data.sessions[token] = { email: session, lastUsed: now };
        else session.lastUsed ??= now;
      }
    } catch {
      // No file yet, or an unreadable one: start empty.
    }
  }

  save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), WRITE_DELAY_MS);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }

  close(): void {
    this.flush();
  }
}

interface Snapshot {
  sessions: Map<string, string>;
  history: Map<string, string>;
  rooms: Map<string, string>;
}

/** Serialized baselines detect in-place mutations without changing room logic. */
function snapshot(data: Data): Snapshot {
  return {
    sessions: new Map(
      Object.entries(data.sessions).map(([token, session]) => [
        token,
        JSON.stringify(session),
      ]),
    ),
    history: new Map(
      Object.entries(data.history).map(([email, entries]) => [
        email,
        JSON.stringify(entries),
      ]),
    ),
    rooms: new Map(data.rooms.map((room) => [room.code, JSON.stringify(room)])),
  };
}

export class PostgresStore implements Store {
  data = emptyData();
  readonly ready: Promise<void>;
  private readonly pool: Pool;
  private saved = snapshot(this.data);
  private timer: NodeJS.Timeout | null = null;
  private writes: Promise<void> = Promise.resolve();
  private closing = false;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10_000,
    });
    this.pool.on("error", (err) =>
      console.error("Postgres connection failed:", err),
    );
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        last_used BIGINT
      );
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used BIGINT;
      UPDATE sessions SET last_used = ${Date.now()} WHERE last_used IS NULL;
      CREATE TABLE IF NOT EXISTS history (
        host_email TEXT PRIMARY KEY,
        entries JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        snapshot JSONB NOT NULL
      );
    `);
    const [sessions, history, rooms] = await Promise.all([
      this.pool.query<{ token: string; email: string; last_used: string }>(
        "SELECT token, email, last_used FROM sessions",
      ),
      this.pool.query<{ host_email: string; entries: HistoryEntry[] }>(
        "SELECT host_email, entries FROM history",
      ),
      this.pool.query<{ snapshot: Room }>("SELECT snapshot FROM rooms"),
    ]);
    this.data = {
      sessions: Object.fromEntries(
        sessions.rows.map((row) => [
          row.token,
          { email: row.email, lastUsed: Number(row.last_used) },
        ]),
      ),
      history: Object.fromEntries(
        history.rows.map((row) => [row.host_email, row.entries]),
      ),
      rooms: rooms.rows.map((row) => row.snapshot),
    };
    this.saved = snapshot(this.data);
  }

  save(): void {
    if (this.closing || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch((err) => {
        // The committed baseline stays intact, so a retry includes failed changes.
        console.error("Saving Postgres data failed; retrying:", err);
        this.save();
      });
    }, WRITE_DELAY_MS);
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Serialize transactions. A failed write must not poison subsequent flushes.
    const write = this.writes
      .catch(() => {})
      .then(async () => {
        await this.ready;
        await this.writeChanges();
      });
    this.writes = write;
    return write;
  }

  private async writeChanges(): Promise<void> {
    // Capture strings before awaiting IO: rooms can keep changing during a write.
    const next = snapshot(this.data);
    const queries: { sql: string; values: string[] }[] = [];
    for (const [table, key, value] of [
      ["sessions", "token", "email"],
      ["history", "host_email", "entries"],
      ["rooms", "code", "snapshot"],
    ] as const) {
      for (const [id, contents] of next[table]) {
        if (this.saved[table].get(id) === contents) continue;
        if (table === "sessions") {
          const session = JSON.parse(contents) as Session;
          queries.push({
            sql: `INSERT INTO sessions (token, email, last_used) VALUES ($1, $2, $3)
                  ON CONFLICT (token) DO UPDATE SET email = EXCLUDED.email, last_used = EXCLUDED.last_used`,
            values: [id, session.email, String(session.lastUsed)],
          });
          continue;
        }
        queries.push({
          sql: `INSERT INTO ${table} (${key}, ${value}) VALUES ($1, $2)
                ON CONFLICT (${key}) DO UPDATE SET ${value} = EXCLUDED.${value}`,
          values: [id, contents],
        });
      }
      for (const id of this.saved[table].keys()) {
        if (!next[table].has(id))
          queries.push({
            sql: `DELETE FROM ${table} WHERE ${key} = $1`,
            values: [id],
          });
      }
    }
    if (!queries.length) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const { sql, values } of queries) await client.query(sql, values);
      await client.query("COMMIT");
      this.saved = next;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    try {
      await this.flush();
    } finally {
      await this.pool.end();
    }
  }
}

/** Explicit in-memory options take precedence over the process environment. */
export function createStore(
  dataFile: string | null,
  databaseUrl = process.env.DATABASE_URL,
): Store {
  return dataFile !== null && databaseUrl
    ? new PostgresStore(databaseUrl)
    : new JsonStore(dataFile);
}
