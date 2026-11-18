import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { songKey, type HitsterState, type HitsterView } from "@cardgame/games";
import type { ChatMessage, ServerMessage } from "@cardgame/protocol";
import { WebSocket } from "ws";
import type { Auth } from "../src/auth";
import * as rooms from "../src/rooms";
import { RoomRegistry } from "../src/rooms/registry";
import { RoomService } from "../src/rooms/service";
import { JsonStore } from "../src/store";
import { Gateway } from "../src/ws/gateway";

const rhapsody = songKey({ title: "Bohemian Rhapsody", artist: "Queen" });
const state = (room: rooms.Room) => room.game!.state as HitsterState;
const hitsterView = (room: rooms.Room, member: rooms.Member) =>
  rooms.viewFor(room, member).game!.view as HitsterView;

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanup.splice(0).reverse()) await close();
});

/** A Hitster table past its intro, Bohemian Rhapsody playing. Seats: Ana (host), Bo, then a spectator, Cy. */
async function setup(settings: Record<string, unknown> = {}) {
  const store = new JsonStore(null);
  cleanup.push(() => store.close());
  const registry = new RoomRegistry(store);
  await registry.ready;
  const service = new RoomService(registry, store);
  const room = registry.create("host@example.com", "hitster", settings);
  const [ana, bo, cy] = ["Ana", "Bo", "Cy"].map((name, i) => {
    const member = service.join(room, undefined, i === 0)!;
    service.command(room, member, { type: "setName", name });
    if (i < 2) service.command(room, member, { type: "sit", seat: i });
    return member;
  });
  expect(service.command(room, ana!, { type: "start" })).toBeNull();
  rooms.expireTurn(room, room.game!.resumeAt!);
  state(room).table.zones.current!.cards[0]!.face = rhapsody;

  const chats: ChatMessage[] = [];
  const notices: { to: string; text: string }[] = [];
  service.onChat((_, message) => chats.push(message));
  service.onNotice((_, member, text) => notices.push({ to: member.id, text }));
  return {
    store,
    registry,
    service,
    room,
    ana: ana!,
    bo: bo!,
    cy: cy!,
    chats,
    notices,
  };
}

describe("guessing the song in chat, over the room service", () => {
  it("announces a right guess instead of sending it, and records the credit", async () => {
    const { service, room, bo, chats, notices } = await setup();
    expect(service.chat(room, bo, "  Bohemian Rhapsody ")).toBeNull();
    expect(chats).toEqual([
      {
        id: expect.any(String),
        kind: "system",
        from: { id: "", name: "" },
        text: "Bo guessed the song correctly.",
        textPtBR: "Bo acertou a música.",
        at: expect.any(Number),
      },
    ]);
    expect(notices).toEqual([]);
    expect(state(room).guessed).toEqual({ title: [bo.id], artist: [] });
  });

  it("gives one token for both parts and shows it, and every credit, in the views", async () => {
    const { service, room, ana, bo, cy, chats } = await setup();
    service.chat(room, bo, "queen");
    service.chat(room, bo, "bohemian rhapsody");
    expect(chats.map((m) => [m.kind, m.text])).toEqual([
      ["system", "Bo guessed the artist correctly."],
      ["system", "Bo guessed the song correctly."],
      ["system", "Bo got both and earns a token."],
    ]);
    expect(hitsterView(room, bo)).toMatchObject({
      tokens: { [ana.id]: 2, [bo.id]: 3 },
      yourGuess: { title: true, artist: true },
    });
    expect(hitsterView(room, ana).yourGuess).toEqual({
      title: false,
      artist: false,
    });
    for (const member of [ana, bo, cy])
      expect(hitsterView(room, member).guesses).toEqual({
        [ana.id]: { title: false, artist: false },
        [bo.id]: { title: true, artist: true },
      });
    expect(hitsterView(room, cy).yourGuess).toBeNull();
  });

  it("tells only the sender about a near miss or a repeat, and sends nothing to the room", async () => {
    const { service, room, bo, chats, notices } = await setup();
    service.chat(room, bo, "bohemian rapsodi");
    service.chat(room, bo, "queen");
    service.chat(room, bo, "Queen");
    expect(chats.map((m) => m.text)).toEqual([
      "Bo guessed the artist correctly.",
    ]);
    expect(notices).toEqual([
      { to: bo.id, text: "Close, but not quite. Your message wasn't sent." },
      { to: bo.id, text: "You already got the artist." },
    ]);
  });

  it("holds back a spectator's right guess without credit", async () => {
    const { service, room, cy, chats, notices } = await setup();
    service.chat(room, cy, "bohemian rhapsody");
    expect(chats).toEqual([]);
    expect(notices).toEqual([
      {
        to: cy.id,
        text: "Only players in this game can guess the song. Your message wasn't sent.",
      },
    ]);
    expect(state(room).guessed).toEqual({ title: [], artist: [] });
    service.chat(room, cy, "nice song");
    expect(chats.map((m) => [m.kind, m.text, m.from.name])).toEqual([
      [undefined, "nice song", "Cy"],
    ]);
  });

  it("sends ordinary chat as usual, and every line when guessing is off", async () => {
    const { service, room, bo, chats } = await setup({ guessInChat: false });
    service.chat(room, bo, "bohemian rhapsody");
    service.chat(room, bo, "hello");
    expect(chats.map((m) => [m.text, m.from.id])).toEqual([
      ["bohemian rhapsody", bo.id],
      ["hello", bo.id],
    ]);
    expect(state(room).guessed).toEqual({ title: [], artist: [] });
  });

  it("does not ask the game while it is paused", async () => {
    const { service, room, ana, bo, chats } = await setup();
    rooms.move(room, ana, { type: "place", index: 0 });
    rooms.move(room, bo, { type: "declineBet" });
    expect(room.game!.resumeAt).not.toBeNull();
    service.chat(room, bo, "bohemian rhapsody");
    expect(chats.map((m) => m.text)).toEqual(["bohemian rhapsody"]);
  });

  it("saves and notifies the room only when a guess changes the game", async () => {
    const { store, service, room, bo } = await setup();
    await store.flush();
    const save = vi.spyOn(store, "save");
    const changed = vi.fn();
    service.onChange(changed);
    service.chat(room, bo, "nice");
    service.chat(room, bo, "bohemian rapsodi");
    expect(save).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    service.chat(room, bo, "queen");
    expect(save).toHaveBeenCalledExactlyOnceWith({ rooms: [room.code] });
    expect(changed).toHaveBeenCalledOnce();
    // Only the credit is kept, never what was typed.
    expect(JSON.stringify(store.data.rooms)).not.toContain("bohemian rapsodi");
  });

  it("counts guesses against the chat rate limit", async () => {
    const { service, room, bo, chats, notices } = await setup();
    for (let i = 0; i < 5; i++)
      expect(service.chat(room, bo, "bohemian rapsodi")).toBeNull();
    expect(service.chat(room, bo, "bohemian rhapsody")).toMatch(/too fast/);
    expect(chats).toEqual([]);
    expect(notices).toHaveLength(5);
    expect(state(room).guessed).toEqual({ title: [], artist: [] });
  });

  it("holds a line back without logging it when the game's chat rule fails", async () => {
    const { service, room, bo, chats, notices } = await setup();
    const game = (await import("@cardgame/games")).games.hitster;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(game, "chat").mockImplementation(() => {
      throw new Error("broken rule");
    });
    expect(service.chat(room, bo, "secret words")).toBeNull();
    expect(chats).toEqual([]);
    expect(notices).toEqual([
      { to: bo.id, text: "That message could not be sent." },
    ]);
    expect(room.game).not.toBeNull();
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret words");
  });
});

describe("guessing the song in chat, over the WebSocket gateway", () => {
  async function serve() {
    const ctx = await setup();
    const server = createServer();
    const auth = { emailFor: () => null } as unknown as Auth;
    const gateway = new Gateway(server, ctx.registry, ctx.service, auth);
    await new Promise<void>((r) => server.listen(0, r));
    cleanup.push(async () => {
      await gateway.close();
      await new Promise<void>((r) => server.close(() => r()));
    });
    const base = `ws://localhost:${(server.address() as AddressInfo).port}`;

    /** Reconnects as an existing member and records what the room sends them. */
    async function connect(member: rooms.Member) {
      const ws = new WebSocket(`${base}/ws?room=${ctx.room.code}`);
      const got = {
        chats: [] as ChatMessage[],
        notices: [] as string[],
        errors: [] as string[],
        views: [] as HitsterView[],
      };
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw)) as ServerMessage;
        if (msg.type === "chat") got.chats.push(msg.message);
        if (msg.type === "notice") got.notices.push(msg.text);
        if (msg.type === "error") got.errors.push(msg.message);
        if (msg.type === "state")
          got.views.push(msg.room.game!.view as HitsterView);
      });
      await new Promise((r) => ws.once("open", r));
      ws.send(JSON.stringify({ type: "hello", memberToken: member.token }));
      await until(() => got.views.length > 0);
      const say = (text: string) =>
        ws.send(JSON.stringify({ type: "chat", text }));
      cleanup.push(() => ws.close());
      return Object.assign(got, { say });
    }
    return { ...ctx, connect };
  }

  async function until(test: () => boolean) {
    const deadline = Date.now() + 2000;
    while (!test()) {
      if (Date.now() > deadline) throw new Error("Timed out");
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  it("never sends a right guess as typed, announces it to everyone and notes a near miss to its sender only", async () => {
    const { ana, bo, cy, connect } = await serve();
    const [a, b, c] = [
      await connect(ana),
      await connect(bo),
      await connect(cy),
    ];

    b.say("bohemian rapsodi");
    await until(() => b.notices.length === 1);
    b.say("Bohemian Rhapsody");
    b.say("queen");
    await until(() => c.chats.length === 3);
    a.say("sentinel");
    for (const member of [a, b, c]) {
      await until(() => member.chats.length === 4);
      expect(member.chats.map((m) => [m.kind ?? "message", m.text])).toEqual([
        ["system", "Bo guessed the song correctly."],
        ["system", "Bo guessed the artist correctly."],
        ["system", "Bo got both and earns a token."],
        ["message", "sentinel"],
      ]);
    }
    expect(b.notices).toEqual([
      "Close, but not quite. Your message wasn't sent.",
    ]);
    expect(a.notices).toEqual([]);
    expect(c.notices).toEqual([]);
    for (const member of [a, b, c])
      await until(() => member.views.at(-1)!.tokens![bo.id] === 3);
    expect(b.views.at(-1)!.yourGuess).toEqual({ title: true, artist: true });
  });

  it("keeps rate limiting guesses", async () => {
    const { bo, connect } = await serve();
    const b = await connect(bo);
    for (let i = 0; i < 6; i++) b.say("bohemian rapsodi");
    await until(() => b.errors.length === 1 && b.notices.length === 5);
    expect(b.errors[0]).toMatch(/too fast/);
  });
});
