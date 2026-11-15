import { createServer, type Server } from "node:http";
import { Auth, type SendEmail } from "./auth";
import { Deezer } from "./deezer";
import { guard } from "./guard";
import { createRouter } from "./http/routes";
import { startClock } from "./rooms/clock";
import { RoomRegistry } from "./rooms/registry";
import { RoomService } from "./rooms/service";
import { createStore } from "./store";
import { Gateway } from "./ws/gateway";

export interface AppOptions {
  /** JSON fallback when DATABASE_URL is unset. null always keeps everything in memory. */
  dataFile: string | null;
  /** null returns sign-in codes in the API response, for local development. */
  sendEmail: SendEmail | null;
  /** Built web client to serve, if any. */
  staticDir?: string;
  /** Used for requests to Deezer; tests pass a stand-in. */
  fetch?: typeof fetch;
}

/** Wires storage, room lifecycle, HTTP/WS transports and their shutdown hooks. */
export function createApp(options: AppOptions): {
  server: Server;
  ready: Promise<void>;
  close: () => Promise<void>;
} {
  const store = createStore(options.dataFile);
  const auth = new Auth(store, options.sendEmail);
  const deezer = new Deezer(options.fetch);
  const registry = new RoomRegistry(store);
  const service = new RoomService(registry, store);
  const router = createRouter({
    store,
    auth,
    deezer,
    registry,
    staticDir: options.staticDir,
  });
  const server = createServer(router);
  const gateway = new Gateway(server, registry, service, auth);
  const stopClock = startClock(registry, service);
  const stopSweep = registry.startIdleSweep(
    (room) => gateway.hasConnections(room),
    (room) => service.recover(room),
  );
  const authSweep = setInterval(
    () =>
      guard("auth cleanup", () => {
        if (registry.loaded) auth.prune();
      }),
    60_000,
  );
  authSweep.unref();

  return {
    server,
    ready: registry.ready,
    close: async () => {
      stopSweep();
      stopClock();
      clearInterval(authSweep);
      await Promise.all([
        gateway.close(),
        new Promise<void>((resolve) => server.close(() => resolve())),
      ]);
      await store.close();
    },
  };
}
