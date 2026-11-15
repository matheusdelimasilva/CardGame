// Step 2 (Brazil): look up every collected song on MusicBrainz (release year + mbid).
// Resumable: only songs missing from the cache are fetched.
// Usage: node fetch-musicbrainz-br.mjs [--limit N]
// Output: ../.cache/br/musicbrainz.json -> { "<songKey>": [candidate...] }
import { join } from "node:path";
import {
  CACHE_DIR,
  USER_AGENT,
  politeFetch,
  readJson,
  writeJson,
} from "../lib.mjs";
import { allSongs, primaryArtistBr, songKey } from "./sources-br.mjs";

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const songs = await allSongs();
const cachePath = join(CACHE_DIR, "br", "musicbrainz.json");
const cache = await readJson(cachePath, {});
const esc = (s) => s.replace(/["\\]/g, (c) => "\\" + c);

const todo = [...new Map(songs.map((s) => [songKey(s), s])).values()].filter(
  (s) => !cache[songKey(s)],
);
console.log(`${todo.length} songs to look up`);
let done = 0;
for (const song of todo) {
  if (done >= LIMIT) break;
  const artist = primaryArtistBr(song.artist);
  const query =
    `recording:"${esc(song.title)}"` +
    (artist ? ` AND artist:"${esc(artist)}"` : " AND country:BR");
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=15`;
  const res = await politeFetch(url, {
    minGapMs: 1100,
    headers: { "User-Agent": USER_AGENT },
  });
  const json = await res.json();
  cache[songKey(song)] = (json.recordings ?? []).map((r) => ({
    id: r.id,
    score: r.score,
    title: r.title,
    artist: (r["artist-credit"] ?? [])
      .map((a) => (a.name ?? "") + (a.joinphrase ?? ""))
      .join(""),
    firstRelease: r["first-release-date"] ?? null,
  }));
  if (++done % 25 === 0) {
    await writeJson(cachePath, cache);
    console.log(`${done}/${todo.length}`);
  }
}
await writeJson(cachePath, cache);
console.log(`done: ${done} looked up, ${Object.keys(cache).length} cached`);
