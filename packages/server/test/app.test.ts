import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ClientMessage,
  GameInfo,
  HistoryEntry,
  RoomView,
  ServerMessage,
} from "@cardgame/protocol";
import { WebSocket } from "ws";
import { createApp } from "../src/app";

vi.mock("@cardgame/games", async (original) =>
  (await import("./fixture-game")).withFixture(await original()),
);

let app: ReturnType<typeof createApp>;
let base: string;
const sent: { to: string; code: string }[] = [];

/** Stands in for Deezer: any track id resolves to a preview whose bytes name that id. */
const deezerCalls: string[] = [];
const fakeDeezer = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  deezerCalls.push(url);
  const track = /^https:\/\/api\.deezer\.com\/track\/(\d+)$/.exec(url);
  if (track) {
    const body = {
      id: Number(track[1]),
      title: "T",
      artist: { name: "A" },
      preview: `https://cdn.test/${track[1]}.mp3?hdnea=exp=9999999999`,
    };
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  }
  const preview = /^https:\/\/cdn\.test\/(\d+)\.mp3/.exec(url);
  if (preview) {
    const range = new Headers(init?.headers).get("range");
    return new Response(`mp3-of-${preview[1]}`, {
      status: range ? 206 : 200,
      headers: { "content-type": "audio/mpeg" },
    });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

async function boot(withEmail = false) {
  app = createApp({
    fetch: fakeDeezer,
    dataFile: null,
    sendEmail: withEmail
      ? async (to, code) => void sent.push({ to, code })
      : null,
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `localhost:${(app.server.address() as AddressInfo).port}`;
}
afterEach(() => app.close());

const api = async (path: string, body?: unknown, token?: string) => {
  const res = await fetch(`http://${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json()) as {
      token: string;
      devCode: string;
      code: string;
      email: string;
      games: GameInfo[];
      history: HistoryEntry[];
      exists: boolean;
      error: string;
    },
  };
};

async function signIn(email = "host@example.com") {
  const { body } = await api("/api/auth/request", { email });
  return (await api("/api/auth/verify", { email, code: body.devCode })).body
    .token as string;
}

/** A connected client that remembers the last state it was sent. */
async function client(
  code: string,
  hello: Partial<Extract<ClientMessage, { type: "hello" }>> = {},
) {
  const ws = new WebSocket(`ws://${base}/ws?room=${code}`);
  const c = {
    ws,
    room: null as RoomView | null,
    token: "",
    errors: [] as string[],
    kicked: false,
  };
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
      if (Date.now() > deadline)
        throw new Error("Timed out waiting for the server");
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
    expect(
      (
        await api("/api/auth/verify", {
          email: "host@example.com",
          code: "000000",
        })
      ).status,
    ).toBe(400);
    const ok = await api("/api/auth/verify", {
      email: "host@example.com",
      code: sent.at(-1)!.code,
    });
    expect((await api("/api/me", undefined, ok.body.token)).body.email).toBe(
      "host@example.com",
    );
    // A code works once.
    expect(
      (
        await api("/api/auth/verify", {
          email: "host@example.com",
          code: sent.at(-1)!.code,
        })
      ).status,
    ).toBe(400);
  });

  it("locks a code after too many wrong tries and rejects bad input", async () => {
    await boot(true);
    expect((await api("/api/auth/request", { email: "nope" })).status).toBe(
      400,
    );
    await api("/api/auth/request", { email: "a@b.co" });
    for (let i = 0; i < 5; i++)
      await api("/api/auth/verify", { email: "a@b.co", code: "999999" });
    expect(
      (
        await api("/api/auth/verify", {
          email: "a@b.co",
          code: sent.at(-1)!.code,
        })
      ).status,
    ).toBe(400);
    expect((await api("/api/rooms", {})).status).toBe(401);
    expect((await api("/api/rooms", {}, "made-up-token")).status).toBe(401);
  });
});

describe("a table over the network", () => {
  it("runs a game between a host and a guest, with history and reconnect", async () => {
    await boot();
    const session = await signIn();
    const listed = (await api("/api/games")).body.games;
    expect(listed.map((g: { id: string }) => g.id)).toEqual(["hitster"]);
    expect((await api("/api/rooms", {}, session)).status).toBe(400);
    expect(
      (await api("/api/rooms", { gameId: "__proto__" }, session)).status,
    ).toBe(400);
    const { code } = (
      await api(
        "/api/rooms",
        { gameId: "fixture", settings: { tiebreaker: "S" } },
        session,
      )
    ).body;
    expect((await api(`/api/rooms/${code.toLowerCase()}`)).body.exists).toBe(
      true,
    );
    expect((await api("/api/rooms/ZZZZZZ")).body.exists).toBe(false);

    const host = await client(code, { sessionToken: session });
    const guest = await client(code);
    expect(host.room!.you.isHost).toBe(true);
    expect(host.room!.gameInfo.name).toBe("Fixture");
    expect(guest.room!.settings).toEqual({ turnTimer: false, tiebreaker: "S" });
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
      byId[host.room!.game!.active[0]!]!.send({
        type: "move",
        move: { type: "reveal" },
      });
      await host.until(() => JSON.stringify(host.room!.game) !== before);
    }
    expect(host.room!.game!.result!.winners.length).toBeGreaterThan(0);

    const history = (await api("/api/history", undefined, session)).body
      .history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      roomCode: code,
      gameName: "Fixture",
      players: ["Hosty", "Guesty"],
    });

    host.send({ type: "kick", playerId: back.room!.you.id });
    await back.until(() => back.kicked);
    await host.until(() => host.room!.seats[4] === null);
  });

  it("plays the current Hitster song to the table without naming it, and only while it is current", async () => {
    await boot();
    const session = await signIn();
    const { code } = (await api("/api/rooms", { gameId: "hitster" }, session))
      .body;
    const host = await client(code, { sessionToken: session });
    const guest = await client(code);
    host.send({ type: "setName", name: "Hosty" });
    host.send({ type: "sit", seat: 0 });
    guest.send({ type: "setName", name: "Guesty" });
    guest.send({ type: "sit", seat: 1 });
    await host.until(() => host.room!.seats[1]?.name === "Guesty");
    host.send({ type: "start" });
    await guest.until(() => guest.room!.game !== null);

    expect(guest.room!.game!.track).toBeNull();
    expect(guest.room!.game!.pause).not.toBeNull();
    const introClock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + 12000);
    try {
      await guest.until(() => guest.room!.game!.track !== null);
    } finally {
      introClock.mockRestore();
    }

    const first = guest.room!.game!.track!.url;
    expect(JSON.stringify(guest.room)).not.toContain("deezerId");
    const res = await fetch(`http://${base}${first}`, {
      headers: { range: "bytes=0-" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    const played = /^mp3-of-(\d+)$/.exec(await res.text())![1]!;
    // The id Deezer was asked for never appears in what the browser was sent.
    expect(first).not.toContain(played);
    expect(JSON.stringify(guest.room)).not.toContain(played);

    host.send({ type: "move", move: { type: "place", index: 0 } });
    await guest.until(() => guest.room!.game!.active[0] === guest.room!.you.id);
    // The song stays current through the betting window; declining closes it.
    expect(guest.room!.game!.track!.url).toBe(first);
    guest.send({ type: "move", move: { type: "declineBet" } });
    await guest.until(() => guest.room!.game!.pause !== null);
    expect(guest.room!.game!.track!.url).toBe(first);
    expect((await fetch(`http://${base}${first}`)).status).toBe(200);
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6000);
    try {
      await guest.until(() => guest.room!.game!.track!.url !== first);
    } finally {
      now.mockRestore();
    }
    expect((await fetch(`http://${base}${first}`)).status).toBe(404);
    expect(
      (await fetch(`http://${base}${guest.room!.game!.track!.url}`)).status,
    ).toBe(200);
    expect(
      (await fetch(`http://${base}/api/rooms/${code}/track/${"0".repeat(48)}`))
        .status,
    ).toBe(404);
    expect(
      (await fetch(`http://${base}/api/rooms/ZZZZZZ/track/${"0".repeat(48)}`))
        .status,
    ).toBe(404);
  });

  it("refuses a connection to a table that does not exist", async () => {
    await boot();
    const ws = new WebSocket(`ws://${base}/ws?room=NOPE12`);
    const message = await new Promise<ServerMessage>((r) =>
      ws.once("message", (raw) => r(JSON.parse(String(raw)))),
    );
    expect(message.type).toBe("error");
  });
});
