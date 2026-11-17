import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSecondsLeft } from "./useSecondsLeft";

let seen: (number | null)[] = [];
function Probe({ timer }: { timer: { remainingMs: number } | null }) {
  seen.push(useSecondsLeft(timer));
  return null;
}
let renderer: ReactTestRenderer | undefined;
const render = (timer: { remainingMs: number } | null) =>
  act(() => {
    if (renderer) renderer.update(createElement(Probe, { timer }));
    else renderer = create(createElement(Probe, { timer }));
  });
const latest = () => seen.at(-1);

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "performance"],
  });
  seen = [];
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
});

describe("useSecondsLeft", () => {
  it("is null without a timer", () => {
    render(null);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(seen.every((s) => s === null)).toBe(true);
  });

  it("rounds up to whole seconds and counts down to zero", () => {
    render({ remainingMs: 2500 });
    expect(latest()).toBe(3);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(latest()).toBe(2);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(latest()).toBe(0);
  });

  it("restarts from each new timer the server sends", () => {
    render({ remainingMs: 10_000 });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(latest()).toBe(6);
    render({ remainingMs: 9000 });
    expect(latest()).toBe(9);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest()).toBe(8);
  });

  it("stops when the timer goes away", () => {
    render({ remainingMs: 5000 });
    render(null);
    expect(latest()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
