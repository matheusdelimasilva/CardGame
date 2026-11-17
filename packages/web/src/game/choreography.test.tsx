import type { RoomView } from "@cardgame/protocol";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ARRIVE_MS,
  MY_BET_REVEAL,
  MY_REVEAL,
  OPPONENT_BET_REVEAL,
  OPPONENT_REVEAL,
  beatPlan,
  dealMs,
  stageKey,
  useBeat,
  type Beat,
} from "./choreography";
import { scenarios } from "./dev/fixtures";
import { gameModel } from "./model";

const model = (room: RoomView) => gameModel(room)!;

describe("beat plans", () => {
  it("riffles during the intro and deals the starting cards when it ends", () => {
    expect(beatPlan(model(scenarios.intro()), false, 4)).toEqual([
      { beat: "undealt", at: 0 },
    ]);
    expect(beatPlan(model(scenarios.myTurn()), true, 4)).toEqual([
      { beat: "dealing", at: 0 },
      { beat: "arrive", at: dealMs(4) },
      { beat: "ready", at: dealMs(4) + ARRIVE_MS },
    ]);
  });

  it("does not deal for a client that arrives mid-game", () => {
    expect(beatPlan(model(scenarios.myTurn()), false, 4)).toEqual([
      { beat: "arrive", at: 0 },
      { beat: "ready", at: ARRIVE_MS },
    ]);
  });

  it("flips the viewer's card in place, then settles it", () => {
    expect(beatPlan(model(scenarios.myRevealWrong()), false, 4)).toEqual([
      { beat: "flip", at: 0 },
      { beat: "settle", at: MY_REVEAL.settle },
    ]);
  });

  it("shows, flips, settles and returns an opponent's card", () => {
    expect(
      beatPlan(model(scenarios.opponentRevealCorrect()), false, 4).map(
        (s) => s.beat,
      ),
    ).toEqual(["launch", "show", "bets", "flip", "settle", "return"]);
    // A skipped turn has no gap: the card turns over on the deck.
    expect(
      beatPlan(model(scenarios.opponentRevealPassed()), false, 4).map(
        (s) => s.beat,
      ),
    ).toEqual(["flip", "settle"]);
  });

  it("plays a reveal faster when less of the pause is left", () => {
    const m = { ...model(scenarios.opponentRevealWrong()), pauseMs: 2000 };
    const plan = beatPlan(m, false, 4);
    expect(plan.at(-1)).toEqual({
      beat: "return",
      at: OPPONENT_REVEAL.return / 2,
    });
  });

  it("lands the bets before the card turns over, in the longer pause bets get", () => {
    // The server holds a reveal with bets 6s: the beats play at full length.
    const theirs = model(scenarios.opponentRevealRefund());
    expect(theirs.pauseMs).toBe(6000);
    expect(beatPlan(theirs, false, 4)).toEqual([
      { beat: "launch", at: 0 },
      { beat: "show", at: 60 },
      { beat: "bets", at: OPPONENT_BET_REVEAL.bets },
      { beat: "flip", at: OPPONENT_BET_REVEAL.flip },
      { beat: "settle", at: OPPONENT_BET_REVEAL.settle },
      { beat: "return", at: OPPONENT_BET_REVEAL.return },
    ]);
    expect(OPPONENT_BET_REVEAL.return).toBeLessThan(6000);
    expect(beatPlan(model(scenarios.myRevealBets()), false, 4)).toEqual([
      { beat: "bets", at: 0 },
      { beat: "flip", at: MY_BET_REVEAL.flip },
      { beat: "settle", at: MY_BET_REVEAL.settle },
    ]);
    // Half the pause left: everything plays twice as fast.
    const late = { ...model(scenarios.myRevealStolen()), pauseMs: 3000 };
    expect(beatPlan(late, false, 4).at(-1)).toEqual({
      beat: "settle",
      at: MY_BET_REVEAL.settle / 2,
    });
  });

  it("says the bets are in for an opponent's turn without bets too, within the usual pause", () => {
    const plan = beatPlan(model(scenarios.opponentRevealWrong()), false, 4);
    expect(plan.find((s) => s.beat === "bets")?.at).toBe(OPPONENT_REVEAL.bets);
    expect(plan.at(-1)!.at).toBeLessThan(4000);
  });

  it("keeps one plan through the lock-in and the betting window", () => {
    expect(stageKey(model(scenarios.myTurnLocked()))).toBe(
      stageKey(model(scenarios.myTurn())),
    );
  });

  it("keys a placing turn by its song and a reveal by its turn", () => {
    expect(stageKey(model(scenarios.myTurn()))).toBe("placing:current");
    expect(stageKey(model(scenarios.myRevealCorrect()))).toBe("revealing:7");
  });
});

describe("useBeat", () => {
  let renderer: ReactTestRenderer | undefined;
  let seen: Beat[] = [];
  function Probe({ room }: { room: RoomView }) {
    seen.push(useBeat(model(room), 2));
    return null;
  }
  const beat = () => seen.at(-1);
  beforeEach(() => {
    vi.useFakeTimers();
    seen = [];
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    vi.useRealTimers();
  });

  it("deals after an intro it watched, then brings the card in", () => {
    act(() => {
      renderer = create(<Probe room={scenarios.intro()} />);
    });
    expect(beat()).toBe("undealt");
    act(() => renderer!.update(<Probe room={scenarios.myTurn()} />));
    expect(beat()).toBe("dealing");
    act(() => {
      vi.advanceTimersByTime(dealMs(2));
    });
    expect(beat()).toBe("arrive");
    act(() => {
      vi.advanceTimersByTime(ARRIVE_MS);
    });
    expect(beat()).toBe("ready");
  });

  it("never deals when it first sees a game already running", () => {
    act(() => {
      renderer = create(<Probe room={scenarios.myTurn()} />);
    });
    expect(seen).not.toContain("dealing");
    expect(beat()).toBe("arrive");
  });

  it("starts a new state's beats from the first, dropping the old timers", () => {
    act(() => {
      renderer = create(<Probe room={scenarios.opponentRevealWrong()} />);
    });
    expect(beat()).toBe("launch");
    act(() => {
      vi.advanceTimersByTime(OPPONENT_REVEAL.flip);
    });
    expect(beat()).toBe("flip");
    act(() => renderer!.update(<Probe room={scenarios.myTurn()} />));
    expect(beat()).toBe("arrive");
    act(() => {
      vi.advanceTimersByTime(OPPONENT_REVEAL.return);
    });
    expect(beat()).toBe("ready");
  });
});
