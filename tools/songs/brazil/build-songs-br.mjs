// Step 3 (Brazil): merge every source with the MusicBrainz lookups and write the
// dataset in the same shape as out/songs.json (plus a `source` field).
// Usage: node build-songs-br.mjs
// Output: ../out/songs-br.json
import { join } from "node:path";
import { norm as deezerNorm } from "../../../packages/server/src/deezer.ts";
import { CACHE_DIR, OUT_DIR, ROOT, readJson, writeJson } from "../lib.mjs";
import { norm } from "../normalize.mjs";
import { allSongs, primaryArtistBr, songKey } from "./sources-br.mjs";

const MIN_SCORE = 80;
const MAX_YEARS_BEFORE_CHART = 1; // same window as the US build

const mb = await readJson(join(CACHE_DIR, "br", "musicbrainz.json"), {});
// Shared with the US pipeline: `node ../fetch-deezer.mjs --file songs-br.json` fills it.
const deezer = await readJson(join(CACHE_DIR, "deezer.json"), {});
const deezerOverrides = await readJson(join(ROOT, "deezer-overrides.json"), {});
const yearOf = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

function mbMatches(song) {
  const want = norm(primaryArtistBr(song.artist));
  return (mb[songKey(song)] ?? [])
    .filter((c) => (c.score ?? 0) >= MIN_SCORE && norm(c.title) === norm(song.title))
    .filter((c) => !want || norm(c.artist).includes(want))
    .map((c) => ({ ...c, year: yearOf(c.firstRelease) }))
    .filter((c) => c.year)
    .sort((a, b) => a.year - b.year || b.score - a.score);
}

function resolve(song) {
  const cands = mbMatches(song);
  if (song.year) {
    // Release year already known (Wikipedia category / curated); MusicBrainz only adds the id.
    const hit = cands.find((c) => Math.abs(c.year - song.year) <= 1);
    return { year: song.year, yearSource: song.source === "curated" ? "curated" : "wikipedia", mbid: hit?.id ?? null };
  }
  const hit = cands.find((c) => c.year <= song.chartYear && c.year >= song.chartYear - MAX_YEARS_BEFORE_CHART);
  return hit
    ? { year: hit.year, yearSource: "musicbrainz", mbid: hit.id }
    : { year: song.chartYear, yearSource: "chart-year", mbid: null };
}

const KNOWN_YEAR = new Set(["wikipedia", "curated"]);
const merged = new Map();
for (const song of await allSongs()) {
  const r = { ...song, ...resolve(song) };
  const key = songKey(song);
  const prev = merged.get(key);
  if (!prev) { merged.set(key, r); continue; }
  // Keep the best chart info (earliest chart year, then best rank)...
  const chartOf = (x) => (x.chartYear ? [x.chartYear, x.rank ?? 999] : [9999, 999]);
  const [a, b] = [chartOf(prev), chartOf(r)];
  const chartBest = b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? r : prev;
  // ...and the most trustworthy release year: a known one, else the earliest found.
  const yearBest = KNOWN_YEAR.has(prev.yearSource) ? prev
    : KNOWN_YEAR.has(r.yearSource) ? r
    : r.year < prev.year ? r : prev;
  merged.set(key, {
    ...chartBest,
    year: yearBest.year,
    yearSource: yearBest.yearSource,
    mbid: yearBest.mbid ?? chartBest.mbid ?? null,
    artist: chartBest.artist || yearBest.artist,
  });
}

// A page with no artist is the same song as a same-titled entry within a year that has one.
const withArtist = [...merged.values()].filter((s) => s.artist);
for (const [key, s] of merged) {
  if (s.artist) continue;
  const twin = withArtist.find((o) => norm(o.title) === norm(s.title) && Math.abs(o.year - s.year) <= 1);
  if (twin) {
    twin.mbid ??= s.mbid;
    merged.delete(key);
  }
}

const final = [...merged.values()]
  .map((s) => {
    const label = `${s.artist} — ${s.title}`;
    const deezerId = label in deezerOverrides ? deezerOverrides[label]
      : deezer[`${deezerNorm(s.artist)}|${deezerNorm(s.title)}`]?.id ?? null;
    return {
      title: s.title,
      artist: s.artist,
      year: s.year,
      yearSource: s.yearSource,
      chartYear: s.chartYear ?? null,
      chartRank: s.rank ?? null,
      mbid: s.mbid,
      deezerId,
      source: s.source,
      drop: label in deezerOverrides && deezerId === null,
    };
  })
  .filter((s) => !s.drop)
  .map(({ drop, ...s }) => s)
  .sort((a, b) => a.year - b.year || (a.chartRank ?? 999) - (b.chartRank ?? 999) || a.title.localeCompare(b.title, "pt"));

await writeJson(join(OUT_DIR, "songs-br.json"), final);

const perYear = {};
for (const s of final) perYear[s.year] = (perYear[s.year] ?? 0) + 1;
const years = Object.keys(perYear).map(Number);
const missing = [];
for (let y = 1917; y <= Math.max(...years); y++) if (!perYear[y]) missing.push(y);
const count = (k) => Object.entries(final.reduce((m, s) => ((m[s[k]] = (m[s[k]] ?? 0) + 1), m), {}));
console.log(`songs: ${final.length}`);
console.log("by yearSource:", Object.fromEntries(count("yearSource")));
console.log("by source:", Object.fromEntries(count("source")));
console.log("per year:", Object.entries(perYear).map(([y, n]) => `${y}:${n}`).join(" "));
console.log("years since 1917 with no song:", missing.join(", ") || "none");
