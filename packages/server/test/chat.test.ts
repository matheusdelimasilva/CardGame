import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@cardgame/protocol";
import { WebSocket } from "ws";
import { createApp } from "../src/app";

/**
 * Phase 1 live chat contract (decided from the existing architecture):
 *   client -> server  { type: "chat", text: string }
 *   server -> room    { type: "chat", message: { id, from: { id, name }, text, at } }
 * Chat is ephemeral, plain text, and only reaches sockets that have joined the room.
 */
type ChatMessage = {
  id: string;
  from: { id: string; name: string };
  text: string;
  at: number;
};

let app: ReturnType<typeof createApp>;
let base: string;

async function boot() {
  app = createApp({ dataFile: null, sendEmail: null });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `localhost:${(app.server.address() as AddressInfo).port}`;
}
afterEach(() => app.close());

async function api(path: string, body?: unknown, token?: string) {
  const res = await fetch(`http://${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as Record<string, string>; // the fields these tests read are strings
}

async function newRoom(): Promise<string> {
  const { devCode } = await api("/api/auth/request", {
    email: "host@example.com",
  });
  const { token } = await api("/api/auth/verify", {
    email: "host@example.com",
    code: devCode,
  });
  return (await api("/api/rooms", { gameId: "demo" }, token)).code as string;
}

/** Connects, says hello and (unless name is null) picks a nickname. Records chat traffic. */
async function join(
  code: string,
  name: string | null,
  opts: { hello?: boolean } = {},
) {
  const ws = new WebSocket(`ws://${base}/ws?room=${code}`);
  const c = {
    ws,
    chats: [] as ChatMessage[],
    errors: [] as string[],
    kicked: false,
    joined: false,
    id: "",
    token: "",
    name: "",
    states: [] as string[],
  };
  let wake = () => {};
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw)) as ServerMessage;
    if (msg.type === "chat") c.chats.push(msg.message);
    if (msg.type === "error") c.errors.push(msg.message);
    if (msg.type === "kicked") c.kicked = true;
    if (msg.type === "welcome") c.token = msg.memberToken;
    if (msg.type === "state") {
      c.joined = true;
      c.id = msg.room.you.id;
      c.name = msg.room.you.name;
      c.states.push(String(raw));
    }
    wake();
  });
  await new Promise((r) => ws.once("open", r));
  const send = (
    msg: ClientMessage | { type: "chat"; text?: unknown; from?: unknown },
  ) => ws.send(JSON.stringify(msg));
  const until = async (test: () => boolean) => {
    const deadline = Date.now() + 2000;
    while (!test()) {
      if (Date.now() > deadline)
        throw new Error("Timed out waiting for the server");
      await new Promise<void>((r) => {
        wake = r;
        setTimeout(r, 25);
      });
    }
  };
  if (opts.hello !== false) {
    send({ type: "hello" });
    await until(() => c.joined);
    if (name !== null) {
      send({ type: "setName", name });
      await until(() => c.name === name);
    }
  }
  return Object.assign(c, { send, until });
}

const texts = (c: { chats: ChatMessage[] }) => c.chats.map((m) => m.text);

describe("room live chat", () => {
  it("delivers a message to everyone in the room, stamped by the server", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const bo = await join(code, "Bo");

    ana.send({ type: "chat", text: "  hello table  " });
    await bo.until(() => bo.chats.length === 1);
    await ana.until(() => ana.chats.length === 1);

    expect(bo.chats[0]).toMatchObject({
      text: "hello table",
      from: { id: ana.id, name: "Ana" },
    });
    expect(typeof bo.chats[0]!.id).toBe("string");
    expect(typeof bo.chats[0]!.at).toBe("number");
    expect(ana.chats[0]).toEqual(bo.chats[0]);
  });

  it("ignores any sender identity the client claims", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const bo = await join(code, "Bo");

    ana.send({
      type: "chat",
      text: "I am not Bo",
      from: { id: bo.id, name: "Bo" },
    });
    await bo.until(() => bo.chats.length === 1);
    expect(bo.chats[0]!.from).toEqual({ id: ana.id, name: "Ana" });
  });

  it("lets spectators (named members without a seat) chat", async () => {
    await boot();
    const code = await newRoom();
    const watcher = await join(code, "Watcher");
    const ana = await join(code, "Ana");
    watcher.send({ type: "chat", text: "from the rail" });
    await ana.until(() => ana.chats.length === 1);
    expect(ana.chats[0]!.from.name).toBe("Watcher");
  });

  it("never leaks messages to another room", async () => {
    await boot();
    const [codeA, codeB] = [await newRoom(), await newRoom()];
    const ana = await join(codeA, "Ana");
    const bo = await join(codeA, "Bo");
    const cy = await join(codeB, "Cy");
    const dee = await join(codeB, "Dee");

    ana.send({ type: "chat", text: "room A only" });
    await bo.until(() => bo.chats.length === 1);
    // Sentinel in room B proves B's sockets were live and had their chance to receive A's message.
    cy.send({ type: "chat", text: "room B sentinel" });
    await dee.until(() => dee.chats.length === 1);

    expect(texts(cy)).toEqual(["room B sentinel"]);
    expect(texts(dee)).toEqual(["room B sentinel"]);
    expect(texts(ana)).toEqual(["room A only"]);
  });

  it("refuses chat from a socket that never joined the room", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const lurker = await join(code, null, { hello: false });

    lurker.send({ type: "chat", text: "let me in" });
    ana.send({ type: "chat", text: "sentinel" });
    await ana.until(() => ana.chats.length >= 1);
    await new Promise((r) => setTimeout(r, 100));

    expect(texts(ana)).toEqual(["sentinel"]);
    expect(texts(lurker)).toEqual([]); // not even a listener: it never joined
  });

  it("refuses chat from a member who has not chosen a nickname", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const anon = await join(code, null);

    anon.send({ type: "chat", text: "anonymous" });
    await anon.until(() => anon.errors.length === 1);
    expect(anon.errors[0]).toMatch(/name/i);

    ana.send({ type: "chat", text: "sentinel" });
    await anon.until(() => anon.chats.length >= 1);
    expect(texts(ana)).toEqual(["sentinel"]);
  });

  it("refuses a member who was removed from the room", async () => {
    await boot();
    const { devCode } = await api("/api/auth/request", {
      email: "host@example.com",
    });
    const { token } = (await api("/api/auth/verify", {
      email: "host@example.com",
      code: devCode,
    })) as { token: string };
    const code = (await api("/api/rooms", { gameId: "demo" }, token))
      .code as string;

    const host = await join(code, null, { hello: false });
    host.send({ type: "hello", sessionToken: token });
    await host.until(() => host.joined);
    host.send({ type: "setName", name: "Hosty" });
    const bo = await join(code, "Bo");
    const boId = bo.id;

    host.send({ type: "kick", playerId: boId });
    await bo.until(() => bo.kicked);

    bo.send({ type: "chat", text: "still here?" });
    host.send({ type: "chat", text: "sentinel" });
    await host.until(() => host.chats.length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(texts(host)).toEqual(["sentinel"]);
  });

  it("rejects empty, whitespace-only, non-string and over-long text without broadcasting it", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const bo = await join(code, "Bo");

    ana.send({ type: "chat", text: "" });
    ana.send({ type: "chat", text: "   \n\t " });
    ana.send({ type: "chat", text: 42 });
    ana.send({ type: "chat", text: { toString: "x" } });
    ana.send({ type: "chat" });
    ana.send({ type: "chat", text: "x".repeat(501) });
    ana.send({ type: "chat", text: ["an", "array"] });
    ana.send({ type: "chat", text: null });
    await ana.until(() => ana.errors.length === 8); // every refusal is reported to the sender only
    expect(bo.errors).toEqual([]);

    ana.send({ type: "chat", text: "x".repeat(500) }); // the limit itself is allowed
    await bo.until(() => bo.chats.length === 1);
    expect(bo.chats[0]!.text).toBe("x".repeat(500));
    expect(bo.chats).toHaveLength(1);
  });

  it("passes markup through as inert text, never interpreting it", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const bo = await join(code, "Bo");
    const payload = `<img src=x onerror=alert(1)> & "quotes"`;
    ana.send({ type: "chat", text: payload });
    await bo.until(() => bo.chats.length === 1);
    expect(bo.chats[0]!.text).toBe(payload);
  });

  it("rate limits a flooding member but keeps the connection and other members unaffected", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const bo = await join(code, "Bo");

    for (let i = 0; i < 30; i++) ana.send({ type: "chat", text: `spam ${i}` });
    await ana.until(() => ana.errors.length >= 1);
    expect(ana.errors.at(-1)).toMatch(/slow|too (many|fast)|wait/i);
    await new Promise((r) => setTimeout(r, 150));
    expect(texts(bo)).toEqual([
      "spam 0",
      "spam 1",
      "spam 2",
      "spam 3",
      "spam 4",
    ]);
    expect(ana.errors).toHaveLength(25);
    expect(bo.errors).toEqual([]);

    // Someone else in the room is not throttled by Ana's flood.
    bo.send({ type: "chat", text: "my turn to talk" });
    await ana.until(() => texts(ana).includes("my turn to talk"));
    expect(ana.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("does not let a member dodge the limit by reconnecting with the same token", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const bo = await join(code, "Bo");
    for (let i = 0; i < 30; i++) ana.send({ type: "chat", text: `spam ${i}` });
    await ana.until(() => ana.errors.length >= 1);
    await new Promise((r) => setTimeout(r, 150));
    const delivered = bo.chats.length;
    expect(delivered).toBe(5);

    // Same member (via memberToken), fresh socket.
    const again = new WebSocket(`ws://${base}/ws?room=${code}`);
    const errors: string[] = [];
    let welcomed = false;
    again.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as ServerMessage;
      if (msg.type === "error") errors.push(msg.message);
      if (msg.type === "welcome") welcomed = msg.memberToken === ana.token;
    });
    await new Promise((r) => again.once("open", r));
    again.send(JSON.stringify({ type: "hello", memberToken: ana.token }));
    await bo.until(() => welcomed);
    for (let i = 0; i < 30; i++)
      again.send(JSON.stringify({ type: "chat", text: `again ${i}` }));
    await bo.until(() => errors.length === 30);
    expect(errors.at(-1)).toMatch(/too fast/i);
    expect(bo.chats.length).toBe(delivered);
    again.close();
  });

  it("keeps no history: late joiners see nothing and chat never enters the room state", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const bo = await join(code, "Bo");
    ana.send({ type: "chat", text: "secret-before-cy" });
    await bo.until(() => bo.chats.length === 1);

    const cy = await join(code, "Cy");
    cy.send({ type: "chat", text: "sentinel" });
    await cy.until(() => cy.chats.length >= 1);
    expect(texts(cy)).toEqual(["sentinel"]);
    for (const c of [ana, bo, cy])
      expect(c.states.join("")).not.toContain("secret-before-cy");
  });

  it("delivers to every connection of the same member, once each", async () => {
    await boot();
    const code = await newRoom();
    const ana = await join(code, "Ana");
    const bo = await join(code, "Bo");
    const tab2 = await join(code, null, { hello: false });
    tab2.send({ type: "hello", memberToken: bo.token });
    await tab2.until(() => tab2.joined);
    expect(tab2.id).toBe(bo.id);

    ana.send({ type: "chat", text: "hi both tabs" });
    ana.send({ type: "chat", text: "sentinel" });
    await bo.until(() => bo.chats.length === 2);
    await tab2.until(() => tab2.chats.length === 2);
    expect(texts(bo)).toEqual(["hi both tabs", "sentinel"]);
    expect(texts(tab2)).toEqual(["hi both tabs", "sentinel"]);
  });
});
