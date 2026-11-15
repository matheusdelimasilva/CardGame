import type { IncomingMessage, ServerResponse } from "node:http";
import { guard } from "../guard";
import { HttpError } from "../http";
import { authRoutes } from "./auth";
import { json, type HttpContext } from "./context";
import { roomRoutes } from "./rooms";
import { serveStatic } from "./static";

/** Dispatches a small route table; HTTP failures never reset a running game. */
export function createRouter(
  context: HttpContext,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const routes = [...authRoutes(context), ...roomRoutes(context)];
  return async (req, res) => {
    let code = "HTTP";
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      code =
        /^\/api\/rooms\/([^/]+)/.exec(url.pathname)?.[1]?.toUpperCase() ??
        "HTTP";
      await context.registry.ready;
      for (const route of routes) {
        if (req.method !== route.method) continue;
        const match =
          typeof route.path === "string"
            ? url.pathname === route.path
              ? [url.pathname]
              : null
            : route.path.exec(url.pathname);
        if (!match) continue;
        await route.handler(req, res, match);
        return;
      }
      if (url.pathname.startsWith("/api/"))
        return json(res, 404, { error: "Not found." });
      if (req.method === "GET")
        return serveStatic(context.staticDir, url.pathname, res);
      json(res, 405, { error: "Method not allowed." });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(`Room ${code}:`, err);
      guard(code, () => {
        if (res.headersSent) res.destroy();
        else
          json(res, err instanceof HttpError ? err.status : 500, {
            error:
              err instanceof HttpError ? err.message : "Something went wrong.",
          });
      });
    }
  };
}
