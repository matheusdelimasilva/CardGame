import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { landscapeLayout, type StageLayout } from "./layout";
import { portraitLayout } from "./portrait";
import type { HandScroller } from "./useHandScroll";
import { useMysteryDrag, type MysteryDragOptions } from "./useMysteryDrag";

/** Stage units are 10px: the stage's box is ten times its width in units. */
const PX = 10;
const portrait = portraitLayout(90, 4);
const HAND = 9;

/** The card element: what the hook reads of it and does to it. */
function fakeCard() {
  const captured = new Set<number>();
  return {
    captured,
    focus: vi.fn(),
    setPointerCapture: vi.fn((id: number) => void captured.add(id)),
    releasePointerCapture: vi.fn((id: number) => void captured.delete(id)),
    hasPointerCapture: (id: number) => captured.has(id),
    // Centred on stage (14.2, 15.9).
    getBoundingClientRect: () => ({
      left: 100,
      top: 100,
      width: 84,
      height: 118,
    }),
    style: { setProperty: vi.fn() },
  };
}
type Card = ReturnType<typeof fakeCard>;

function fakeScroller(max: number): HandScroller & { value: number } {
  const s = {
    value: 0,
    get: () => s.value,
    by: (delta: number) =>
      (s.value = Math.max(0, Math.min(max, s.value + delta))),
    stop: vi.fn(),
  };
  return s;
}

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let now: number;
/** Runs `count` animation frames, 16ms apart. */
const runFrames = (count: number) => {
  for (let i = 0; i < count; i++) {
    now += 16;
    const due = [...frames.values()];
    frames.clear();
    act(() => due.forEach((cb) => cb(now)));
  }
};

let renderer: ReactTestRenderer | undefined;
type Handlers = ReturnType<typeof useMysteryDrag>;
let rendered: Handlers[] = [];
/** The handlers of the latest render. */
const drag = () => rendered.at(-1)!;

function Probe(props: MysteryDragOptions) {
  rendered.push(useMysteryDrag(props));
  return null;
}

function setup(
  overrides: Partial<MysteryDragOptions> & { layout?: StageLayout } = {},
) {
  const layout = overrides.layout ?? portrait;
  const options: MysteryDragOptions = {
    stage: {
      current: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: layout.stage.w * PX,
          height: layout.stage.h * PX,
        }),
      } as unknown as HTMLElement,
    },
    layout,
    scroller: fakeScroller(layout.hand.maxScroll(HAND + 1)),
    draggable: true,
    handCount: HAND,
    onGrab: vi.fn(),
    onHover: vi.fn(),
    onDrop: vi.fn(),
    onTap: vi.fn(),
    ...overrides,
  };
  act(() => {
    renderer = create(<Probe {...options} />);
  });
  return options as MysteryDragOptions & {
    scroller: ReturnType<typeof fakeScroller>;
  };
}

/** A pointer event at stage units (x, y), on `card`. */
const at = (card: Card, x: number, y: number, extra: object = {}) =>
  ({
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: x * PX,
    clientY: y * PX,
    currentTarget: card,
    ...extra,
  }) as unknown as Parameters<Handlers["onPointerDown"]>[0];

const HOME = { x: 14.2, y: 15.9 };
const handY = portrait.hand.slot(0, HAND + 1).y;

beforeEach(() => {
  rendered = [];
  frames = new Map();
  nextFrame = 1;
  now = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(nextFrame, cb);
    return nextFrame++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

describe("pressing the mystery card", () => {
  it("captures the pointer, and a press that barely moves is a tap", () => {
    const o = setup();
    const card = fakeCard();
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    expect(card.setPointerCapture).toHaveBeenCalledWith(1);
    expect(card.focus).toHaveBeenCalled();
    // 0.6u is 6px: under the 7px threshold.
    drag().onPointerMove(at(card, HOME.x + 0.6, HOME.y));
    drag().onPointerUp(at(card, HOME.x + 0.6, HOME.y));
    expect(o.onGrab).not.toHaveBeenCalled();
    expect(o.onTap).toHaveBeenCalledTimes(1);
    expect(o.onDrop).not.toHaveBeenCalled();
    expect(card.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("only taps a card that cannot be dragged, however far the pointer goes", () => {
    const o = setup({ draggable: false });
    const card = fakeCard();
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    drag().onPointerMove(at(card, 20, handY));
    drag().onPointerUp(at(card, 20, handY));
    expect(o.onGrab).not.toHaveBeenCalled();
    expect(o.onTap).toHaveBeenCalledTimes(1);
  });

  it("ignores other buttons, other pointers and a second press", () => {
    const o = setup();
    const card = fakeCard();
    drag().onPointerDown(at(card, HOME.x, HOME.y, { button: 2 }));
    drag().onPointerDown(at(card, HOME.x, HOME.y, { isPrimary: false }));
    expect(card.setPointerCapture).not.toHaveBeenCalled();
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    drag().onPointerDown(at(card, HOME.x, HOME.y, { pointerId: 2 }));
    expect(card.setPointerCapture).toHaveBeenCalledTimes(1);
    drag().onPointerUp(at(card, HOME.x, HOME.y, { pointerId: 2 }));
    expect(o.onTap).not.toHaveBeenCalled();
  });
});

describe("dragging the mystery card", () => {
  it("picks it up past the threshold, follows the pointer and drops it in the slot under it", () => {
    const o = setup();
    const card = fakeCard();
    const slot3 = portrait.hand.slot(3, HAND + 1);
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    drag().onPointerMove(at(card, HOME.x, HOME.y + 3));
    expect(o.onGrab).toHaveBeenCalledTimes(1);
    expect(o.scroller.stop).toHaveBeenCalled();
    expect(o.onHover).not.toHaveBeenCalled();
    drag().onPointerMove(at(card, slot3.x, slot3.y));
    expect(card.style.setProperty).toHaveBeenLastCalledWith(
      "--gs-held-y",
      String(slot3.y),
    );
    expect(o.onHover).toHaveBeenLastCalledWith(3);
    drag().onPointerUp(at(card, slot3.x, slot3.y));
    expect(o.onDrop).toHaveBeenCalledWith(3);
    expect(card.captured.size).toBe(0);
  });

  it("keeps the pointer's grip on the card: the card's centre, not the pointer, picks the slot", () => {
    const o = setup();
    const card = fakeCard();
    const slot3 = portrait.hand.slot(3, HAND + 1);
    // Pressed 3u right of the card's centre.
    drag().onPointerDown(at(card, HOME.x + 3, HOME.y));
    drag().onPointerMove(at(card, slot3.x + 3, slot3.y));
    expect(o.onHover).toHaveBeenLastCalledWith(3);
  });

  it.each(["onPointerCancel", "onLostPointerCapture"] as const)(
    "sends the card home on %s",
    (handler) => {
      const o = setup();
      const card = fakeCard();
      const slot = portrait.hand.slot(2, HAND + 1);
      drag().onPointerDown(at(card, HOME.x, HOME.y));
      drag().onPointerMove(at(card, slot.x, slot.y));
      drag()[handler](at(card, slot.x, slot.y));
      expect(o.onDrop).toHaveBeenCalledWith(null);
      expect(o.onTap).not.toHaveBeenCalled();
      // The press is over: a late pointerup does nothing more.
      drag().onPointerUp(at(card, slot.x, slot.y));
      expect(o.onDrop).toHaveBeenCalledTimes(1);
    },
  );

  it("lets go of the pointer when the card is taken away mid-drag", () => {
    setup();
    const card = fakeCard();
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    drag().onPointerMove(at(card, 40, handY));
    expect(frames.size).toBe(1);
    act(() => renderer!.unmount());
    renderer = undefined;
    expect(card.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(frames.size).toBe(0);
  });
});

describe("auto-scrolling a long hand", () => {
  it("scrolls while the card is held near an edge, and the slot under it follows", () => {
    const o = setup();
    const card = fakeCard();
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    drag().onPointerMove(at(card, 41.5, handY));
    const first = vi.mocked(o.onHover).mock.lastCall![0]!;
    runFrames(60);
    expect(o.scroller.value).toBeGreaterThan(0);
    const later = vi.mocked(o.onHover).mock.lastCall![0]!;
    expect(later).toBeGreaterThan(first);
    // Back in the middle it stops.
    drag().onPointerMove(at(card, 21, handY));
    const stopped = o.scroller.value;
    runFrames(10);
    expect(o.scroller.value).toBe(stopped);
    expect(frames.size).toBe(0);
    // It drops where the scrolled hand put the slot.
    drag().onPointerUp(at(card, 21, handY));
    expect(o.onDrop).toHaveBeenCalledWith(
      portrait.hand.insertionIndex(21 + stopped, HAND),
    );
  });

  it("scrolls back towards older cards at the left edge, and not when the card is off the hand", () => {
    const o = setup();
    o.scroller.value = 20;
    const card = fakeCard();
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    drag().onPointerMove(at(card, 0.5, HOME.y + 5));
    runFrames(5);
    expect(o.scroller.value).toBe(20);
    drag().onPointerMove(at(card, 0.5, handY));
    runFrames(5);
    expect(o.scroller.value).toBeLessThan(20);
  });

  it("stops scrolling once the card is let go", () => {
    const o = setup();
    const card = fakeCard();
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    drag().onPointerMove(at(card, 41.5, handY));
    runFrames(3);
    drag().onPointerUp(at(card, 41.5, handY));
    const after = o.scroller.value;
    runFrames(5);
    expect(o.scroller.value).toBe(after);
    expect(frames.size).toBe(0);
  });

  it("never scrolls the landscape hand, which always fits", () => {
    const layout = landscapeLayout(4);
    const o = setup({ layout, scroller: fakeScroller(0) });
    const card = fakeCard();
    drag().onPointerDown(at(card, HOME.x, HOME.y));
    drag().onPointerMove(at(card, 76, 53));
    expect(frames.size).toBe(0);
    expect(o.onHover).toHaveBeenLastCalledWith(
      layout.hand.insertionIndex(76, HAND),
    );
  });
});
