import { afterEach, describe, expect, it, vi } from "vitest";
import { games } from "@cardgame/games";
import * as rooms from "../src/rooms";
import { RoomRegistry } from "../src/rooms/registry";
import { RoomService } from "../src/rooms/service";
import { JsonStore, type Store } from "../src/store";

async function setup(gameId = "demo") {
  const store = new JsonStore(null);
  const registry = new RoomRegistry(store);
  await registry.ready;
  const service = new RoomService(registry, store);
  const room = registry.create("host@example.com", gameId, {});
  const members = ["Ana", "Bo"].map((name, i) => {
    const member = service.join(room, undefined, i === 0)!;
    expect(service.command(room, member, { type: "setName", name })).toBeNull();
    expect(service.command(room, member, { type: "sit", seat: i })).toBeNull();
    return member;
  });
  const host = members[0]!;
  expect(service.command(room, host, { type: "start" })).toBeNull();
  if (gameId === "hitster") rooms.expireTurn(room, room.game!.resumeAt!);
  return { store, registry, service, room, host, members };
}

afterEach(() => vi.restoreAllMocks());

describe("socket-free room service", () => {
  it("marks only the changed room and does not dirty unchanged timer ticks", async () => {
    const { store, service, room, host } = await setup();
    await store.flush();
    const save = vi.spyOn(store, "save");
    service.command(room, host, { type: "setName", name: "Updated" });
    expect(save).toHaveBeenCalledExactlyOnceWith({ rooms: [room.code] });
    save.mockClear();
    room.game!.deadline = Date.now() + 60_000;
    service.expire(room);
    expect(save).not.toHaveBeenCalled();
    room.game!.deadline = Date.now() - 1;
    vi.spyOn(rooms, "expireTurn").mockImplementationOnce((r) => {
      r.game!.deadline = null;
      return false;
    });
    service.expire(room);
    expect(save).toHaveBeenCalledExactlyOnceWith({ rooms: [room.code] });
    await store.close();
  });
  it.each(["demo", "hitster"])(
    "rejects invalid %s moves before calling the game or notifying",
    async (gameId) => {
      const { service, room, host } = await setup(gameId);
      const game = gameId === "demo" ? games.demo : games.hitster;
      const apply = vi.spyOn(game, "applyMove");
      const changed = vi.fn();
      service.onChange(changed);
      const before = JSON.stringify(room);
      for (const move of [
        null,
        5,
        {},
        { type: "other" },
        { type: "place", index: "0" },
      ]) {
        expect(service.command(room, host, { type: "move", move })).toBe(
          "That move is not valid.",
        );
      }
      expect(apply).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
      expect(JSON.stringify(room)).toBe(before);
      expect(
        service.command(room, host, {
          type: "move",
          move: gameId === "demo" ? { type: "reveal" } : { type: "pass" },
        }),
      ).toBeNull();
      expect(apply).toHaveBeenCalledOnce();
      expect(changed).toHaveBeenCalledOnce();
    },
  );

  it("records a completed game once and persists without any transport listeners", async () => {
    const { store, service, room, host, members } = await setup();
    for (let i = 0; i < 500 && !room.game!.result; i++) {
      const playerId = games.demo.activePlayers(room.game!.state)[0];
      const member = members.find((m) => m.id === playerId)!;
      expect(
        service.command(room, member, {
          type: "move",
          move: { type: "reveal" },
        }),
      ).toBeNull();
    }
    expect(room.game!.result).not.toBeNull();
    expect(store.data.history[room.hostEmail]).toHaveLength(1);
    expect(store.data.history[room.hostEmail]![0]).toMatchObject({
      roomCode: room.code,
      gameName: "Demo",
      players: ["Ana", "Bo"],
    });
    service.command(room, host, { type: "setName", name: "Renamed" });
    expect(store.data.history[room.hostEmail]).toHaveLength(1);
    expect(store.data.rooms).toEqual([room]);
  });

  it("recovers a projection failure, preserves seats, and notifies lobby instead", async () => {
    const { service, room, host } = await setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(games.demo, "view").mockImplementationOnce(() => {
      throw new Error("bad projection");
    });
    const changed = vi.fn(() => rooms.viewFor(room, host));
    const unsubscribe = service.onChange(changed);
    const seats = room.members.map((m) => m.seat);
    service.notify(room);
    expect(room.game).toBeNull();
    expect(room.members.map((m) => m.seat)).toEqual(seats);
    expect(changed.mock.results.at(-1)!.value.game).toBeNull();
    expect(log).toHaveBeenCalledWith(`Room ${room.code}:`, expect.any(Error));
    unsubscribe();
    service.notify(room);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("recovers a thrown command and leaves other rooms usable", async () => {
    const { registry, service, room, host } = await setup();
    const other = registry.create("other@example.com", "demo", {});
    const otherMember = service.join(other, undefined, true)!;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(rooms, "setName").mockImplementationOnce(() => {
      throw new Error("command failed");
    });
    expect(
      service.command(room, host, { type: "setName", name: "New" }),
    ).toBeUndefined();
    expect(room.game).toBeNull();
    expect(
      service.command(other, otherMember, { type: "setName", name: "Other" }),
    ).toBeNull();
    expect(otherMember.name).toBe("Other");
    expect(log).toHaveBeenCalled();
  });

  it("tracks reconnects and removes only anonymous disconnected visitors", async () => {
    const { service, room, host } = await setup();
    const visitor = service.join(room, undefined, false)!;
    service.disconnect(room, visitor, true);
    expect(visitor.connected).toBe(true);
    expect(room.members).toContain(visitor);
    service.disconnect(room, visitor, false);
    expect(room.members).not.toContain(visitor);
    service.disconnect(room, host, false);
    expect(room.members).toContain(host);
    expect(service.join(room, host.token, true)).toBe(host);
    expect(host.connected).toBe(true);
  });

  it("notifies removal before the changed room and ignores kicked members", async () => {
    const { service, room, host, members } = await setup();
    const events: string[] = [];
    const unsubscribe = service.onKick(() => {
      events.push("kick");
    });
    service.onChange(() => {
      events.push("change");
    });
    const guest = members[1]!;
    expect(
      service.command(room, host, { type: "kick", playerId: guest.id }),
    ).toBeNull();
    expect(events).toEqual(["kick", "change"]);
    expect(
      service.command(room, guest, { type: "setName", name: "Kicked" }),
    ).toBeUndefined();
    expect(events).toEqual(["kick", "change"]);
    unsubscribe();
  });
});

describe("room registry", () => {
  it("does not find or dirty inherited object keys as rooms", async () => {
    const store = new JsonStore(null);
    const registry = new RoomRegistry(store);
    await registry.ready;
    const save = vi.spyOn(store, "save");
    for (const code of ["__proto__", "constructor", "toString"]) {
      expect(registry.get(code)).toBeUndefined();
      registry.delete(code);
    }
    expect(save).not.toHaveBeenCalled();
    await store.close();
  });
  it("does not dirty an unchanged restored room", async () => {
    const store = new JsonStore(null);
    store.data.rooms = [rooms.createRoom("ABC234", "host@example.com", "demo")];
    const save = vi.spyOn(store, "save");
    await new RoomRegistry(store).ready;
    expect(save).not.toHaveBeenCalled();
    await store.close();
  });
  it("evicts only inactive idle rooms and notifies deletion listeners", async () => {
    const { registry, room } = await setup();
    const active = registry.create("active@example.com", "demo", {});
    const fresh = registry.create("fresh@example.com", "demo", {});
    room.updatedAt = active.updatedAt = Date.now() - 13 * 60 * 60 * 1000;
    const intervals = vi.spyOn(globalThis, "setInterval");
    const removed = vi.fn();
    registry.onDelete(removed);
    const stop = registry.startIdleSweep((r) => r === active, vi.fn());
    try {
      (intervals.mock.calls[0]![0] as () => void)();
      expect(registry.get(room.code)).toBeUndefined();
      expect([...registry.values()]).toEqual([active, fresh]);
      expect(removed).toHaveBeenCalledWith(room);
    } finally {
      stop();
    }
  });

  it("waits for storage and skips rooms for removed game modules", async () => {
    const store: Store = new JsonStore(null);
    const removed = rooms.createRoom("OLD123", "a@example.com", "demo");
    removed.gameId = "removed";
    store.data.rooms = [removed];
    let load!: () => void;
    store.ready = new Promise<void>((resolve) => {
      load = resolve;
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const registry = new RoomRegistry(store);
    expect(registry.loaded).toBe(false);
    expect([...registry.values()]).toEqual([]);
    load();
    await registry.ready;
    expect(registry.loaded).toBe(true);
    expect(store.data.rooms).toEqual([]);
    expect(log).toHaveBeenCalledWith("Room OLD123: unknown game removed");
  });
});
