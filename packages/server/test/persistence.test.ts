import { afterEach, describe, expect, it, vi } from "vitest";
import { BufferedStore } from "../src/persistence";

class TestStore extends BufferedStore {
  readonly ready = Promise.resolve();
  write = vi.fn(async () => {});
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("persistence backoff", () => {
  it("retains all changes through an outage and retries with a capped backoff", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const timers = vi.spyOn(globalThis, "setTimeout");
    const store = new TestStore();
    store.write.mockRejectedValue(new Error("database unavailable"));
    store.save({
      rooms: ["ABC234"],
      sessions: ["token"],
      history: ["host@example.com"],
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(store.write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.write).toHaveBeenCalledOnce();
    expect(timers).toHaveBeenLastCalledWith(expect.any(Function), 600);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(store.write.mock.calls.length).toBeGreaterThan(3);
    expect(timers).toHaveBeenLastCalledWith(expect.any(Function), 30_000);
    store.write.mockResolvedValue();
    store.save({ rooms: ["DEF567"] });
    await store.close();
    expect(store.write).toHaveBeenLastCalledWith(
      expect.objectContaining({
        rooms: new Set(["ABC234", "DEF567"]),
        sessions: new Set(["token"]),
        history: new Set(["host@example.com"]),
      }),
    );
  });
});
