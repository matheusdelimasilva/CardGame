import { createReadStream, existsSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { json } from "./context";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

/** Serves built client assets, falling back to the SPA entry for client routes. */
export function serveStatic(
  dir: string | undefined,
  path: string,
  res: ServerResponse,
): void {
  if (!dir) return json(res, 404, { error: "Not found." });
  let file = join(dir, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile())
    file = join(dir, "index.html");
  res.writeHead(200, {
    "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(res);
}
