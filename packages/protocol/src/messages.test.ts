import { describe, expect, expectTypeOf, it } from "vitest";
import { clientMessageSchema, type ClientMessage } from "./index";

describe("client message schema", () => {
  it("keeps game move payloads unknown", () => {
    expectTypeOf<
      Extract<ClientMessage, { type: "move" }>["move"]
    >().toEqualTypeOf<unknown>();
  });
  it.each([
    { type: "hello" },
    { type: "hello", memberToken: "member", sessionToken: "session" },
    { type: "setName", name: "Ana" },
    { type: "sit", seat: 0 },
    { type: "sit", seat: 7 },
    { type: "stand" },
    { type: "start" },
    { type: "endGame" },
    { type: "move", move: { arbitrary: true } },
    { type: "move", move: null },
    { type: "kick", playerId: "player" },
    { type: "skip", playerId: "player" },
  ])("accepts %j", (input) =>
    expect(clientMessageSchema.safeParse(input).success).toBe(true),
  );

  it.each([
    null,
    [],
    {},
    "hello",
    { type: "unknown" },
    { type: "hello", sessionToken: 123 },
    { type: "sit", seat: "0" },
    { type: "sit", seat: -1 },
    { type: "sit", seat: 8 },
    { type: "sit", seat: 0.5 },
    { type: "setName", name: " " },
    { type: "setName", name: "x".repeat(15) },
    { type: "move" },
    { type: "kick", playerId: null },
    { type: "skip" },
  ])("rejects %j", (input) =>
    expect(clientMessageSchema.safeParse(input).success).toBe(false),
  );
});
