/**
 * The viewer's placement on their own turn, before and while it is sent:
 * which slot the mystery card sits in, whether it is held under the pointer,
 * and whether "Lock it in" has been pressed. Pure, so the drag and keyboard
 * rules can be tested without a DOM.
 */
import { DROP_LINE_Y, handInsertionIndex } from "./layout";
import type { Placement, Point } from "./types";

/** A press that moves less than this many pixels is a tap (pause or resume), not a drag. */
export function crossedDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > 7;
}

/**
 * The slot one key press away in a hand of `count` cards. From home, Left
 * starts at the newest end and Right at the oldest.
 */
export function shiftPlacement(
  index: number | null,
  direction: -1 | 1,
  count: number,
): number {
  const start = index ?? (direction === 1 ? -1 : count + 1);
  return Math.max(0, Math.min(count, start + direction));
}

export interface PlacementState {
  /** The turn (the mystery song's id) this state belongs to. */
  turn: string | null;
  /** The slot the card was dropped in or moved to with the keys; null: at home. */
  index: number | null;
  /** Held under the pointer, and the slot it is over (null: not over the hand). */
  held: { index: number | null } | null;
  /** "Lock it in" was pressed and the server has not refused it. */
  sent: { error: string | null } | null;
}

export type PlacementAction = { turn: string } &
  /** The card was picked up. */
  (
    | { type: "grab" }
    /** The held card moved over another slot, or off the hand (null). */
    | { type: "hover"; index: number | null }
    /** The held card was let go over a slot, or elsewhere (null: back home). */
    | { type: "drop"; index: number | null }
    /** Left or Right on the focused card, in a hand of `count` cards. */
    | { type: "step"; direction: -1 | 1; count: number }
    /** Escape: back home. */
    | { type: "home" }
    /** Sent to the server; `error` is the error showing at that moment. */
    | { type: "send"; error: string | null }
    /** The server answered with an error instead of a new state. */
    | { type: "refused" }
  );

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
/** An action before it is tagged with its turn. */
export type PlacementMove = DistributiveOmit<PlacementAction, "turn">;

export function freshPlacement(turn: string | null): PlacementState {
  return { turn, index: null, held: null, sent: null };
}

/**
 * The next state. An action for another turn starts that turn afresh, and
 * nothing moves the card once it is sent.
 */
export function placementReducer(
  state: PlacementState,
  action: PlacementAction,
): PlacementState {
  const s = state.turn === action.turn ? state : freshPlacement(action.turn);
  if (s.sent && action.type !== "refused") return s;
  switch (action.type) {
    case "grab":
      return { ...s, index: null, held: { index: null } };
    case "hover":
      return s.held ? { ...s, held: { index: action.index } } : s;
    case "drop":
      return s.held ? { ...s, index: action.index, held: null } : s;
    case "step":
      if (s.held) return s;
      return {
        ...s,
        index: shiftPlacement(s.index, action.direction, action.count),
      };
    case "home":
      return s.held ? s : { ...s, index: null };
    case "send":
      return s.index === null || s.held
        ? s
        : { ...s, sent: { error: action.error } };
    case "refused":
      return { ...s, sent: null };
  }
}

/** What statusText needs: the slot being shown, and whether it is still held. */
export function shownPlacement(state: PlacementState): Placement | null {
  if (state.held)
    return state.held.index === null
      ? null
      : { index: state.held.index, dragging: true };
  return state.index === null ? null : { index: state.index, dragging: false };
}

/**
 * The slot a held card would drop into: its centre must be below the drop
 * line, and then it goes where its x falls among the hand's `count` cards.
 */
export function dropTarget(centre: Point, count: number): number | null {
  return centre.y > DROP_LINE_Y ? handInsertionIndex(centre.x, count) : null;
}
