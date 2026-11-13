import { describe, expect, it } from "vitest";
import type { HighCardView } from "@cardgame/games";
import * as rooms from "../src/rooms";

function table(names = ["Ana", "Bo", "Cy"]) {
  const room = rooms.createRoom("ABC234", "host@example.com");
  const members = names.map((name, i) => {
    const m = rooms.join(room, undefined, i === 0);
    m.connected = true;
    expect(rooms.setName(room, m, name)).toBeNull();
    expect(rooms.sit(room, m, i * 2)).toBeNull();
    return m;
  });
  return { room, members, host: members[0]! };
}
const gameView = (room: rooms.Room, m: rooms.Member) => rooms.viewFor(room, m).game!.view as HighCardView;

describe("rooms", () => {
  it("gives a returning token the same member and seat", () => {
    const { room, members } = table();
    const again = rooms.join(room, members[1]!.token, false);
    expect(again).toBe(members[1]);
    expect(rooms.join(room, "wrong-token", false)).not.toBe(members[1]);
  });

  it("cleans names and refuses taken seats and unnamed sitters", () => {
    const { room, members } = table();
    const guest = rooms.join(room, undefined, false);
    expect(rooms.sit(room, guest, 5)).toMatch(/name/);
    expect(rooms.setName(room, guest, "   ")).not.toBeNull();
    expect(rooms.setName(room, guest, "  A very   long nickname here ")).toBeNull();
    expect(guest.name).toBe("A very long ni");
    expect(rooms.sit(room, guest, members[1]!.seat!)).toMatch(/taken/);
    expect(rooms.sit(room, guest, 99)).not.toBeNull();
    expect(rooms.sit(room, guest, 5)).toBeNull();
  });

  it("lets only the host start, and only with enough players", () => {
    const { room, members, host } = table();
    expect(rooms.start(room, members[1]!)).toMatch(/host/);
    expect(rooms.stand(room, members[1]!)).toBeNull();
    expect(rooms.stand(room, members[2]!)).toBeNull();
    expect(rooms.start(room, host)).toMatch(/at least 2/);
    expect(rooms.sit(room, members[1]!, 3)).toBeNull();
    expect(rooms.start(room, host, 1)).toBeNull();
    expect(room.game!.players).toEqual([host.id, members[1]!.id]);
    expect(rooms.start(room, host)).toMatch(/already/);
  });

  it("never sends a hidden card to another player or a spectator", () => {
    const { room, members, host } = table();
    rooms.start(room, host, 7);
    const watcher = rooms.join(room, undefined, false);
    rooms.setName(room, watcher, "Dee");
    expect(rooms.move(room, members[1]!, { type: "peek" })).toBeNull();
    const slot = `slot:${members[1]!.id}`;
    expect(gameView(room, members[1]!).table.zones[slot]!.cards[0]!.face).not.toBeNull();
    for (const other of [host, members[2]!, watcher]) {
      expect(JSON.stringify(gameView(room, other).table)).not.toMatch(/"face":"/);
    }
    expect(rooms.viewFor(room, watcher).spectators.map((s) => s.name)).toEqual(["Dee"]);
  });

  it("holds seats during a game and seats latecomers for the next one", () => {
    const { room, members, host } = table();
    rooms.start(room, host, 7);
    expect(rooms.stand(room, members[1]!)).toMatch(/during a game/);
    expect(rooms.sit(room, members[1]!, 7)).toMatch(/during a game/);
    const late = rooms.join(room, undefined, false);
    rooms.setName(room, late, "Late");
    expect(rooms.move(room, late, { type: "reveal" })).toMatch(/not playing/);
    expect(rooms.sit(room, late, 7)).toBeNull();
    const view = rooms.viewFor(room, late);
    expect(view.seats[7]).toMatchObject({ name: "Late", inGame: false });
    expect(view.seats[0]).toMatchObject({ name: "Ana", inGame: true, isHost: true });
  });

  it("lets the host skip only a disconnected player whose turn it is", () => {
    const { room, members, host } = table();
    rooms.start(room, host, 7);
    expect(rooms.skip(room, members[1]!, host.id)).toMatch(/host/);
    expect(rooms.move(room, host, { type: "reveal" })).toBeNull();
    expect(rooms.skip(room, host, members[1]!.id)).toMatch(/connected/);
    members[1]!.connected = false;
    members[2]!.connected = false;
    expect(rooms.skip(room, host, members[2]!.id)).toMatch(/nothing to skip/);
    expect(rooms.skip(room, host, members[1]!.id)).toBeNull();
    expect(rooms.viewFor(room, host).game!.active).toEqual([members[2]!.id]);
  });

  it("ends the game when a player in it is removed, and protects the host", () => {
    const { room, members, host } = table();
    rooms.start(room, host, 7);
    expect(rooms.kick(room, members[1]!, members[2]!.id)).toMatch(/host/);
    expect(rooms.kick(room, host, host.id)).toMatch(/cannot be removed/);
    expect(rooms.kick(room, host, members[2]!.id)).toBeNull();
    expect(room.game).toBeNull();
    expect(room.members).toHaveLength(2);
  });

  it("plays a whole game and allows a new one afterwards", () => {
    const { room, members, host } = table();
    rooms.start(room, host, 3);
    for (let i = 0; i < 2000 && !room.game!.result; i++) {
      const id = rooms.viewFor(room, host).game!.active[0]!;
      expect(rooms.move(room, members.find((m) => m.id === id)!, { type: "reveal" })).toBeNull();
    }
    expect(room.game!.result!.winners.length).toBeGreaterThan(0);
    expect(rooms.stand(room, members[2]!)).toBeNull();
    expect(rooms.start(room, host, 4)).toBeNull();
    expect(room.game!.players).toHaveLength(2);
  });

  it("refuses malformed moves without crashing", () => {
    const { room, host } = table();
    rooms.start(room, host, 7);
    for (const bad of [null, 5, "reveal", {}, { type: "nope" }]) {
      expect(rooms.move(room, host, bad)).not.toBeNull();
    }
  });
});
