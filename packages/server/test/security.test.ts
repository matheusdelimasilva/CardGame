import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { request } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { ServerMessage } from "@cardgame/protocol";
import { createApp } from "../src/app";
import { Auth } from "../src/auth";

describe("security boundaries", () => {
  let app: ReturnType<typeof createApp> | undefined;
  let base: string;
  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function boot() {
    app = createApp({ dataFile: null, sendEmail: null });
    await app.ready;
    await new Promise<void>((resolve) => app!.server.listen(0, resolve));
    base = `http://localhost:${(app.server.address() as AddressInfo).port}`;
  }

  const post = (
    path: string,
    body: string,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

  it("limits sign-in requests across email addresses and ignores spoofed forwarded IPs", async () => {
    vi.stubEnv("TRUST_PROXY", "");
    await boot();
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await post(
            "/api/auth/request",
            JSON.stringify({ email: `a${i}@example.com` }),
            { "X-Forwarded-For": `192.0.2.${i}` },
          )
        ).status,
      ).toBe(200);
    }
    const res = await post(
      "/api/auth/request",
      JSON.stringify({ email: "sixth@example.com" }),
      { "X-Forwarded-For": "192.0.2.99" },
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toHaveProperty("error");
  });

  it("uses the first forwarded IP only when explicitly trusted", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    await boot();
    for (let i = 0; i < 5; i++) {
      expect(
        (
          await post(
            "/api/auth/request",
            JSON.stringify({ email: `a${i}@example.com` }),
            { "X-Forwarded-For": "192.0.2.1, 192.0.2.200" },
          )
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await post("/api/auth/request", '{"email":"sixth@example.com"}', {
          "X-Forwarded-For": "192.0.2.1, 192.0.2.201",
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await post("/api/auth/request", '{"email":"other@example.com"}', {
          "X-Forwarded-For": "192.0.2.2",
        })
      ).status,
    ).toBe(200);
  });

  it("answers oversized bodies with JSON 413 and keeps serving requests", async () => {
    await boot();
    const res = await post(
      "/api/auth/request",
      JSON.stringify({ email: "a@example.com", padding: "x".repeat(10_000) }),
    );
    expect(res.status).toBe(413);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "Request body is too large." });
    expect((await fetch(base + "/api/games")).status).toBe(200);
  });

  it("enforces the byte limit for chunked multibyte bodies too", async () => {
    await boot();
    const result = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = request(
          base + "/api/auth/verify",
          { method: "POST", headers: { "Content-Type": "application/json" } },
          (res) => {
            let body = "";
            res.on("data", (chunk) => {
              body += chunk;
            });
            res.on("end", () => resolve({ status: res.statusCode!, body }));
          },
        );
        req.on("error", reject);
        req.write('{"padding":"');
        req.write("é".repeat(5001));
        req.end('"}');
      },
    );
    expect(result).toEqual({
      status: 413,
      body: JSON.stringify({ error: "Request body is too large." }),
    });
  });

  it("accepts a valid body at exactly the byte limit", async () => {
    await boot();
    const body = { email: "a@example.com", padding: "" };
    body.padding = "x".repeat(10_000 - Buffer.byteLength(JSON.stringify(body)));
    const raw = JSON.stringify(body);
    expect(Buffer.byteLength(raw)).toBe(10_000);
    expect((await post("/api/auth/request", raw)).status).toBe(200);
  });

  it.each(["", "{", "null", "[]", '{"email":1}', '{"email":"not-an-email"}'])(
    "rejects malformed or invalid auth JSON: %s",
    async (body) => {
      await boot();
      const res = await post("/api/auth/request", body);
      expect(res.status).toBe(400);
      expect(await res.json()).toHaveProperty("error");
    },
  );

  it("validates verification codes and room bodies", async () => {
    await boot();
    const requested = await post(
      "/api/auth/request",
      '{"email":" HOST@example.com "}',
    );
    const { devCode } = await requested.json();
    expect(
      (
        await post(
          "/api/auth/verify",
          JSON.stringify({ email: "host@example.com", code: devCode + "junk" }),
        )
      ).status,
    ).toBe(400);
    const verified = await post(
      "/api/auth/verify",
      JSON.stringify({ email: "host@example.com", code: devCode }),
    );
    const { token } = await verified.json();
    for (const body of [
      "{}",
      '{"gameId":1}',
      '{"gameId":"hitster","settings":[]}',
    ]) {
      expect(
        (await post("/api/rooms", body, { Authorization: `Bearer ${token}` }))
          .status,
      ).toBe(400);
    }
    expect(
      (
        await post("/api/rooms", '{"gameId":"hitster"}', {
          Authorization: `Bearer ${token}`,
        })
      ).status,
    ).toBe(200);
  });

  it("rejects invalid WS messages without corrupting a room or closing the connection", async () => {
    await boot();
    const { devCode } = await (
      await post("/api/auth/request", '{"email":"host@example.com"}')
    ).json();
    const { token } = await (
      await post(
        "/api/auth/verify",
        JSON.stringify({ email: "host@example.com", code: devCode }),
      )
    ).json();
    const { code } = await (
      await post("/api/rooms", '{"gameId":"hitster"}', {
        Authorization: `Bearer ${token}`,
      })
    ).json();
    const ws = new WebSocket(base.replace("http:", "ws:") + `/ws?room=${code}`);
    await once(ws, "open");
    const send = async (raw: string): Promise<ServerMessage> => {
      const next = once(ws, "message");
      ws.send(raw);
      return JSON.parse(String((await next)[0]));
    };
    for (const raw of ["{", "null", "{}", '{"type":"hello","memberToken":5}']) {
      expect(await send(raw)).toEqual({
        type: "error",
        message: "Invalid message.",
      });
    }
    const state = new Promise<ServerMessage>((resolve) =>
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw)) as ServerMessage;
        if (msg.type === "state") resolve(msg);
      }),
    );
    expect((await send('{"type":"hello"}')).type).toBe("welcome");
    await state;
    expect(await send('{"type":"sit","seat":"0"}')).toEqual({
      type: "error",
      message: "Invalid message.",
    });
    expect((await send('{"type":"setName","name":"Ana"}')).type).toBe("state");
    ws.close();
  });

  it("periodically prunes auth state", async () => {
    const intervals = vi.spyOn(globalThis, "setInterval");
    const prune = vi.spyOn(Auth.prototype, "prune");
    await boot();
    const cleanup = intervals.mock.calls.find(
      ([, delay]) => delay === 60_000,
    )![0] as () => void;
    cleanup();
    expect(prune).toHaveBeenCalledOnce();
  });

  it("rejects and deletes expired HTTP session tokens", async () => {
    await boot();
    const { devCode } = await (
      await post("/api/auth/request", '{"email":"host@example.com"}')
    ).json();
    const { token } = await (
      await post(
        "/api/auth/verify",
        JSON.stringify({ email: "host@example.com", code: devCode }),
      )
    ).json();
    const headers = { Authorization: `Bearer ${token}` };
    expect((await fetch(base + "/api/me", { headers })).status).toBe(200);
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + 30 * 24 * 60 * 60 * 1000 + 1000);
    expect((await fetch(base + "/api/me", { headers })).status).toBe(401);
    clock.mockRestore();
    expect((await fetch(base + "/api/me", { headers })).status).toBe(401);
  });

  it("does not expose public song previews", async () => {
    await boot();
    expect((await fetch(base + "/api/preview?deezerId=123")).status).toBe(404);
  });
});
