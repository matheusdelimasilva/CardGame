import { createElement, useLayoutEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSongPlacement } from "./useSongPlacement";
import { Placement } from "./hitster-dock";

class ElementStub extends EventTarget {
  style = { setProperty: vi.fn(), clipPath: "" };
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  focus = vi.fn();
  captured = new Set<number>();
  setPointerCapture = (id: number) => this.captured.add(id);
  hasPointerCapture = (id: number) => this.captured.has(id);
  releasePointerCapture = (id: number) => this.captured.delete(id);
  scrollLeft = 0;
  querySelectorAll = vi.fn(() => [
    new ElementStub(400, 100, 100),
    new ElementStub(600, 100, 100),
  ]);
  constructor(
    private x: number,
    private y: number,
    private width: number,
  ) {
    super();
  }
  getBoundingClientRect = () => ({
    left: this.x,
    right: this.x + this.width,
    top: this.y,
    bottom: this.y + 180,
    width: this.width,
  });
}

let card: ElementStub;
let timeline: ElementStub;
let renderer: ReactTestRenderer;
let snapshot: {
  selected: number | null;
  preview: number | null;
  dragging: boolean;
};
let frames: Map<number, FrameRequestCallback>;
let time: number;
let frameId: number;
let toggleAudio = vi.fn<() => void>();

beforeEach(() => {
  card = new ElementStub(30, 100, 120);
  timeline = new ElementStub(300, 100, 600);
  frames = new Map();
  time = performance.now();
  frameId = 0;
  toggleAudio = vi.fn<() => void>();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  const refs = {
    card: { current: card as unknown as HTMLButtonElement },
    timeline: { current: timeline as unknown as HTMLDivElement },
    home: {
      current: new ElementStub(30, 100, 120) as unknown as HTMLDivElement,
    },
    gap: {
      current: new ElementStub(500, 100, 120) as unknown as HTMLDivElement,
    },
  };
  function Harness() {
    const [selected, setSelected] = useState<number | null>(null);
    const [preview, setPreview] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    useSongPlacement(
      refs,
      selected,
      setSelected,
      setPreview,
      setDragging,
      toggleAudio,
    );
    useLayoutEffect(() => {
      snapshot = { selected, preview, dragging };
    });
    return null;
  }
  act(() => {
    renderer = create(createElement(Harness));
  });
});
afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

function pointer(type: string, x: number, y = 150, extra = {}) {
  const event = Object.assign(
    new Event(type, { cancelable: true }),
    { isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y },
    extra,
  );
  act(() => {
    card.dispatchEvent(event);
  });
}
function frame() {
  const callbacks = [...frames.values()];
  frames.clear();
  time += 16;
  act(() => {
    callbacks.forEach((callback) => callback(time));
  });
}

it("captures the pointer, follows it, previews a gap and commits only on an inside drop", () => {
  pointer("pointerdown", 80);
  expect(card.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(card.hasPointerCapture(1)).toBe(true);
  pointer("pointermove", 550);
  frame();
  expect(snapshot).toEqual({ selected: null, preview: 1, dragging: true });
  expect(card.style.setProperty).toHaveBeenCalledWith("--drag-x", "500px");
  pointer("pointerup", 550);
  frame();
  expect(snapshot).toEqual({ selected: 1, preview: null, dragging: false });
  expect(card.hasPointerCapture(1)).toBe(false);
  expect(card.style.setProperty).toHaveBeenCalledWith("--drag-x", "500px");
  pointer("pointerdown", 80);
  pointer("pointerup", 50, 400);
  expect(snapshot.selected).toBeNull();
  expect(toggleAudio).not.toHaveBeenCalled();
  expect(card.classList.toggle).toHaveBeenLastCalledWith("is-returning", true);
});

function click(detail = 1) {
  const event = Object.assign(new Event("click", { cancelable: true }), {
    detail,
  });
  card.dispatchEvent(event);
  return event;
}

it("clicks without a pointer gesture toggle audio", () => {
  click(0);
  expect(toggleAudio).toHaveBeenCalledOnce();
  click();
  expect(toggleAudio).toHaveBeenCalledOnce();
});

it("Space leaves activation to the native click, while Enter confirmation prevents it", () => {
  vi.stubGlobal("document", { querySelector: vi.fn(() => card) });
  act(() => {
    renderer.unmount();
    renderer = create(
      createElement(Placement, {
        line: [],
        move: vi.fn(),
        audio: {
          muted: false,
          status: "paused",
          toggle: toggleAudio,
          setMuted: vi.fn(),
        },
      }),
      {
        createNodeMock: (element) =>
          element.props.className === "mystery-card" ? card : timeline,
      },
    );
  });
  const keyDown = renderer.root.findByProps({
    className: "mystery-card",
  });
  const preventDefault = vi.fn();
  act(() => keyDown.props.onKeyDown({ key: " ", preventDefault }));
  expect(preventDefault).not.toHaveBeenCalled();
  expect(toggleAudio).not.toHaveBeenCalled();
  click(0);
  expect(toggleAudio).toHaveBeenCalledOnce();
  act(() => keyDown.props.onKeyDown({ key: "Enter", preventDefault }));
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(toggleAudio).toHaveBeenCalledOnce();
});

it("taps below the threshold toggle audio once, never on down or the following click", () => {
  pointer("pointerdown", 80);
  expect(toggleAudio).not.toHaveBeenCalled();
  pointer("pointermove", 84, 153);
  frame();
  expect(snapshot.dragging).toBe(false);
  pointer("pointerup", 84, 153);
  expect(toggleAudio).toHaveBeenCalledOnce();
  expect(click().defaultPrevented).toBe(true);
  expect(toggleAudio).toHaveBeenCalledOnce();
});

it.each(["pointercancel", "lostpointercapture"])(
  "a pending tap cancelled by %s never toggles audio",
  (type) => {
    pointer("pointerdown", 80);
    pointer(type, 80);
    expect(toggleAudio).not.toHaveBeenCalled();
  },
);

it("crossing the threshold then returning to the starting point is still a drag, not a tap", () => {
  pointer("pointerdown", 80);
  pointer("pointermove", 88);
  expect(snapshot.dragging).toBe(true);
  pointer("pointermove", 80);
  pointer("pointerup", 80);
  expect(click().defaultPrevented).toBe(true);
  expect(toggleAudio).not.toHaveBeenCalled();
  expect(snapshot.selected).toBeNull();
  click(0);
  expect(toggleAudio).toHaveBeenCalledOnce();
});

it("does not suppress a later accessible click when a cancelled gesture generated no click", async () => {
  pointer("pointerdown", 80);
  pointer("pointercancel", 80);
  await new Promise((resolve) => setTimeout(resolve, 0));
  click(0);
  expect(toggleAudio).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "ignores delayed pointer clicks after a gesture (drag: %s)",
  async (drag) => {
    pointer("pointerdown", 80);
    if (drag) pointer("pointermove", 550);
    pointer("pointerup", drag ? 550 : 80);
    expect(toggleAudio).toHaveBeenCalledTimes(drag ? 0 : 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    click();
    expect(toggleAudio).toHaveBeenCalledTimes(drag ? 0 : 1);
  },
);

it.each(["pointercancel", "lostpointercapture"])(
  "restores the starting slot on %s",
  (type) => {
    pointer("pointerdown", 80);
    pointer("pointermove", 550);
    frame();
    pointer(type, 550);
    frame();
    expect(snapshot).toEqual({
      selected: null,
      preview: null,
      dragging: false,
    });
    expect(card.style.setProperty).toHaveBeenCalledWith("--drag-x", "30px");
  },
);

it("returns an outside drop home and ignores secondary buttons and unrelated pointers", () => {
  pointer("pointerdown", 80, 150, { button: 2 });
  expect(snapshot.dragging).toBe(false);
  pointer("pointerdown", 80, 150, { isPrimary: false });
  expect(snapshot.dragging).toBe(false);
  pointer("pointerdown", 80);
  pointer("pointermove", 550, 150, { pointerId: 2 });
  frame();
  expect(snapshot.preview).toBeNull();
  pointer("pointerup", 550, 400);
  expect(snapshot.selected).toBeNull();
});

it("auto-scrolls near both edges even if the pointer stops moving", () => {
  pointer("pointerdown", 80);
  pointer("pointermove", 890);
  frame();
  const first = timeline.scrollLeft;
  expect(first).toBeGreaterThan(0);
  frame();
  expect(timeline.scrollLeft).toBeGreaterThan(first);
  const second = timeline.scrollLeft;
  pointer("pointermove", 301);
  frame();
  expect(timeline.scrollLeft).toBeLessThan(second);
  pointer("pointermove", 550, 400);
  frame();
  const outside = timeline.scrollLeft;
  frame();
  expect(timeline.scrollLeft).toBe(outside);
});

it("supports an empty timeline and releases capture and pending frames on unmount", () => {
  timeline.querySelectorAll.mockReturnValue([]);
  pointer("pointerdown", 80);
  pointer("pointermove", 550);
  frame();
  expect(snapshot.preview).toBe(0);
  act(() => renderer.unmount());
  expect(card.hasPointerCapture(1)).toBe(false);
  expect(frames.size).toBe(0);
});
