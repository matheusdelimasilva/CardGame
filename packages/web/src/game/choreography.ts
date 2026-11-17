/**
 * The client's timeline inside one server state. The server only says
 * intro → placing → revealing → … → over; within each of those the screen
 * plays a short sequence of beats on timers, as the design's mock does with
 * its phases. A beat says what the cards are doing; scene() turns it into
 * positions.
 */
import { useEffect, useState } from "react";
import type { GameModel, Stage } from "./types";

export type Beat =
  /** Intro: the starting cards are still in the deck, which riffles. */
  | "undealt"
  /** The starting cards fly from the deck to their places, staggered. */
  | "dealing"
  /** A new mystery card sits just off the deck, about to slide home. */
  | "arrive"
  /** Nothing moving on its own: the table follows the game. */
  | "ready"
  /** An opponent's placed card is a "?" on the deck, about to fly to its gap. */
  | "launch"
  /** An opponent's placed card sits face down in the gap they chose. */
  | "show"
  /** The bets come out: each token lands on the gap it was placed on. */
  | "bets"
  /** The placed card turns over and shows its year. */
  | "flip"
  /**
   * A right card stays; a stolen one flies to the thief, a wrong or skipped
   * one to the discard exit. Refunded tokens go home, the others vanish.
   */
  | "settle"
  /** An opponent's timeline goes back to their seat. */
  | "return";

export interface Step {
  beat: Beat;
  /** Milliseconds after the server state began. */
  at: number;
}

/** A new mystery card waits this long just off the deck before sliding home. */
export const ARRIVE_MS = 80;
/** The "?" card is drawn on the deck before it flies, so the move animates. */
export const LAUNCH_MS = 60;
/** Each dealt card leaves the deck this long after the previous one. */
export const DEAL_STAGGER_MS = 140;
/** One card's flight from the deck. */
const DEAL_FLIGHT_MS = 600;
/**
 * Beats of a reveal at full length. The server holds a reveal for about 4s,
 * 2s longer when the turn had bets (its REVEAL_MS and BET_REVEAL_MS). A card
 * turned over where it rests (the viewer's, or a skipped turn's) needs no
 * launch; an opponent's turn says "Bets are in" even when nobody bet.
 */
export const MY_REVEAL = { settle: 1300 } as const;
export const MY_BET_REVEAL = { flip: 1100, settle: 2500 } as const;
export const OPPONENT_REVEAL = {
  bets: 900,
  flip: 1400,
  settle: 2600,
  return: 3300,
} as const;
export const OPPONENT_BET_REVEAL = {
  bets: 1100,
  flip: 2300,
  settle: 3700,
  return: 5000,
} as const;
/** The reveal beats above fit in this much of the server's pause, plus BET_SPAN_MS with bets. */
const REVEAL_SPAN_MS = 4000;
const BET_SPAN_MS = 2000;

/** How long dealing `cards` cards takes, the last one included. */
export function dealMs(cards: number): number {
  return DEAL_FLIGHT_MS + DEAL_STAGGER_MS * Math.max(0, cards - 1) + 100;
}

/** Identifies one server state: a new key starts a new sequence of beats. */
export function stageKey(
  model: Pick<GameModel, "stage" | "turnNumber">,
): string {
  const stage = model.stage;
  switch (stage.kind) {
    case "placing":
      return `placing:${stage.song.id}`;
    case "revealing":
      return `revealing:${stage.turn.turnNumber}`;
    default:
      return `${stage.kind}:${model.turnNumber}`;
  }
}

/**
 * The beats of one server state. `fromIntro` is true when the state before
 * it was the intro this client watched, so the starting cards are dealt
 * first; a client that arrives mid-game never sees the deal. A reveal that
 * began before the client saw it (a reload) plays faster, to fit the time
 * left.
 */
export function beatPlan(
  model: Pick<GameModel, "stage" | "whose" | "pauseMs">,
  fromIntro: boolean,
  dealCards: number,
): Step[] {
  const stage: Stage = model.stage;
  const bets = stage.kind === "revealing" && stage.turn.bets.length > 0;
  const span = REVEAL_SPAN_MS + (bets ? BET_SPAN_MS : 0);
  const scale =
    model.pauseMs === null ? 1 : Math.max(0, Math.min(1, model.pauseMs / span));
  // Later beats never overtake the launch, however little time is left.
  const after = (ms: number) => Math.max(LAUNCH_MS, Math.round(ms * scale));
  switch (stage.kind) {
    case "intro":
      return [{ beat: "undealt", at: 0 }];
    case "placing": {
      const deal = fromIntro ? dealMs(dealCards) : 0;
      return [
        ...(fromIntro ? [{ beat: "dealing" as const, at: 0 }] : []),
        { beat: "arrive", at: deal },
        { beat: "ready", at: deal + ARRIVE_MS },
      ];
    }
    case "revealing": {
      // The viewer's card is already in its slot, and a skipped turn has no
      // gap: either way the card turns over where it rests.
      if (model.whose === "mine" || stage.turn.outcome === "passed")
        return bets
          ? [
              { beat: "bets", at: 0 },
              { beat: "flip", at: Math.round(MY_BET_REVEAL.flip * scale) },
              { beat: "settle", at: Math.round(MY_BET_REVEAL.settle * scale) },
            ]
          : [
              { beat: "flip", at: 0 },
              { beat: "settle", at: Math.round(MY_REVEAL.settle * scale) },
            ];
      const plan = bets ? OPPONENT_BET_REVEAL : OPPONENT_REVEAL;
      return [
        { beat: "launch", at: 0 },
        { beat: "show", at: LAUNCH_MS },
        { beat: "bets", at: after(plan.bets) },
        { beat: "flip", at: after(plan.flip) },
        { beat: "settle", at: after(plan.settle) },
        { beat: "return", at: after(plan.return) },
      ];
    }
    default:
      return [{ beat: "ready", at: 0 }];
  }
}

interface Run {
  key: string;
  intro: boolean;
  plan: Step[];
  step: number;
}

function start(model: GameModel, previous: Run | null, dealCards: number): Run {
  return {
    key: stageKey(model),
    intro: model.stage.kind === "intro",
    plan: beatPlan(model, previous?.intro ?? false, dealCards),
    step: 0,
  };
}

/**
 * The current beat for the model, stepping through beatPlan on timers.
 * `dealCards` is how many cards the deal moves (for its length).
 */
export function useBeat(model: GameModel, dealCards: number): Beat {
  const [run, setRun] = useState<Run>(() => start(model, null, dealCards));
  let current = run;
  if (run.key !== stageKey(model)) {
    // A new server state: start its beats now, remembering where it came from.
    current = start(model, run, dealCards);
    setRun(current);
  }
  const { key, plan } = current;
  useEffect(() => {
    const timers = plan
      .slice(1)
      .map((step, i) =>
        setTimeout(
          () => setRun((r) => (r.key === key ? { ...r, step: i + 1 } : r)),
          step.at,
        ),
      );
    return () => timers.forEach(clearTimeout);
  }, [key, plan]);
  return current.plan[current.step]!.beat;
}
