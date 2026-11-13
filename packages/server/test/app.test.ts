import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientMessage, RoomView, ServerMessage } from "@cardgame/protocol";
import { WebSocket } from "ws";
import { createApp } from "../src/app";

let app: ReturnType<typeof createApp>;
let base: string;
const sent: { to: string; code: string }[] = [];

async function boot(withEmail = false) {
  app = createApp({
    dataFile: null,
    sendEmail: withEmail ? async (to, code) => void sent.push({ to, code }) : null,
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `localhost:${(app.server.address() as AddressInfo).port}`;
}
afterEach(() => app.close());

const api = async (path: string, body?: unknown, token?: string) => {
  const res = await fetch(`http://${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};

async function signIn(email = "host@example.com") {
  const { body } = await api("/api/auth/request", { email });
  return (await api("/api/auth/verify", { email, code: body.devCode })).body.token as string;
}

/** A connected client that remembers the last state it was sent. */
async function client(code: string, hello: Partial<Extract<ClientMessage, { type: "hello" }>> = {}) {
  const ws = new WebSocket(`ws://${base}/ws?room=${code}`);
  const c = { ws, room: null as RoomView | null, token: "", errors: [] as string[], kicked: false };
  let wake = () => {};
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw)) as ServerMessage;
    if (msg.type === "state") c.room = msg.room;
    if (msg.type === "welcome") c.token = msg.memberToken;
    if (msg.type === "error") c.errors.push(msg.message);
    if (msg.type === "kicked") c.kicked = true;
    wake();
  });
  await new Promise((r) => ws.once("open", r));
  const send = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
  const until = async (test: () => boolean) => {
    const deadline = Date.now() + 2000;
    while (!test()) {
      if (Date.now() > deadline) throw new Error("Timed out waiting for the server");
      await new Promise<void>((r) => {
        wake = r;
        setTimeout(r, 50);
      });
    }
  };
  send({ type: "hello", ...hello });
  await until(() => c.room !== null);
  return Object.assign(c, { send, until });
}

describe("sign-in", () => {
  it("emails the code and never returns it when a sender is configured", async () => {
    await boot(true);
    const res = await api("/api/auth/request", { email: " Host@Example.com " });
    expect(res.body).toEqual({});
    expect(sent.at(-1)!.to).toBe("host@example.com");
    expect((await api("/api/auth/verify", { email: "host@example.com", code: "000000" })).status).toBe(400);
    const ok = await api("/api/auth/verify", { email: "host@example.com", code: sent.at(-1)!.code });
    expect((await api("/api/me", undefined, ok.body.token)).body.email).toBe("host@example.com");
    // A code works once.
    expect((await api("/api/auth/verify", { email: "host@example.com", code: sent.at(-1)!.code })).status).toBe(400);
  });

  it("locks a code after too many wrong tries and rejects bad input", async () => {
    await boot(true);
    expect((await api("/api/auth/request", { email: "nope" })).status).toBe(400);
    await api("/api/auth/request", { email: "a@b.co" });
    for (let i = 0; i < 5; i++) await api("/api/auth/verify", { email: "a@b.co", code: "999999" });
    expect((await api("/api/auth/verify", { email: "a@b.co", code: sent.at(-1)!.code })).status).toBe(400);
    expect((await api("/api/rooms", {})).status).toBe(401);
    expect((await api("/api/rooms", {}, "made-up-token")).status).toBe(401);
  });
});

describe("a table over the network", () => {
  it("runs a game between a host and a guest, with history and reconnect", async () => {
    await boot();
    const session = await signIn();
    const { code } = (await api("/api/rooms", {}, session)).body;
    expect((await api(`/api/rooms/${code.toLowerCase()}`)).body.exists).toBe(true);
    expect((await api("/api/rooms/ZZZZZZ")).body.exists).toBe(false);

    const host = await client(code, { sessionToken: session });
    const guest = await client(code);
    expect(host.room!.you.isHost).toBe(true);
    expect(guest.room!.you.isHost).toBe(false);

    host.send({ type: "setName", name: "Hosty" });
    host.send({ type: "sit", seat: 0 });
    guest.send({ type: "setName", name: "Guesty" });
    guest.send({ type: "sit", seat: 4 });
    guest.send({ type: "start" });
    await guest.until(() => guest.errors.length === 1);
    await host.until(() => host.room!.seats[4]?.name === "Guesty");
    host.send({ type: "start" });
    await guest.until(() => guest.room!.game !== null);

    // The guest drops and comes back with their token: same seat, still in the game.
    guest.ws.close();
    await host.until(() => host.room!.seats[4]!.connected === false);
    const back = await client(code, { memberToken: guest.token });
    expect(back.room!.you).toMatchObject({ name: "Guesty", seat: 4 });
    await host.until(() => host.room!.seats[4]!.connected === true);

    const byId = { [host.room!.you.id]: host, [back.room!.you.id]: back };
    for (let i = 0; i < 500 && !host.room!.game!.result; i++) {
      const before = JSON.stringify(host.room!.game);
      byId[host.room!.game!.active[0]!]!.send({ type: "move", move: { type: "reveal" } });
      await host.until(() => JSON.stringify(host.room!.game) !== before);
    }
    expect(host.room!.game!.result!.winners.length).toBeGreaterThan(0);

    const history = (await api("/api/history", undefined, session)).body.history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ roomCode: code, gameName: "High Card", players: ["Hosty", "Guesty"] });

    host.send({ type: "kick", playerId: back.room!.you.id });
    await back.until(() => back.kicked);
    await host.until(() => host.room!.seats[4] === null);
  });

  it("refuses a connection to a table that does not exist", async () => {
    await boot();
    const ws = new WebSocket(`ws://${base}/ws?room=NOPE12`);
    const message = await new Promise<ServerMessage>((r) => ws.once("message", (raw) => r(JSON.parse(String(raw)))));
    expect(message.type).toBe("error");
  });
});
