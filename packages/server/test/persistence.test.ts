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

describe("bounded persistence retries", () => {
  it("stops retrying a bad batch after three attempts and saves later changes", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = new TestStore();
    store.write.mockRejectedValue(new Error("bad row"));
    store.save({ rooms: ["BAD123"] });
    await vi.advanceTimersByTimeAsync(900);
    expect(store.write).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.write).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(
      "Dropping persistence batch after 3 failed attempts:",
      expect.objectContaining({ rooms: ["BAD123"] }),
      expect.any(Error),
    );
    store.write.mockResolvedValue();
    store.save({ rooms: ["GOOD12"] });
    await store.close();
    expect(store.write).toHaveBeenLastCalledWith(
      expect.objectContaining({ rooms: new Set(["GOOD12"]) }),
    );
  });
});
