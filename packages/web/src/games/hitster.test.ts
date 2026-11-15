import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HitsterMove, HitsterView } from "@cardgame/games";
import { hitsterUI } from "./hitster";
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
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("document", {});
  vi.stubGlobal("addEventListener", vi.fn());
  vi.stubGlobal("removeEventListener", vi.fn());
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("Hitster reveal presentation", () => {
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
    expect(renderer!.root.findAllByType("button")).toHaveLength(0);
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
});
