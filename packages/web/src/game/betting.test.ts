import { describe, expect, it } from "vitest";
import { betReducer, freshBet, type BetAction, type BetState } from "./betting";

const turn = "song-1";
const run = (...actions: BetAction[]): BetState =>
  actions.reduce(betReducer, freshBet(turn));

describe("betReducer", () => {
  it("picks a gap and changes it until the bet is sent", () => {
    expect(run({ type: "pick", index: 2, turn }).pick).toBe(2);
    expect(
      run({ type: "pick", index: 2, turn }, { type: "pick", index: 0, turn })
        .pick,
    ).toBe(0);
  });

  it("sends a bet only with a gap picked, and a pass at any time", () => {
    expect(run({ type: "send", move: "bet", error: null, turn }).sent).toBe(
      null,
    );
    expect(
      run(
        { type: "pick", index: 1, turn },
        { type: "send", move: "bet", error: null, turn },
      ).sent,
    ).toEqual({ move: "bet", error: null });
    expect(
      run({ type: "send", move: "pass", error: "Old", turn }).sent,
    ).toEqual({ move: "pass", error: "Old" });
  });

  it("holds the pick once sent, and lets it change again after a refusal", () => {
    const sent = run(
      { type: "pick", index: 1, turn },
      { type: "send", move: "bet", error: null, turn },
      { type: "pick", index: 3, turn },
    );
    expect(sent.pick).toBe(1);
    const refused = betReducer(sent, { type: "refused", turn });
    expect(refused.sent).toBeNull();
    expect(betReducer(refused, { type: "pick", index: 3, turn }).pick).toBe(3);
  });

  it("starts afresh on another turn", () => {
    const sent = run(
      { type: "pick", index: 1, turn },
      { type: "send", move: "bet", error: null, turn },
    );
    expect(
      betReducer(sent, { type: "pick", index: 0, turn: "song-2" }),
    ).toEqual({ turn: "song-2", pick: 0, sent: null });
  });
});
