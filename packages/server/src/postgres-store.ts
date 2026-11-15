import { Pool } from "pg";
import type { HistoryEntry } from "@cardgame/protocol";
import {
  DATA_VERSION,
  ROOM_VERSION,
  checkVersion,
  migrateData,
  postgresMigrations,
} from "./migrations";
import {
  BufferedStore,
  PartialWriteError,
  dirtyKeys,
  type Dirty,
} from "./persistence";
import type { Room } from "./rooms";

interface RowWrite {
  table: "sessions" | "history" | "rooms";
  id: string;
  sql: string;
  values: string[];
}

/** Versioned startup migrations and transactions containing only explicitly dirty rows. */
export class PostgresStore extends BufferedStore {
  readonly ready: Promise<void>;
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    super();
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "CREATE TABLE IF NOT EXISTS store_metadata (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)",
      );
      const metadata = await client.query<{ version: number }>(
        "SELECT version FROM store_metadata WHERE id = 1 FOR UPDATE",
      );
      const version = metadata.rows[0]?.version ?? 0;
      checkVersion(version, DATA_VERSION, "Stored data");
      for (let v = version; v < DATA_VERSION; v++)
        await client.query(postgresMigrations[v]!);
      const sessions = await client.query<{
        token: string;
        email: string;
        last_used: string | null;
      }>("SELECT token, email, last_used FROM sessions");
      const history = await client.query<{
        host_email: string;
        entries: HistoryEntry[];
      }>("SELECT host_email, entries FROM history");
      const rooms = await client.query<{ snapshot: Room }>(
        "SELECT snapshot FROM rooms",
      );
      const input = {
        version,
        sessions: Object.fromEntries(
          sessions.rows.map((row) => [
            row.token,
            {
              email: row.email,
              lastUsed:
                row.last_used === null ? undefined : Number(row.last_used),
            },
          ]),
        ),
        history: Object.fromEntries(
          history.rows.map((row) => [row.host_email, row.entries]),
        ),
        rooms: rooms.rows.map((row) => row.snapshot),
      };
      const migratedRooms = input.rooms
        .filter((room) => room.version !== ROOM_VERSION)
        .map((room) => room.code);
      this.data = migrateData(input);
      for (const row of sessions.rows) {
        if (row.last_used === null)
          await client.query(
            "UPDATE sessions SET last_used = $2 WHERE token = $1",
            [row.token, this.data.sessions[row.token]!.lastUsed],
          );
      }
      for (const code of migratedRooms) {
        const room = this.data.rooms.find((room) => room.code === code)!;
        await client.query("UPDATE rooms SET snapshot = $2 WHERE code = $1", [
          code,
          JSON.stringify(room),
        ]);
      }
      if (version < DATA_VERSION)
        await client.query(
          "INSERT INTO store_metadata (id, version) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version",
          [DATA_VERSION],
        );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  protected async write(changes: Dirty): Promise<void> {
    const queries: RowWrite[] = [];
    const pending = dirtyKeys();
    let failure: unknown;
    const failed = (table: RowWrite["table"], id: string, err: unknown) => {
      pending[table].add(id);
      failure = err;
      console.error(
        "Saving Postgres row failed; retained for retry:",
        { table, ...(table === "rooms" ? { code: id } : {}) },
        err,
      );
    };
    for (const [table, key, value] of [
      ["sessions", "token", "email"],
      ["history", "host_email", "entries"],
      ["rooms", "code", "snapshot"],
    ] as const) {
      for (const id of changes[table]) {
        try {
          const row =
            table === "rooms"
              ? this.data.rooms.find((room) => room.code === id)
              : Object.hasOwn(this.data[table], id)
                ? this.data[table][id]
                : undefined;
          if (row === undefined) {
            queries.push({
              table,
              id,
              sql: `DELETE FROM ${table} WHERE ${key} = $1`,
              values: [id],
            });
          } else if (table === "sessions") {
            const session = this.data.sessions[id]!;
            queries.push({
              table,
              id,
              sql: "INSERT INTO sessions (token, email, last_used) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET email = EXCLUDED.email, last_used = EXCLUDED.last_used",
              values: [id, session.email, String(session.lastUsed)],
            });
          } else {
            queries.push({
              table,
              id,
              sql: `INSERT INTO ${table} (${key}, ${value}) VALUES ($1, $2) ON CONFLICT (${key}) DO UPDATE SET ${value} = EXCLUDED.${value}`,
              values: [id, JSON.stringify(row)],
            });
          }
        } catch (err) {
          failed(table, id, err);
        }
      }
    }
    if (queries.length) {
      try {
        await this.transaction(queries);
      } catch {
        for (const query of queries) {
          try {
            await this.transaction([query]);
          } catch (err) {
            failed(query.table, query.id, err);
          }
        }
      }
    }
    if (pending.rooms.size || pending.sessions.size || pending.history.size)
      throw new PartialWriteError(pending, failure);
  }

  private async transaction(queries: RowWrite[]): Promise<void> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      for (const { sql, values } of queries) await client.query(sql, values);
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        broken = true;
      }
      throw err;
    } finally {
      client.release(broken);
    }
  }

  async close(): Promise<void> {
    try {
      await super.close();
    } finally {
      await this.pool.end();
    }
  }
}
