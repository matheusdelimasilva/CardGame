// Step 2: look up each charted song on MusicBrainz and cache the candidate
// recordings (title, artists, first-release-date). Resumable: re-running only
// fetches songs that are not cached yet.
// Usage: node fetch-musicbrainz.mjs [--limit N]
// Output: .cache/musicbrainz.json -> { "<chartYear>|<rank>": [candidate...] }
import { join } from "node:path";
import { CACHE_DIR, USER_AGENT, politeFetch, readJson, writeJson } from "./lib.mjs";
import { primaryArtist } from "./normalize.mjs";

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const billboard = await readJson(join(CACHE_DIR, "billboard.json"));
const songs = Object.values(billboard.years).flatMap((y) => y.rows);

const cachePath = join(CACHE_DIR, "musicbrainz.json");
const cache = await readJson(cachePath, {});

const esc = (s) => s.replace(/["\\]/g, (c) => "\\" + c);
let done = 0;
for (const song of songs) {
  const key = `${song.chartYear}|${song.rank}`;
  if (cache[key]) continue;
  if (done >= LIMIT) break;
  const query = `recording:"${esc(song.title)}" AND artist:"${esc(primaryArtist(song.artist))}"`;
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=15`;
  const res = await politeFetch(url, { minGapMs: 1100, headers: { "User-Agent": USER_AGENT } });
  const json = await res.json();
  cache[key] = (json.recordings ?? []).map((r) => ({
    id: r.id,
    score: r.score,
    title: r.title,
    artist: (r["artist-credit"] ?? []).map((a) => (a.name ?? "") + (a.joinphrase ?? "")).join(""),
    firstRelease: r["first-release-date"] ?? null,
  }));
  done++;
  if (done % 25 === 0) {
    await writeJson(cachePath, cache);
    console.log(`${Object.keys(cache).length}/${songs.length} cached (at ${key})`);
  }
}
await writeJson(cachePath, cache);
console.log(`done: ${Object.keys(cache).length}/${songs.length} cached`);
