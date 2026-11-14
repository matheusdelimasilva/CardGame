// Step 4: match songs in out/songs.json to a Deezer track (for the 30s preview).
// Resumable: results are cached, re-running only looks up songs with no result yet.
// A song with no confident match is cached as null ("missing") and the run carries on.
// Fix those later in deezer-overrides.json: a Deezer track id, or null to drop the song.
// Usage: node fetch-deezer.mjs [--top N] [--file songs-br.json]
//        (--top 5: only each year's chart top 5; --file: another dataset in out/)
//        then node build-songs.mjs to write deezerId into songs.json
// Output: .cache/deezer.json -> { "<norm artist>|<norm title>": {id, title, artist} | null }
//         out/deezer-review.txt -> every match side by side, plus the missing list
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Deezer, norm } from "../../packages/server/src/deezer.ts";
import { CACHE_DIR, OUT_DIR, readJson, sleep, writeJson } from "./lib.mjs";

const deezerKey = (s) => `${norm(s.artist)}|${norm(s.title)}`;
const label = (s) => `${s.artist} — ${s.title}`;

const topArg = process.argv.indexOf("--top");
const TOP = topArg > -1 ? Number(process.argv[topArg + 1]) : Infinity;

// Deezer allows 50 requests per 5 seconds; stay well under it.
const MIN_GAP_MS = 120;
let last = 0;
async function politeDeezerFetch(url, init) {
  for (let attempt = 0; ; attempt++) {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    // Quota errors arrive as HTTP 200 with {"error":{"code":4}}.
    const quota = res.ok && (await res.clone().json().catch(() => ({})))?.error?.code === 4;
    if ((quota || res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    return res;
  }
}

const fileArg = process.argv.indexOf("--file");
const FILE = fileArg > -1 ? process.argv[fileArg + 1] : "songs.json"; // e.g. songs-br.json
// Songs without a chart rank (Brazilian Wikipedia-category songs) are skipped by --top only.
const songs = (await readJson(join(OUT_DIR, FILE))).filter((s) => (s.chartRank ?? Infinity) <= TOP);
const cachePath = join(CACHE_DIR, "deezer.json");
const cache = await readJson(cachePath, {});
const deezer = new Deezer(politeDeezerFetch);

let looked = 0;
for (const [i, song] of songs.entries()) {
  const key = deezerKey(song);
  if (key in cache) continue;
  const track = await deezer.findTrack(song).catch((e) => {
    console.error(`error on ${label(song)}: ${e.message}`);
    return undefined; // not cached, retried next run
  });
  if (track === undefined) continue;
  cache[key] = track && { id: track.id, title: track.title, artist: track.artist };
  console.log(`${String(i + 1).padStart(4)}/${songs.length} ${track ? "OK  " : "MISS"} ${song.year} ${label(song)}`);
  if (++looked % 25 === 0) await writeJson(cachePath, cache);
}
await writeJson(cachePath, cache);

// Review file: dataset song vs the Deezer track it was matched to, so wrong picks are easy to spot.
const lines = [];
const missing = [];
let matched = 0;
for (const s of songs) {
  const hit = cache[deezerKey(s)];
  if (hit === undefined) continue;
  if (!hit) {
    missing.push(`${s.year}  #${s.chartRank}  ${label(s)}`);
    continue;
  }
  matched++;
  lines.push(`${s.year}  #${s.chartRank}  ${label(s)}\n            => ${hit.artist} — ${hit.title}   [${hit.id}]`);
}
const reviewFile = FILE === "songs.json" ? "deezer-review.txt" : `deezer-review-${FILE.replace(/\.json$/, "")}.txt`;
await writeFile(
  join(OUT_DIR, reviewFile),
  `Deezer matches${TOP < Infinity ? ` (chart top ${TOP} per year)` : ""}: ${matched} matched, ${missing.length} missing\n\n` +
    `== Missing ==\n${missing.join("\n") || "(none)"}\n\n== Matched ==\n${lines.join("\n")}\n`,
);
console.log(`\n${matched} matched, ${missing.length} missing of ${songs.length} -> out/${reviewFile}`);
