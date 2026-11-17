import { describe, expect, it } from "vitest";
import * as rooms from "../src/rooms";

function table() {
  const room = rooms.createRoom("ABC234", "host@example.com", "demo");
  const named = (name: string | null) => {
    const m = rooms.join(room, undefined, false);
    m.connected = true;
    if (name) rooms.setName(room, m, name);
    return m;
  };
  return { room, named };
}

describe("rooms.chat", () => {
  it("stamps identity and time on the server and trims the text", () => {
    const { room, named } = table();
    const ana = named("Ana");
    const res = rooms.chat(room, ana, "  hi  ", 1234);
    expect(res).toEqual({
      message: {
        id: expect.any(String),
        from: { id: ana.id, name: "Ana" },
        text: "hi",
        at: 1234,
      },
    });
  });

  it("gives every message a distinct id", () => {
    const { room, named } = table();
    const ana = named("Ana");
    const a = rooms.chat(room, ana, "a", 0) as { message: { id: string } };
    const b = rooms.chat(room, ana, "b", 1) as { message: { id: string } };
    expect(a.message.id).not.toBe(b.message.id);
  });

  it("refuses unnamed members, removed members and bad text", () => {
    const { room, named } = table();
    expect(rooms.chat(room, named(null), "hi", 0)).toHaveProperty("error");
    const gone = named("Gone");
    room.members = room.members.filter((m) => m !== gone);
    expect(rooms.chat(room, gone, "hi", 0)).toHaveProperty("error");
    const ana = named("Ana");
    for (const bad of [
      "",
      "  \n ",
      5,
      null,
      undefined,
      {},
      ["a"],
      "x".repeat(501),
    ]) {
      expect(rooms.chat(room, ana, bad as unknown as string, 0)).toHaveProperty(
        "error",
      );
    }
    expect(rooms.chat(room, ana, "x".repeat(500), 0)).toHaveProperty("message");
  });

  it("allows 5 messages per 10 seconds per member, then frees slots as they age out", () => {
    const { room, named } = table();
    const ana = named("Ana");
    const bo = named("Bo");
    for (let i = 0; i < 5; i++)
      expect(rooms.chat(room, ana, `m${i}`, 1000 + i)).toHaveProperty(
        "message",
      );
    expect(rooms.chat(room, ana, "6th", 1005)).toHaveProperty("error");
    expect(rooms.chat(room, ana, "still no", 10_999)).toHaveProperty("error"); // first one (t=1000) not yet 10s old
    // Bo has his own budget.
    expect(rooms.chat(room, bo, "hello", 1005)).toHaveProperty("message");
    // At t=11000 the t=1000 message has aged out: exactly one slot is free.
    expect(rooms.chat(room, ana, "again", 11_000)).toHaveProperty("message");
    expect(rooms.chat(room, ana, "full again", 11_000)).toHaveProperty("error");
  });

  it("does not count refused attempts against the budget", () => {
    const { room, named } = table();
    const ana = named("Ana");
    for (let i = 0; i < 100; i++) rooms.chat(room, ana, "", 0); // invalid
    for (let i = 0; i < 5; i++)
      expect(rooms.chat(room, ana, `m${i}`, 0)).toHaveProperty("message");
    for (let i = 0; i < 100; i++) rooms.chat(room, ana, "over", 5000); // rate-limited
    expect(rooms.chat(room, ana, "after", 10_000)).toHaveProperty("message");
  });

  it("keeps the budget on the member, so a new connection cannot reset it", () => {
    const { room, named } = table();
    const ana = named("Ana");
    for (let i = 0; i < 5; i++) rooms.chat(room, ana, `m${i}`, 0);
    const sameMember = rooms.join(room, ana.token, false);
    expect(rooms.chat(room, sameMember, "more", 1)).toHaveProperty("error");
  });
});
