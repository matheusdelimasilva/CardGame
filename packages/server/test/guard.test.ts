import { afterEach, describe, expect, it, vi } from "vitest";
import { guard } from "../src/guard";

afterEach(() => vi.restoreAllMocks());

describe("guard", () => {
  it("returns successful values without recovering", () => {
    const recover = vi.fn();
    expect(guard("ABC234", () => 42, recover)).toBe(42);
    expect(guard("ABC234", () => undefined, recover)).toBeUndefined();
    expect(recover).not.toHaveBeenCalled();
  });

  it("logs the room and recovers thrown errors", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("view failed");
    const recover = vi.fn();
    expect(guard("ABC234", () => { throw error; }, recover)).toBeUndefined();
    expect(log).toHaveBeenCalledWith("Room ABC234:", error);
    expect(recover).toHaveBeenCalledOnce();
  });

  it("contains recovery failures too", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("recovery failed");
    expect(() => guard("ABC234", () => { throw null; }, () => { throw error; })).not.toThrow();
    expect(log).toHaveBeenCalledWith("Room ABC234: recovery failed:", error);
  });
});
