import { describe, expect, it, vi } from "vitest";
import { Auth } from "../src/auth";
import { JsonStore } from "../src/store";

const day = 24 * 60 * 60 * 1000;

describe("auth security", () => {
  it("limits each IP to five requests per fixed window", () => {
    const auth = new Auth(new JsonStore(null), null);
    for (let i = 0; i < 5; i++) expect(auth.allowRequest("ip1", i)).toBe(true);
    expect(auth.allowRequest("ip1", 5)).toBe(false);
    expect(auth.allowRequest("ip2", 5)).toBe(true);
    expect(auth.allowRequest("ip1", 600_000)).toBe(true);
  });

  it("expires sessions after 30 days of inactivity and slides on successful use", async () => {
    const store = new JsonStore(null);
    const auth = new Auth(store, null);
    const { devCode } = await auth.requestCode("a@example.com", 0);
    const { token } = auth.verify("a@example.com", devCode!, 1);
    expect(store.data.sessions[token!]).toEqual({
      email: "a@example.com",
      lastUsed: 1,
    });
    expect(auth.emailFor(token, 29 * day)).toBe("a@example.com");
    expect(auth.emailFor(token, 58 * day)).toBe("a@example.com");
    expect(auth.emailFor(token, 88 * day)).toBeNull();
    expect(store.data.sessions[token!]).toBeUndefined();
    expect(auth.emailFor("unknown")).toBeNull();
    expect(auth.emailFor(null)).toBeNull();
    expect(auth.emailFor("__proto__")).toBeNull();
  });

  it("prunes expired codes, IP windows and sessions but keeps live entries", async () => {
    const store = new JsonStore(null);
    const auth = new Auth(store, null);
    const save = vi.spyOn(store, "save");
    const old = await auth.requestCode("old@example.com", 0);
    await auth.requestCode("live@example.com", 600_000);
    auth.allowRequest("old", 0);
    auth.allowRequest("live", 600_000);
    store.data.sessions.old = { email: "old@example.com", lastUsed: -30 * day };
    store.data.sessions.live = { email: "live@example.com", lastUsed: 600_000 };
    auth.prune(600_000);
    expect(auth).toHaveProperty("pending", expect.any(Map));
    expect(auth).toHaveProperty("pending.size", 1);
    expect(auth).toHaveProperty("requests.size", 1);
    expect(auth.verify("old@example.com", old.devCode!, 600_000).error).toMatch(
      /expired/,
    );
    expect(Object.keys(store.data.sessions)).toEqual(["live"]);
    expect(save).toHaveBeenCalled();
    auth.prune(31 * day);
    expect(auth).toHaveProperty("pending.size", 0);
    expect(auth).toHaveProperty("requests.size", 0);
    expect(store.data.sessions).toEqual({});
  });

  it("removes signed-out sessions and rejects expired codes at their deadline", async () => {
    const store = new JsonStore(null);
    const auth = new Auth(store, null);
    const { devCode } = await auth.requestCode("a@example.com", 0);
    expect(auth.verify("a@example.com", devCode!, 600_000).error).toMatch(
      /expired/,
    );
    const next = await auth.requestCode("a@example.com", 600_000);
    const { token } = auth.verify("a@example.com", next.devCode!, 600_001);
    auth.signOut(token!);
    expect(auth.emailFor(token, 600_002)).toBeNull();
  });
});
