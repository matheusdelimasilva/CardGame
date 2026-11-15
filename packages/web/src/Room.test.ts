import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Announcement } from "./Room";

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
});

const info = {
  key: "turn-1",
  title: "Ana got it!",
  detail: "Song · 1987",
  next: "Next: Bo",
};
describe("table announcement", () => {
  it("stays visible throughout a pause, cannot be dismissed, and keeps the progress animation across updates", () => {
    vi.useFakeTimers();
    act(() => {
      renderer = create(
        createElement(Announcement, { info, pause: { remainingMs: 6000 } }),
      );
    });
    const progress = () =>
      renderer!.root
        .findByProps({ className: "banner-progress" })
        .findByType("span");
    expect(progress().props.style.animationDuration).toBe("6000ms");
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => renderer!.root.findByProps({ role: "status" }).props.onClick());
    expect(renderer!.root.findAllByProps({ role: "status" })).toHaveLength(1);
    act(() => {
      renderer!.update(
        createElement(Announcement, { info, pause: { remainingMs: 2000 } }),
      );
    });
    expect(progress().props.style.animationDuration).toBe("6000ms");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(renderer!.root.findAllByProps({ role: "status" })).toHaveLength(1);
    act(() => {
      renderer!.update(
        createElement(Announcement, { info: null, pause: null }),
      );
    });
    expect(renderer!.toJSON()).toBeNull();
  });

  it("preserves the 3.2 second timeout for games without pauses", () => {
    vi.useFakeTimers();
    act(() => {
      renderer = create(createElement(Announcement, { info, pause: null }));
    });
    act(() => {
      vi.advanceTimersByTime(3199);
    });
    expect(renderer!.root.findAllByProps({ role: "status" })).toHaveLength(1);
    expect(
      renderer!.root.findAllByProps({ className: "banner-progress" }),
    ).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(renderer!.toJSON()).toBeNull();
  });

  it("renders nothing without an announcement", () => {
    act(() => {
      renderer = create(
        createElement(Announcement, {
          info: null,
          pause: { remainingMs: 4000 },
        }),
      );
    });
    expect(renderer!.toJSON()).toBeNull();
  });
});
