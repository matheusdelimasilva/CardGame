/**
 * The viewer's bet on someone else's turn, before and while it is sent: the
 * gap they picked and whether "Confirm bet" or "Pass" has been pressed.
 * Pure, like placement.ts, so the bet flow can be tested without a DOM.
 */

export interface BetState {
  /** The turn (the mystery song's id) this state belongs to. */
  turn: string | null;
  /** The gap picked in the active player's timeline; null: none yet. */
  pick: number | null;
  /** Sent to the server and not refused; `error` is the error showing at that moment. */
  sent: { move: "bet" | "pass"; error: string | null } | null;
}

export type BetAction = { turn: string } & (
  | { type: "pick"; index: number }
  | { type: "send"; move: "bet" | "pass"; error: string | null }
  /** The server answered with an error instead of a new state. */
  | { type: "refused" }
);

export function freshBet(turn: string | null): BetState {
  return { turn, pick: null, sent: null };
}

/**
 * The next state. An action for another turn starts that turn afresh;
 * nothing changes the pick once it is sent, and a bet is only sent with a gap.
 */
export function betReducer(state: BetState, action: BetAction): BetState {
  const s = state.turn === action.turn ? state : freshBet(action.turn);
  if (s.sent && action.type !== "refused") return s;
  switch (action.type) {
    case "pick":
      return { ...s, pick: action.index };
    case "send":
      return action.move === "bet" && s.pick === null
        ? s
        : { ...s, sent: { move: action.move, error: action.error } };
    case "refused":
      return { ...s, sent: null };
  }
}
