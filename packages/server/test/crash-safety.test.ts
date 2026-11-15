import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { games, type HitsterState } from "@cardgame/games";
import type { RoomView } from "@cardgame/protocol";
import { createApp } from "../src/app";
import { Deezer } from "../src/deezer";
import * as rooms from "../src/rooms";

function running(code: string) {
  const room = rooms.createRoom(code, "host@example.com", "hitster");
  for (let i = 0; i < 2; i++) {
    const member = rooms.join(room, undefined, i === 0);
    rooms.setName(room, member, `Player ${i}`);
    rooms.sit(room, member, i);
  }
  expect(rooms.start(room, room.members[0]!, 42)).toBeNull();
  return room;
}

describe("crash safety", () => {
  let app: ReturnType<typeof createApp> | undefined;
  let dir: string;
  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function boot(saved: rooms.Room[]) {
    dir = await mkdtemp(join(tmpdir(), "cardgame-crash-"));
    const file = join(dir, "db.json");
    await writeFile(file, JSON.stringify({ rooms: saved }));
    app = createApp({ dataFile: file, sendEmail: null });
    await app.ready;
    await new Promise<void>((resolve) => app!.server.listen(0, resolve));
    const base = `localhost:${(app.server.address() as AddressInfo).port}`;
    return { file, base };
  }

  async function connect(base: string, code: string) {
    const ws = new WebSocket(`ws://${base}/ws?room=${code}`);
    const state = new Promise<RoomView>((resolve, reject) => {
      ws.on("error", reject);
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === "state") resolve(msg.room);
      });
    });
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello" })));
    return { ws, room: await state };
  }

  it("restores a stale song snapshot to lobby, preserves seats and isolates other rooms", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = running("STALE1");
    const state = broken.game!.state as HitsterState;
    state.table.zones[`timeline:${broken.members[0]!.id}`]!.cards[0]!.face =
      "Removed Repro Song|Removed Repro Artist";
    const { base, file } = await boot([broken, running("GOOD12")]);
    const stale = await connect(base, "STALE1");
    expect(stale.room.game).toBeNull();
    expect(stale.room.seats.slice(0, 2).map((m) => m!.id)).toEqual(
      broken.members.map((m) => m.id),
    );
    expect((await connect(base, "GOOD12")).room.game).not.toBeNull();
    expect((await fetch(`http://${base}/api/games`)).status).toBe(200);
    expect(log).toHaveBeenCalledWith("Room STALE1:", expect.any(Error));
    await app!.close();
    app = undefined;
    expect(JSON.parse(await readFile(file, "utf8")).rooms[0].game).toBeNull();
  });

  it("drops unknown restored games to lobby", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const room = running("OLD123");
    room.game!.gameId = "removed-game";
    const { base } = await boot([room]);
    expect((await connect(base, room.code)).room.game).toBeNull();
  });

  it.each(["view", "activePlayers"] as const)(
    "recovers a live %s failure and broadcasts lobby",
    async (method) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { base } = await boot([running("LIVE12"), running("GOOD12")]);
      vi.spyOn(games.hitster!, method).mockImplementationOnce(() => {
        throw new Error("broken game");
      });
      expect((await connect(base, "LIVE12")).room.game).toBeNull();
      expect((await connect(base, "GOOD12")).room.game).not.toBeNull();
    },
  );

  it("contains a message handler failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { base } = await boot([running("LIVE12")]);
    const client = await connect(base, "LIVE12");
    vi.spyOn(rooms, "setName").mockImplementationOnce(() => {
      throw new Error("handler failed");
    });
    const next = new Promise<{ room: RoomView }>((resolve) =>
      client.ws.once("message", (raw) => resolve(JSON.parse(String(raw)))),
    );
    client.ws.send(JSON.stringify({ type: "setName", name: "New name" }));
    expect((await next).room.game).toBeNull();
    expect((await fetch(`http://${base}/api/games`)).status).toBe(200);
  });

  it("contains a close handler view failure and updates the remaining client", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { base } = await boot([running("LIVE12")]);
    const first = await connect(base, "LIVE12");
    const second = await connect(base, "LIVE12");
    vi.spyOn(games.hitster!, "view").mockImplementationOnce(() => {
      throw new Error("close view failed");
    });
    const next = new Promise<{ room: RoomView }>((resolve) =>
      first.ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.type === "state" && msg.room.game === null) resolve(msg);
      }),
    );
    second.ws.close();
    expect((await next).room.game).toBeNull();
  });

  it("contains timer errors per room and continues processing other rooms", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const intervals = vi.spyOn(globalThis, "setInterval");
    const broken = running("LIVE12");
    const good = running("GOOD12");
    broken.game!.deadline = good.game!.deadline = Date.now() + 60_000;
    const { base } = await boot([broken, good]);
    const client = await connect(base, "LIVE12");
    const expire = vi.spyOn(rooms, "expireTurn").mockImplementationOnce(() => {
      throw new Error("timer failed");
    });
    const next = new Promise<{ room: RoomView }>((resolve) =>
      client.ws.once("message", (raw) => resolve(JSON.parse(String(raw)))),
    );
    const clock = intervals.mock.calls.find(
      ([, delay]) => delay === 250,
    )![0] as () => void;
    clock();
    expect((await next).room.game).toBeNull();
    expect(expire.mock.calls.map(([room]) => room.code)).toEqual([
      "LIVE12",
      "GOOD12",
    ]);
    expect((await connect(base, "GOOD12")).room.game).not.toBeNull();
  });

  it("returns 500 for a failing track stream without ending the game", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { base } = await boot([running("LIVE12")]);
    const client = await connect(base, "LIVE12");
    vi.spyOn(Deezer.prototype, "streamPreview").mockRejectedValueOnce(
      new Error("Deezer fetch failed"),
    );
    const res = await fetch(`http://${base}${client.room.game!.track!.url}`);
    expect(res.status).toBe(500);
    expect((await connect(base, "LIVE12")).room.game).not.toBeNull();
  });

  it("contains idle sweep failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const intervals = vi.spyOn(globalThis, "setInterval");
    const { base } = await boot([]);
    const error = new Error("sweep failed");
    vi.spyOn(Date, "now").mockImplementationOnce(() => {
      throw error;
    });
    const sweep = intervals.mock.calls.find(
      ([, delay]) => delay === 60 * 60 * 1000,
    )![0] as () => void;
    expect(() => sweep()).not.toThrow();
    expect(log).toHaveBeenCalledWith("Room idle sweep:", error);
    expect((await fetch(`http://${base}/api/games`)).status).toBe(200);
  });

  it("drops a restored game whose view throws and still restores healthy rooms", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(games.hitster!, "view").mockImplementationOnce(() => {
      throw new Error("restore failed");
    });
    const { base } = await boot([running("BAD123"), running("GOOD12")]);
    expect((await connect(base, "BAD123")).room.game).toBeNull();
    expect((await connect(base, "GOOD12")).room.game).not.toBeNull();
  });
});
