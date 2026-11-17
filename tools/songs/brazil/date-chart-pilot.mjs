// Resolve playable candidates by exact recording ISRC. This produces evidence,
// never a release-year guess from ISRC digits or Deezer compilation dates.
import { join } from "node:path";
import { CACHE_DIR, readJson, writeJson, USER_AGENT } from "../lib.mjs";
const paths = ["chart-pilot-matches.json", "chart-pilot-review.json"];
const candidates = [];
for (const p of paths)
  for (const [key, v] of Object.entries(
    await readJson(join(CACHE_DIR, "br", p), {}),
  ))
    if (v.metadata?.isrc && v.preview?.ok) candidates.push({ key, ...v });
const path = join(CACHE_DIR, "br", "chart-pilot-recordings.json");
const cache = await readJson(path, {});
let last = 0;
for (const item of candidates) {
  const isrc = item.metadata.isrc;
  if (cache[isrc]) continue;
  try {
    await new Promise((r) =>
      setTimeout(r, Math.max(0, last + 1150 - Date.now())),
    );
    last = Date.now();
    const url = new URL("https://musicbrainz.org/ws/2/recording");
    url.searchParams.set("query", `isrc:${isrc}`);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", "100");
    let r;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok || ![429, 503].includes(r.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 2500 * 2 ** attempt));
    }
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    const x = await r.json();
    cache[isrc] = {
      isrc,
      queriedAt: new Date().toISOString(),
      sourceUrl: url.toString(),
      recordings: (x.recordings ?? []).map((r) => ({
        mbid: r.id,
        title: r.title,
        artist: (r["artist-credit"] ?? [])
          .map((a) => (a.name ?? "") + (a.joinphrase ?? ""))
          .join(""),
        artistIds: (r["artist-credit"] ?? [])
          .map((a) => a.artist?.id)
          .filter(Boolean),
        firstRelease: r["first-release-date"] ?? null,
        score: r.score,
      })),
    };
    await writeJson(path, cache);
    console.log(
      `${Object.keys(cache).length}/${candidates.length} ${isrc} ${cache[isrc].recordings.map((r) => `${r.title} ${r.firstRelease}`).join("; ") || "NO RECORDING"}`,
    );
  } catch (e) {
    console.error(`${isrc}: ${e.message}`);
  }
}
