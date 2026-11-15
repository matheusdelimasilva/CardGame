import { afterEach, describe, expect, it, vi } from "vitest";
import { games, songOf, type HitsterState } from "@cardgame/games";
import * as rooms from "../src/rooms";
import { startClock } from "../src/rooms/clock";
import { RoomRegistry } from "../src/rooms/registry";
import { RoomService } from "../src/rooms/service";
import { JsonStore } from "../src/store";

const stores: JsonStore[] = [];
const clocks: (() => void)[] = [];
afterEach(async () => {
  for (const stop of clocks.splice(0)) stop();
  for (const store of stores.splice(0)) await store.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function setup(resumeIntro = true) {
  const store = new JsonStore(null);
  stores.push(store);
  const registry = new RoomRegistry(store);
  await registry.ready;
  const service = new RoomService(registry, store);
  const room = registry.create("host@example.com", "hitster", {});
  const members = ["Ana", "Bo"].map((name, i) => {
    const member = service.join(room, undefined, i === 0)!;
    service.command(room, member, { type: "setName", name });
    service.command(room, member, { type: "sit", seat: i });
    return member;
  });
  const host = members[0]!;
  expect(service.command(room, host, { type: "start" })).toBeNull();
  if (resumeIntro) rooms.expireTurn(room, room.game!.resumeAt!);
  return { store, registry, service, room, host, members };
}

describe("held game states", () => {
  it("starts with a silent twelve-second intro and resumes once at its deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { registry, service, room, host, members } = await setup(false);
    expect(room.game).toMatchObject({
      resumeAt: 13000,
      deadline: null,
      trackNonce: null,
      trackKey: "",
      state: { intro: true, turnNumber: 1 },
    });
    expect(rooms.viewFor(room, host, 1000).game).toMatchObject({
      pause: { remainingMs: 7000 },
      active: [],
      track: null,
    });
    members[1]!.connected = false;
    expect(
      service.command(room, host, { type: "skip", playerId: members[1]!.id }),
    ).toMatch(/paused/);
    expect(
      service.command(room, host, { type: "move", move: { type: "pass" } }),
    ).toMatch(/paused/);
    const resume = vi.spyOn(games.hitster, "resume");
    const notify = vi.fn();
    service.onChange(notify);
    clocks.push(startClock(registry, service));
    vi.advanceTimersByTime(11999);
    expect(resume).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(resume).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledExactlyOnceWith(room);
    expect(room.game).toMatchObject({
      resumeAt: null,
      state: { intro: false, turnNumber: 1, turn: 0 },
    });
    expect(room.game!.trackNonce).toMatch(/^[a-f0-9]{48}$/);
    expect(rooms.viewFor(room, host).game).toMatchObject({
      pause: null,
      active: [host.id],
      track: { url: expect.any(String) },
    });
    vi.advanceTimersByTime(1000);
    expect(resume).toHaveBeenCalledOnce();
  });

  it("resumes once on the 250ms clock at the deadline, not before", async () => {
    const { store, registry, service, room, host, members } = await setup();
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const notify = vi.fn();
    const save = vi.spyOn(store, "save");
    const resume = vi.spyOn(games.hitster, "resume");
    service.onChange(notify);
    clocks.push(startClock(registry, service));
    const track = room.game!.trackNonce;
    expect(
      service.command(room, host, { type: "move", move: { type: "pass" } }),
    ).toBeNull();
    expect(room.game).toMatchObject({
      resumeAt: 5000,
      deadline: null,
      trackNonce: track,
      result: null,
    });
    expect(rooms.viewFor(room, host, 2000).game).toMatchObject({
      active: [],
      timer: null,
      pause: { remainingMs: 3000 },
    });
    expect(rooms.viewFor(room, host, 5001).game!.pause).toEqual({
      remainingMs: 0,
    });
    members[1]!.connected = false;
    expect(
      service.command(room, host, { type: "skip", playerId: members[1]!.id }),
    ).toMatch(/paused/);
    expect(
      service.command(room, host, { type: "move", move: { type: "pass" } }),
    ).toMatch(/paused/);
    notify.mockClear();
    save.mockClear();
    vi.advanceTimersByTime(3999);
    expect(resume).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(resume).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledExactlyOnceWith(room);
    expect(save).toHaveBeenCalledExactlyOnceWith({ rooms: [room.code] });
    expect(room.game).toMatchObject({
      resumeAt: null,
      result: null,
      state: { revealing: false, turnNumber: 2 },
    });
    expect(room.game!.trackNonce).not.toBe(track);
    expect(rooms.viewFor(room, host).game).toMatchObject({
      pause: null,
      active: [members[1]!.id],
    });
    vi.advanceTimersByTime(1000);
    expect(resume).toHaveBeenCalledOnce();
  });

  it("holds a winning turn for six seconds and records history only on resume", async () => {
    const { store, service, room, host } = await setup();
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const state = room.game!.state as HitsterState;
    state.cardsToWin = 2;
    const card = state.table.zones.current!.cards[0]!;
    const seed = state.table.zones[`timeline:${host.id}`]!.cards[0]!;
    const index = songOf(card.face).year < songOf(seed.face).year ? 0 : 1;
    const track = room.game!.trackNonce;
    expect(
      service.command(room, host, {
        type: "move",
        move: { type: "place", index },
      }),
    ).toBeNull();
    expect(room.game).toMatchObject({
      resumeAt: 7000,
      result: null,
      trackNonce: track,
    });
    expect(store.data.history[room.hostEmail]).toBeUndefined();
    now.mockReturnValue(6999);
    service.expire(room);
    expect(room.game!.result).toBeNull();
    now.mockReturnValue(7000);
    service.expire(room);
    expect(room.game).toMatchObject({
      resumeAt: null,
      result: { winners: [host.id] },
      trackNonce: null,
      deadline: null,
    });
    expect(store.data.history[room.hostEmail]).toHaveLength(1);
    expect(store.data.history[room.hostEmail]![0]!.winners).toEqual(["Ana"]);
    service.expire(room);
    expect(store.data.history[room.hostEmail]).toHaveLength(1);
  });

  it("recovers a throwing resume hook to the lobby and still processes another room", async () => {
    const { registry, service, room, host } = await setup();
    service.command(room, host, { type: "move", move: { type: "pass" } });
    room.game!.resumeAt = 0;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(games.hitster, "resume").mockImplementationOnce(() => {
      throw new Error("resume failed");
    });
    const seats = room.members.map((m) => m.seat);
    const notify = vi.fn();
    service.onChange(notify);
    service.expire(room);
    expect(room.game).toBeNull();
    expect(room.members.map((m) => m.seat)).toEqual(seats);
    expect(log).toHaveBeenCalledWith(
      `Room ${room.code}:`,
      expect.objectContaining({ message: "resume failed" }),
    );
    expect(notify).toHaveBeenCalledWith(room);
    const other = registry.create("other@example.com", "demo", {});
    const member = service.join(other, undefined, true)!;
    expect(
      service.command(other, member, { type: "setName", name: "Other" }),
    ).toBeNull();
  });

  it("derives a pause at start and after resume, and restarts turn clocks after the hold", async () => {
    const { room, host } = await setup();
    rooms.endGame(room, host);
    vi.spyOn(games.hitster, "pauseMs")
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(500)
      .mockReturnValue(null);
    vi.spyOn(games.hitster, "activePlayers").mockReturnValue([host.id]);
    vi.spyOn(games.hitster, "turnTimeLimit").mockReturnValue(20);
    expect(rooms.start(room, host, 1, 1000)).toBeNull();
    expect(room.game).toMatchObject({ resumeAt: 2000, deadline: null });
    expect(rooms.expireTurn(room, 2000)).toBe(true);
    expect(room.game).toMatchObject({ resumeAt: 2500, deadline: null });
    expect(rooms.expireTurn(room, 2500)).toBe(true);
    expect(room.game).toMatchObject({
      resumeAt: null,
      deadline: 22500,
      turnMs: 20000,
    });
  });
});
