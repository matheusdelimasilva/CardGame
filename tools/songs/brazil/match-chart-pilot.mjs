// Network enrichment only: never changes the game catalog or approves matches.
// Run with Node supporting TypeScript: node tools/songs/brazil/match-chart-pilot.mjs
import { join } from "node:path";
import { Deezer } from "../../../packages/server/src/deezer.ts";
import {
  CACHE_DIR,
  OUT_DIR,
  readJson,
  writeJson,
  USER_AGENT,
} from "../lib.mjs";
const input = await readJson(join(OUT_DIR, "chart-pilot-br.json"));
const path = join(CACHE_DIR, "br", "chart-pilot-matches.json");
const cache = await readJson(path, {});
let last = 0;
async function polite(url, init = {}) {
  await new Promise((r) => setTimeout(r, Math.max(0, last + 250 - Date.now())));
  last = Date.now();
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, ...init.headers },
      signal: AbortSignal.timeout(15000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    return response;
  }
}
const matcher = new Deezer(polite);
for (const song of input.candidates) {
  const key = `${song.artist}|${song.title}`;
  if (cache[key]) continue;
  try {
    const match = await matcher.findTrack(song);
    let metadata = null,
      preview = null;
    if (match) {
      const track = await (
        await polite(`https://api.deezer.com/track/${match.id}`)
      ).json();
      metadata = {
        id: track.id,
        title: track.title,
        artist: track.artist?.name,
        album: track.album?.title,
        albumId: track.album?.id,
        isrc: track.isrc,
        duration: track.duration,
        releaseDate: track.release_date,
        readable: track.readable,
      };
      const audio = await polite(match.previewUrl, {
        headers: { Range: "bytes=0-1023" },
      });
      const bytes = new Uint8Array(await audio.arrayBuffer());
      preview = {
        status: audio.status,
        contentType: audio.headers.get("content-type"),
        bytes: bytes.length,
        ok:
          [200, 206].includes(audio.status) &&
          audio.headers.get("content-type")?.startsWith("audio/") &&
          bytes.length > 0,
      };
    }
    cache[key] = {
      song,
      metadata,
      preview,
      checkedAt: new Date().toISOString(),
      state: match ? "needs_release_and_chart_review" : "no_match",
    };
    await writeJson(path, cache);
    console.log(
      `${Object.keys(cache).length}/${input.candidates.length} ${match ? "MATCH" : "MISS"} ${song.year} ${key}`,
    );
  } catch (error) {
    console.error(`Retryable error ${key}: ${error.message}`);
  }
}
console.log("Saved candidate evidence to", path);
