import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonStore } from "../src/store";

vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof fs>()),
}));

const dirs: string[] = [];
function file() {
  const dir = mkdtempSync(join(tmpdir(), "cardgame-async-"));
  dirs.push(dir);
  return join(dir, "db.json");
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe("JSON persistence", () => {
  it("starts empty only for a missing file; refuses corrupt, unreadable and future snapshots without overwriting", async () => {
    const path = file();
    const missing = new JsonStore(path);
    await missing.close();
    expect(existsSync(path)).toBe(false);
    for (const contents of [
      "{bad json",
      JSON.stringify({ version: 999 }),
      JSON.stringify({ rooms: [{ version: 999 }] }),
    ]) {
      writeFileSync(path, contents);
      expect(() => new JsonStore(path)).toThrow(path);
      expect(readFileSync(path, "utf8")).toBe(contents);
    }
    expect(() => new JsonStore(join(path, "not-a-file"))).toThrow(
      /Cannot load JSON snapshot/,
    );
  });

  it("debounces 300ms, writes asynchronously and skips clean flushes", async () => {
    vi.useFakeTimers();
    const path = file();
    const store = new JsonStore(path);
    const writes = vi.spyOn(fs, "writeFile");
    store.data.sessions.token = { email: "host@example.com", lastUsed: 1 };
    store.save({ sessions: ["token"] });
    await vi.advanceTimersByTimeAsync(299);
    expect(writes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await store.flush();
    expect(writes).toHaveBeenCalledOnce();
    await store.close();
    expect(writes).toHaveBeenCalledOnce();
    expect(JSON.parse(readFileSync(path, "utf8")).sessions.token.lastUsed).toBe(
      1,
    );
  });

  it("orders overlapping writes and flushes the latest changes before close resolves", async () => {
    const path = file();
    const store = new JsonStore(path);
    const original = fs.writeFile;
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events: string[] = [];
    vi.spyOn(fs, "writeFile")
      .mockImplementationOnce(async (...args) => {
        events.push("first start");
        started();
        await blocked;
        await original(...args);
        events.push("first end");
      })
      .mockImplementation(async (...args) => {
        events.push("second start");
        await original(...args);
      });
    store.data.sessions.token = { email: "host@example.com", lastUsed: 1 };
    store.save({ sessions: ["token"] });
    const first = store.flush();
    await entered;
    store.data.sessions.token.lastUsed = 2;
    store.save({ sessions: ["token"] });
    let closed = false;
    const closing = store.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(events).toEqual(["first start"]);
    expect(closed).toBe(false);
    release();
    await Promise.all([first, closing]);
    expect(events).toEqual(["first start", "first end", "second start"]);
    expect(JSON.parse(readFileSync(path, "utf8")).sessions.token.lastUsed).toBe(
      2,
    );
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("retains dirty keys after failed writes and retries without poisoning the queue", async () => {
    const path = file();
    const store = new JsonStore(path);
    store.data.sessions.token = { email: "host@example.com", lastUsed: 1 };
    store.save({ sessions: ["token"] });
    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("rename failed"));
    await expect(store.flush()).rejects.toThrow("rename failed");
    await store.close();
    expect(JSON.parse(readFileSync(path, "utf8")).sessions.token.lastUsed).toBe(
      1,
    );
  });
});
