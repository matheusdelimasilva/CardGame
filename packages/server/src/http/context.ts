import type { IncomingMessage, ServerResponse } from "node:http";
import type { Auth } from "../auth";
import type { Deezer } from "../deezer";
import type { RoomRegistry } from "../rooms/registry";
import type { Store } from "../store";

/** Shared HTTP dependencies; handlers never mutate transport or timer state. */
export interface HttpContext {
  auth: Auth;
  deezer: Deezer;
  registry: RoomRegistry;
  store: Store;
  staticDir?: string;
}

export interface Route {
  method: string;
  path: string | RegExp;
  handler(
    req: IncomingMessage,
    res: ServerResponse,
    match: readonly string[],
  ): void | Promise<void>;
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function sessionEmail(req: IncomingMessage, auth: Auth): string | null {
  const header = req.headers.authorization ?? "";
  return auth.emailFor(header.startsWith("Bearer ") ? header.slice(7) : null);
}
