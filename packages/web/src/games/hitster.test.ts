import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HitsterMove, HitsterView } from "@cardgame/games";
import { hitsterUI } from "./hitster";
import { Placement } from "./hitster-dock";
import type { GameProps, TypedGameView } from "./types";

const song = { title: "The song", artist: "The artist", year: 1987 };
function game(): TypedGameView<HitsterView> {
  return {
    gameId: "hitster",
    players: ["a", "b"],
    active: [],
    result: null,
    timer: null,
    track: { url: "/track" },
    pause: { remainingMs: 4000 },
    view: {
      players: ["a", "b"],
      timelines: { a: [{ id: "card", ...song }], b: [] },
      current: null,
      currentPlayer: "a",
      revealing: true,
      nextPlayer: "b",
      turnNumber: 1,
      deckCount: 10,
      discardCount: 0,
      cardsToWin: 5,
      lastTurn: {
        turnNumber: 1,
        player: "a",
        outcome: "correct",
        song,
        index: 0,
      },
      winners: null,
    },
  };
}
const nameOf = (id: string) => (id === "a" ? "Ana" : "Bo");
function propsFor(
  state: TypedGameView<HitsterView>,
): GameProps<HitsterView, HitsterMove> {
  return {
    game: state,
    you: "a",
    nameOf,
    move: vi.fn(),
    audio: {
      status: "playing",
      muted: false,
      toggle: vi.fn(),
      setMuted: vi.fn(),
    },
  };
}
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("document", { querySelector: vi.fn() });
  vi.stubGlobal("addEventListener", vi.fn());
  vi.stubGlobal("removeEventListener", vi.fn());
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Hitster reveal presentation", () => {
  it("uses an empty center anchor for the active player's single draggable record, and tap-only for others", () => {
    const props = propsFor(game());
    props.game.view.revealing = false;
    props.game.view.current = { id: "current", title: null, artist: null };
    act(() => {
      renderer = create(createElement(hitsterUI.Center, props));
    });
    expect(
      renderer!.root.findAllByProps({ "data-mystery-home": true }),
    ).toHaveLength(1);
    expect(renderer!.root.findAllByType("button")).toHaveLength(0);
    props.you = "b";
    act(() => {
      renderer!.update(createElement(hitsterUI.Center, { ...props }));
    });
    expect(
      renderer!.root.findAllByProps({ "data-mystery-home": true }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ className: "mystery-card" }),
    ).toHaveLength(0);
    act(() => renderer!.root.findByType("button").props.onClick());
    expect(props.audio.toggle).toHaveBeenCalledOnce();
  });

  it.each([
    ["correct", "Ana got it!"],
    ["wrong", "Ana missed"],
    ["passed", "Ana was skipped"],
  ] as const)(
    "announces a %s result, song, year and next player",
    (outcome, title) => {
      const state = game();
      state.view.lastTurn!.outcome = outcome;
      expect(hitsterUI.announcement(state, nameOf)).toEqual({
        key: "turn-1",
        title,
        detail: "The song · The artist · 1987",
        next: "Next: Bo",
      });
      state.view.nextPlayer = null;
      expect(hitsterUI.announcement(state, nameOf)?.next).toBe("Ana wins!");
    },
  );

  it("does not keep announcing the last result once the reveal ends", () => {
    const state = game();
    state.view.revealing = false;
    expect(hitsterUI.announcement(state, nameOf)).toBeNull();
    state.view.revealing = true;
    state.view.lastTurn = null;
    expect(hitsterUI.announcement(state, nameOf)).toBeNull();
  });

  it("shows the revealed face in the center and hides placement controls, keeping the timeline", () => {
    const props: GameProps<HitsterView, HitsterMove> = {
      game: game(),
      you: "a",
      nameOf,
      move: vi.fn(),
      audio: {
        status: "playing",
        muted: false,
        toggle: vi.fn(),
        setMuted: vi.fn(),
      },
    };
    act(() => {
      renderer = create(createElement(hitsterUI.Center, props));
    });
    expect(
      renderer!.root.findByProps({ role: "img" }).props["aria-label"],
    ).toBe("The song, The artist, 1987");
    expect(renderer!.root.findAllByType("button")).toHaveLength(1);
    act(() => renderer!.root.findByType("button").props.onClick());
    expect(props.audio.toggle).toHaveBeenCalledOnce();
    act(() => {
      renderer!.update(createElement(hitsterUI.Dock!, props));
    });
    expect(renderer!.root.findAllByType("button")).toHaveLength(0);
    expect(
      renderer!.root.findByProps({ role: "list" }).props["aria-label"],
    ).toBe("Your timeline, oldest first");
    props.game.view.revealing = false;
    act(() => {
      renderer!.update(createElement(hitsterUI.Dock!, { ...props }));
    });
    expect(renderer!.root.findAllByType("button").length).toBeGreaterThan(0);
  });

  it("flips a correct card at its index without duplicating it in the timeline", () => {
    const state = game();
    act(() => {
      renderer = create(createElement(hitsterUI.Dock!, propsFor(state)));
    });
    expect(
      renderer!.root.findAllByProps({
        className: "revealed-placement correct",
      }),
    ).toHaveLength(1);
    expect(
      renderer!.root.findAllByProps({
        "aria-label": "The song, The artist, 1987",
      }),
    ).toHaveLength(1);
    expect(
      renderer!.root.findAllByProps({ "data-timeline-card": true }),
    ).toHaveLength(0);
  });

  it("shows a wrong placement, removes it after the exit animation, and closes the gap", () => {
    vi.useFakeTimers();
    const state = game();
    state.view.timelines.a = [
      { id: "old", title: "Old song", artist: "Artist", year: 1960 },
    ];
    state.view.lastTurn!.outcome = "wrong";
    state.view.lastTurn!.index = 1;
    const props = propsFor(state);
    act(() => {
      renderer = create(createElement(hitsterUI.Dock!, props));
    });
    expect(
      renderer!.root.findAllByProps({ className: "revealed-placement wrong" }),
    ).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    state.view.lastTurn = { ...state.view.lastTurn! };
    act(() => {
      renderer!.update(createElement(hitsterUI.Dock!, { ...props }));
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(
      renderer!.root.findAllByProps({ className: "revealed-placement wrong" }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ className: "placement-gap is-open" }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findAllByProps({ "data-timeline-card": true }),
    ).toHaveLength(1);
  });

  it("adds no placed card or gap for a pass or for an observer", () => {
    const state = game();
    state.view.lastTurn!.outcome = "passed";
    const props = propsFor(state);
    act(() => {
      renderer = create(createElement(hitsterUI.Dock!, props));
    });
    expect(
      renderer!.root.findAllByProps({ className: "placement-gap is-open" }),
    ).toHaveLength(0);
    props.you = null;
    act(() => {
      renderer!.update(createElement(hitsterUI.Dock!, { ...props }));
    });
    expect(renderer!.toJSON()).toBeNull();
  });
});

describe("keyboard song placement", () => {
  it.each([{ line: [] }, { line: [{ id: "old", ...song }] }])(
    "selects, moves, confirms and cancels with no plus buttons ($line)",
    ({ line }) => {
      const move = vi.fn();
      vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn((callback: FrameRequestCallback) => {
          callback(0);
          return 1;
        }),
      );
      act(() => {
        renderer = create(
          createElement(Placement, {
            line,
            move,
            audio: propsFor(game()).audio,
          }),
        );
      });
      const key = (key: string) =>
        act(() => {
          renderer!.root
            .findByProps({ className: "mystery-card" })
            .props.onKeyDown({ key, preventDefault: vi.fn() });
        });
      expect(renderer!.root.findAllByType("button")).toHaveLength(2);
      expect(
        renderer!.root.findByProps({ className: "btn gold" }).props.disabled,
      ).toBe(true);
      key("Enter");
      expect(move).not.toHaveBeenCalled();
      key("ArrowRight");
      expect(
        renderer!.root.findByProps({ className: "btn gold" }).props.disabled,
      ).toBe(false);
      key("ArrowRight");
      key("ArrowRight");
      key("Enter");
      expect(move).toHaveBeenLastCalledWith({
        type: "place",
        index: line.length,
      });
      key("ArrowLeft");
      key("Enter");
      expect(move).toHaveBeenLastCalledWith({ type: "place", index: 0 });
      key("Escape");
      expect(
        renderer!.root.findByProps({ className: "btn gold" }).props.disabled,
      ).toBe(true);
    },
  );
});
