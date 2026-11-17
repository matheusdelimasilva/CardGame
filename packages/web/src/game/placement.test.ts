import { describe, expect, it } from "vitest";
import {
  crossedDragThreshold,
  dropTarget,
  freshPlacement,
  placementReducer,
  shiftPlacement,
  shownPlacement,
  type PlacementAction,
  type PlacementMove,
  type PlacementState,
} from "./placement";

const turn = "song-1";
const run = (...actions: PlacementMove[]) =>
  actions.reduce<PlacementState>(
    (s, a) => placementReducer(s, { ...a, turn } as PlacementAction),
    freshPlacement(turn),
  );

describe("placing the mystery card", () => {
  it("drops into the slot it was held over, and anywhere else sends it home", () => {
    const placed = run(
      { type: "grab" },
      { type: "hover", index: 1 },
      { type: "hover", index: 2 },
      { type: "drop", index: 2 },
    );
    expect(placed).toMatchObject({ index: 2, held: null });
    expect(placementReducer(placed, { type: "grab", turn }).index).toBeNull();
    expect(run({ type: "grab" }, { type: "drop", index: null }).index).toBe(
      null,
    );
  });

  it("shows the hovered slot while held and the chosen one after", () => {
    expect(shownPlacement(run({ type: "grab" }))).toBeNull();
    expect(
      shownPlacement(run({ type: "grab" }, { type: "hover", index: 1 })),
    ).toEqual({ index: 1, dragging: true });
    expect(
      shownPlacement(run({ type: "step", direction: 1, count: 3 })),
    ).toEqual({ index: 0, dragging: false });
  });

  it("moves with the arrow keys within the hand and Escape sends it home", () => {
    expect(
      run(
        { type: "step", direction: 1, count: 2 },
        { type: "step", direction: 1, count: 2 },
        { type: "step", direction: 1, count: 2 },
        { type: "step", direction: 1, count: 2 },
      ).index,
    ).toBe(2);
    expect(run({ type: "step", direction: -1, count: 2 }).index).toBe(2);
    expect(
      run({ type: "step", direction: -1, count: 2 }, { type: "home" }).index,
    ).toBeNull();
  });

  it("locks once sent, until the server refuses", () => {
    const sent = run(
      { type: "step", direction: 1, count: 2 },
      { type: "send", error: null },
    );
    expect(sent.sent).toEqual({ error: null });
    for (const action of [
      { type: "grab" },
      { type: "step", direction: 1, count: 2 },
      { type: "home" },
    ] as const)
      expect(placementReducer(sent, { ...action, turn })).toBe(sent);
    const refused = placementReducer(sent, { type: "refused", turn });
    expect(refused).toMatchObject({ index: 0, sent: null });
  });

  it("cannot be sent from home or while held", () => {
    expect(run({ type: "send", error: null }).sent).toBeNull();
    expect(
      run(
        { type: "grab" },
        { type: "hover", index: 0 },
        {
          type: "send",
          error: null,
        },
      ).sent,
    ).toBeNull();
  });

  it("starts afresh on a new turn", () => {
    const placed = run({ type: "step", direction: 1, count: 2 });
    const next = placementReducer(placed, { type: "home", turn: "song-2" });
    expect(next).toEqual(freshPlacement("song-2"));
  });
});

describe("pointer helpers", () => {
  it("treats a press that moved 7px or less as a tap", () => {
    expect(crossedDragThreshold(4, 5)).toBe(false);
    expect(crossedDragThreshold(5, 5)).toBe(true);
  });

  it("drops only below the drop line, by x among the hand's cards", () => {
    expect(dropTarget({ x: 50, y: 30 }, 2)).toBeNull();
    expect(dropTarget({ x: 10, y: 50 }, 2)).toBe(0);
    expect(dropTarget({ x: 50, y: 50 }, 2)).toBe(1);
    expect(dropTarget({ x: 90, y: 50 }, 2)).toBe(2);
  });

  it("steps from home to the oldest end with Right and the newest with Left", () => {
    expect(shiftPlacement(null, 1, 3)).toBe(0);
    expect(shiftPlacement(null, -1, 3)).toBe(3);
    expect(shiftPlacement(0, -1, 3)).toBe(0);
  });
});
