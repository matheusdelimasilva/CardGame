import type { RoomRegistry } from "./registry";
import type { RoomService } from "./service";

/** Runs timed game commands only after saved rooms have finished restoring. */
export function startClock(
  registry: RoomRegistry,
  service: RoomService,
): () => void {
  const timer = setInterval(() => {
    if (!registry.loaded) return;
    for (const room of registry.values()) service.expire(room);
  }, 250);
  timer.unref();
  return () => clearInterval(timer);
}
