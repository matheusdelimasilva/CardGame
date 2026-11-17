import { afterEach, describe, expect, it } from "vitest";
import {
  BET_REVEAL_MS,
  REVEAL_MS,
  type HitsterState,
  type HitsterView,
} from "@cardgame/games";
import * as rooms from "../src/rooms";
import { RoomRegistry } from "../src/rooms/registry";
import { RoomService } from "../src/rooms/service";
import { JsonStore } from "../src/store";

const stores: JsonStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

/** A three-player Hitster table past its intro. Seats: Bo, Ana (host), Cy, so Bo plays first. */
async function setup() {
  const store = new JsonStore(null);
  stores.push(store);
  const registry = new RoomRegistry(store);
  await registry.ready;
  const service = new RoomService(registry, store);
  const room = registry.create("host@example.com", "hitster", {});
  const [ana, bo, cy] = (
    [
      ["Ana", 1],
      ["Bo", 0],
      ["Cy", 2],
    ] as const
  ).map(([name, seat], i) => {
    const member = service.join(room, undefined, i === 0)!;
    service.command(room, member, { type: "setName", name });
    service.command(room, member, { type: "sit", seat });
    return member;
  });
  expect(rooms.start(room, ana!, 11, 0)).toBeNull();
  expect(rooms.expireTurn(room, room.game!.resumeAt!)).toBe(true);
  expect(room.game!.state).toMatchObject({ intro: false, turn: 0 });
  return { room, ana: ana!, bo: bo!, cy: cy! };
}

const T = 100_000;
const state = (room: rooms.Room) => room.game!.state as HitsterState;

describe("the Hitster betting window", () => {
  it("has no time limit before the lock, then a five-second window whose deadline a bet does not move", async () => {
    const { room, ana, bo, cy } = await setup();
    expect(room.game).toMatchObject({ deadline: null });
    expect(rooms.move(room, cy, { type: "bet", index: 0 }, T)).toBeNull();
    expect(room.game!.deadline).toBeNull();
    expect(rooms.move(room, bo, { type: "place", index: 1 }, T + 1000)).toBe(
      null,
    );
    expect(room.game).toMatchObject({
      deadline: T + 6000,
      turnMs: 5000,
      resumeAt: null,
    });
    expect(rooms.viewFor(room, bo, T + 1000).game).toMatchObject({
      active: [ana.id],
      timer: { remainingMs: 5000, totalMs: 5000 },
    });
    expect(rooms.move(room, ana, { type: "bet", index: 0 }, T + 3000)).toBe(
      null,
    );
    // Ana's bet was the last one possible, so it closed the window.
    expect(state(room).revealing).toBe(true);

    const second = await setup();
    rooms.move(second.room, second.bo, { type: "place", index: 0 }, T);
    expect(second.room.game!.deadline).toBe(T + 5000);
    rooms.move(second.room, second.cy, { type: "bet", index: 1 }, T + 2000);
    expect(second.room.game).toMatchObject({
      deadline: T + 5000,
      turnMs: 5000,
    });
    expect(rooms.viewFor(second.room, second.ana, T + 2000).game).toMatchObject(
      {
        active: [second.ana.id],
        timer: { remainingMs: 3000, totalMs: 5000 },
      },
    );
    // The bettor sees their own gap; nobody else does, and the placement stays hidden.
    const views = [second.ana, second.bo, second.cy].map(
      (m) => rooms.viewFor(second.room, m, T + 2000).game!.view as HitsterView,
    );
    expect(views.map((v) => v.bets)).toEqual([
      [{ player: second.cy.id, index: null }],
      [{ player: second.cy.id, index: null }],
      [{ player: second.cy.id, index: 1 }],
    ]);
    expect(views.map((v) => v.lockedIndex)).toEqual([null, 0, null]);
  });

  it("declines for whoever has not bet when the window runs out, which judges the turn", async () => {
    const { room, ana, bo, cy } = await setup();
    rooms.move(room, bo, { type: "place", index: 0 }, T);
    rooms.move(room, cy, { type: "bet", index: 1 }, T + 1000);
    expect(rooms.expireTurn(room, T + 4999)).toBe(false);
    expect(state(room).revealing).toBe(false);
    expect(rooms.expireTurn(room, T + 5000)).toBe(true);
    expect(state(room)).toMatchObject({
      revealing: true,
      lastTurn: { bets: [{ player: cy.id, index: 1 }] },
    });
    expect(room.game).toMatchObject({
      deadline: null,
      resumeAt: T + 5000 + REVEAL_MS + BET_REVEAL_MS,
    });
    expect(rooms.viewFor(room, ana, T + 5000).game).toMatchObject({
      active: [],
      timer: null,
    });
  });

  it("closes early once everyone has bet or declined", async () => {
    const { room, ana, bo, cy } = await setup();
    rooms.move(room, bo, { type: "place", index: 0 }, T);
    rooms.move(room, ana, { type: "declineBet" }, T + 1000);
    expect(state(room).revealing).toBe(false);
    rooms.move(room, cy, { type: "declineBet" }, T + 1500);
    expect(state(room)).toMatchObject({
      revealing: true,
      lastTurn: { bets: [] },
    });
    expect(room.game).toMatchObject({
      deadline: null,
      resumeAt: T + 1500 + REVEAL_MS,
    });
  });

  it("opens no window when nobody can bet", async () => {
    const { room, bo } = await setup();
    state(room).tokens = [2, 0, 0];
    expect(rooms.move(room, bo, { type: "place", index: 0 }, T)).toBeNull();
    expect(state(room).revealing).toBe(true);
    expect(room.game).toMatchObject({
      deadline: null,
      resumeAt: T + REVEAL_MS,
    });
  });

  it("refunds every bet when the host skips an absent current player", async () => {
    const { room, ana, bo, cy } = await setup();
    rooms.move(room, ana, { type: "bet", index: 0 }, T);
    rooms.move(room, cy, { type: "bet", index: 1 }, T);
    expect(state(room).tokens).toEqual([2, 1, 1]);
    bo.connected = false;
    expect(rooms.skip(room, ana, bo.id, T + 1000)).toBeNull();
    expect(state(room)).toMatchObject({
      revealing: true,
      tokens: [2, 2, 2],
      lastTurn: {
        outcome: "passed",
        bets: [
          { player: ana.id, result: "refunded" },
          { player: cy.id, result: "refunded" },
        ],
      },
    });
    expect(room.game!.resumeAt).toBe(T + 1000 + REVEAL_MS + BET_REVEAL_MS);
  });

  it("lets the host decline for an absent bettor during the window", async () => {
    const { room, ana, bo, cy } = await setup();
    cy.connected = false;
    expect(rooms.skip(room, ana, cy.id, T)).toBe(
      "There is nothing to skip for that player right now.",
    );
    rooms.move(room, bo, { type: "place", index: 0 }, T);
    rooms.move(room, ana, { type: "declineBet" }, T);
    expect(rooms.skip(room, ana, cy.id, T + 1000)).toBeNull();
    expect(state(room)).toMatchObject({
      revealing: true,
      lastTurn: { bets: [] },
    });
  });
});
