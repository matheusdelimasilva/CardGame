import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandGeometry } from "./layout";
import { portraitLayout } from "./portrait";
import { flingStep, glideAt, useHandScroll } from "./useHandScroll";

describe("fling and glide", () => {
  it("slows a fling down, going as far whatever the frame rate", () => {
    const run = (dt: number) => {
      let v = 100;
      let travelled = 0;
      for (let t = 0; t < 600; t += dt) {
        const step = flingStep(v, dt);
        travelled += step.delta;
        v = step.velocity;
      }
      return { travelled, v };
    };
    const at60 = run(16);
    const at30 = run(32);
    expect(at60.v).toBeLessThan(100);
    expect(at60.travelled).toBeGreaterThan(0);
    expect(at30.travelled).toBeCloseTo(at60.travelled, 0);
  });

  it("eases a glide out from start to end", () => {
    expect(glideAt(0)).toBe(0);
    expect(glideAt(10_000)).toBe(1);
    expect(glideAt(100)).toBeGreaterThan(100 / 260);
    expect(glideAt(200)).toBeGreaterThan(glideAt(100));
  });
});

/** The stage element: its box (10px per unit) and what the hook writes to it. */
function fakeStage() {
  const props = new Map<string, string>();
  const attributes = new Set<string>();
  return {
    props,
    attributes,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 900 }),
    style: { setProperty: (k: string, v: string) => props.set(k, v) },
    toggleAttribute: (name: string, on: boolean) =>
      on ? attributes.add(name) : attributes.delete(name),
    setPointerCapture: vi.fn(),
  };
}

let renderer: ReactTestRenderer | undefined;
let rendered: ReturnType<typeof useHandScroll>[] = [];
/** The hook's latest latest(). */
const latest = () => rendered.at(-1)!;
const hand = portraitLayout(90, 4).hand;

function Probe({
  stage,
  geometry,
  slots,
  show,
}: {
  stage: ReturnType<typeof fakeStage>;
  geometry: HandGeometry;
  slots: number;
  show: number | null;
}) {
  rendered.push(
    useHandScroll(
      { current: stage as unknown as HTMLElement },
      geometry,
      42,
      slots,
      show,
    ),
  );
  return null;
}

beforeEach(() => {
  rendered = [];
  // No animation: glides land at once, flings do not start.
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  // Every press lands on the hand.
  vi.stubGlobal(
    "Element",
    class {
      closest() {
        return {};
      }
    },
  );
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

const render = (
  stage: ReturnType<typeof fakeStage>,
  slots: number,
  show: number | null = null,
) =>
  act(() => {
    const element = (
      <Probe stage={stage} geometry={hand} slots={slots} show={show} />
    );
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });

const press = (type: string, x: number, t: number) => ({
  pointerId: 1,
  isPrimary: true,
  button: 0,
  clientX: x,
  clientY: 700,
  timeStamp: t,
  target: new (globalThis.Element as unknown as new () => Element)(),
  currentTarget: { setPointerCapture: vi.fn() },
  type,
});

describe("useHandScroll", () => {
  it("marks a hand that does not fit, and which ends have cards out of view", () => {
    const stage = fakeStage();
    render(stage, 3);
    expect(stage.attributes.has("data-scrolls")).toBe(false);
    render(stage, 10);
    expect(stage.props.get("--gs-scroll")).toBe("0.000");
    expect([...stage.attributes].sort()).toEqual([
      "data-more-right",
      "data-scrolls",
    ]);
  });

  it("brings the card's slot into view, and back into range when the hand shrinks", () => {
    const stage = fakeStage();
    render(stage, 10, 9);
    expect(latest().scroller.get()).toBeCloseTo(hand.maxScroll(10), 9);
    expect(stage.attributes.has("data-more-left")).toBe(true);
    expect(stage.attributes.has("data-more-right")).toBe(false);
    render(stage, 6, null);
    expect(latest().scroller.get()).toBeCloseTo(hand.maxScroll(6), 9);
  });

  it("pans with a press on the hand that moves sideways, within the hand's range", () => {
    const stage = fakeStage();
    render(stage, 10);
    const { handlers } = latest();
    act(() => {
      handlers.onPointerDown(press("pointerdown", 300, 0) as never);
      // Under the threshold: nothing moves yet.
      handlers.onPointerMove(press("pointermove", 296, 10) as never);
    });
    expect(latest().scroller.get()).toBe(0);
    act(() => {
      handlers.onPointerMove(press("pointermove", 200, 20) as never);
    });
    // 100px is 10 units to the left: newer cards come into view.
    expect(latest().scroller.get()).toBeCloseTo(10, 9);
    act(() => {
      handlers.onPointerMove(press("pointermove", -2000, 30) as never);
      handlers.onPointerUp(press("pointerup", -2000, 300) as never);
    });
    expect(latest().scroller.get()).toBeCloseTo(hand.maxScroll(10), 9);
  });

  it("scrolls by the wheel, and the drag code may move it too", () => {
    const stage = fakeStage();
    render(stage, 10);
    act(() =>
      latest().handlers.onWheel({
        deltaX: 0,
        deltaY: 50,
        deltaMode: 0,
        target: press("wheel", 0, 0).target,
      } as never),
    );
    expect(latest().scroller.get()).toBeCloseTo(5, 9);
    expect(latest().scroller.by(-100)).toBe(0);
  });
});
