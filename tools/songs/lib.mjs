// Shared helpers for the song data pipeline (plain Node, no dependencies).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(ROOT, ".cache");
export const OUT_DIR = join(ROOT, "out");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT" && fallback !== undefined) return fallback;
    throw e;
  }
}

export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

// Polite fetch: enforces a minimum gap between calls to the same host and
// retries on 429/5xx with backoff.
const lastCall = new Map();
export async function politeFetch(url, { minGapMs, headers = {}, retries = 6 } = {}) {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const wait = (lastCall.get(host) ?? 0) + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
    const res = await fetch(url, { headers });
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await sleep(Math.max(retryAfter * 1000, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
}

export const USER_AGENT = "CardGameSongData/0.1 (hobby music-timeline card game; one-off data build)";
