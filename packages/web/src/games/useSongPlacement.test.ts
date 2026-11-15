import { createElement, useLayoutEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSongPlacement } from "./useSongPlacement";

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

beforeEach(() => {
  card = new ElementStub(30, 100, 120);
  timeline = new ElementStub(300, 100, 600);
  frames = new Map();
  time = performance.now();
  frameId = 0;
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
    useSongPlacement(refs, selected, setSelected, setPreview, setDragging);
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
  expect(snapshot.selected).toBe(1);
  expect(card.classList.toggle).toHaveBeenLastCalledWith("is-returning", true);
});

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
