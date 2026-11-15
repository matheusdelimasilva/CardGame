import { beforeEach, describe, expect, it, vi } from "vitest";
import { Auth } from "../src/auth";
import { PostgresStore } from "../src/store";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  write: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
}));
vi.mock("pg", () => ({
  Pool: class {
    query = db.query;
    on = vi.fn();
    end = db.end;
    async connect() {
      return { query: db.write, release: db.release };
    }
  },
}));

describe("Postgres session timestamps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockImplementation(async (sql: string) => ({
      rows:
        sql === "SELECT token, email, last_used FROM sessions"
          ? [{ token: "saved", email: "a@example.com", last_used: "1000" }]
          : [],
    }));
    db.write.mockResolvedValue({ rows: [] });
  });

  it("migrates the legacy column, loads timestamps and persists sliding updates", async () => {
    const store = new PostgresStore("postgres://unused");
    await store.ready;
    expect(db.query.mock.calls[0]![0]).toContain(
      "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used BIGINT",
    );
    expect(db.query.mock.calls[0]![0]).toMatch(
      /UPDATE sessions SET last_used = \d+ WHERE last_used IS NULL/,
    );
    expect(store.data.sessions.saved).toEqual({
      email: "a@example.com",
      lastUsed: 1000,
    });
    expect(new Auth(store, null).emailFor("saved", 2000)).toBe("a@example.com");
    await store.close();
    expect(db.write).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO sessions (token, email, last_used)"),
      ["saved", "a@example.com", "2000"],
    );
    expect(db.end).toHaveBeenCalledOnce();
  });

  it("deletes expired persisted sessions", async () => {
    const store = new PostgresStore("postgres://unused");
    await store.ready;
    expect(
      new Auth(store, null).emailFor("saved", 31 * 24 * 60 * 60 * 1000),
    ).toBeNull();
    await store.close();
    expect(db.write).toHaveBeenCalledWith(
      "DELETE FROM sessions WHERE token = $1",
      ["saved"],
    );
  });
});
