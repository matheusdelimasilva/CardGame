// Step 3 (Brazil): merge every source with the MusicBrainz lookups and write the
// dataset in the same shape as out/songs.json (plus a `source` field).
// Usage: node build-songs-br.mjs
// Output: ../out/songs-br.json
import { join } from "node:path";
import { CACHE_DIR, OUT_DIR, readJson, writeJson } from "../lib.mjs";
import { norm } from "../normalize.mjs";
import { allSongs, primaryArtistBr, songKey } from "./sources-br.mjs";
import { VERIFIED_ADDITIONS } from "./verified-additions.mjs";

const MIN_SCORE = 80;
const MAX_YEARS_BEFORE_CHART = 2;

const mb = await readJson(join(CACHE_DIR, "br", "musicbrainz.json"), {});
const deezer = await readJson(join(CACHE_DIR, "br", "deezer.json"), {});
// Match the server's Deezer cache normalisation without requiring TS support to build.
const deezerNorm = (s) =>
  norm(s.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+-\s+.*$/, "")).replace(
    /^the /,
    "",
  );
const accepted = await readJson(
  new URL("./accepted-chart-songs.json", import.meta.url),
  [],
);
const verifiedIds = new Map(
  [...VERIFIED_ADDITIONS, ...accepted].map((s) => [songKey(s), s.deezerId]),
);
const yearOf = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

function mbMatches(song) {
  const want = norm(primaryArtistBr(song.artist));
  return (mb[songKey(song)] ?? [])
    .filter(
      (c) => (c.score ?? 0) >= MIN_SCORE && norm(c.title) === norm(song.title),
    )
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
    return {
      year: song.year,
      yearSource:
        song.yearSource ??
        (song.source === "curated" ? "curated" : "wikipedia"),
      mbid: song.mbid ?? hit?.id ?? null,
    };
  }
  const hit = cands.find(
    (c) =>
      c.year <= song.chartYear &&
      c.year >= song.chartYear - MAX_YEARS_BEFORE_CHART,
  );
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
  if (!prev) {
    merged.set(key, r);
    continue;
  }
  // Keep the best chart info (earliest chart year, then best rank)...
  const chartOf = (x) =>
    x.chartYear ? [x.chartYear, x.rank ?? 999] : [9999, 999];
  const [a, b] = [chartOf(prev), chartOf(r)];
  const chartBest = b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]) ? r : prev;
  // Explicit curated release years override inferred Wikipedia category years
  // (e.g. Jura is categorised as 1929, but Mário Reis released it in 1928).
  const yearBest =
    prev.yearSource === "curated"
      ? prev
      : r.yearSource === "curated"
        ? r
        : KNOWN_YEAR.has(prev.yearSource)
          ? prev
          : KNOWN_YEAR.has(r.yearSource)
            ? r
            : r.year < prev.year
              ? r
              : prev;
  merged.set(key, {
    ...chartBest,
    year: yearBest.year,
    yearSource: yearBest.yearSource,
    mbid: yearBest.mbid ?? chartBest.mbid ?? null,
    artist: chartBest.artist || yearBest.artist,
  });
}

const final = [...merged.values()]
  .map((s) => ({
    title: s.title,
    artist: s.artist,
    year: s.year,
    yearSource: s.yearSource,
    chartYear: s.chartYear ?? null,
    chartRank: s.rank ?? null,
    mbid: s.mbid,
    deezerId:
      verifiedIds.get(songKey(s)) ??
      deezer[`${deezerNorm(s.artist)}|${deezerNorm(s.title)}`]?.id ??
      null,
    source: s.source,
  }))
  .sort(
    (a, b) =>
      a.year - b.year ||
      (a.chartRank ?? 999) - (b.chartRank ?? 999) ||
      a.title.localeCompare(b.title, "pt"),
  );

await writeJson(join(OUT_DIR, "songs-br.json"), final);

const perYear = {};
for (const s of final) perYear[s.year] = (perYear[s.year] ?? 0) + 1;
const years = Object.keys(perYear).map(Number);
const missing = [];
for (let y = 1917; y <= Math.max(...years); y++)
  if (!perYear[y]) missing.push(y);
const count = (k) =>
  Object.entries(
    final.reduce((m, s) => ((m[s[k]] = (m[s[k]] ?? 0) + 1), m), {}),
  );
console.log(`songs: ${final.length}`);
console.log(
  `Deezer matched: ${final.filter((s) => s.deezerId != null).length}/${final.length}`,
);
console.log("by yearSource:", Object.fromEntries(count("yearSource")));
console.log("by source:", Object.fromEntries(count("source")));
console.log(
  "per year:",
  Object.entries(perYear)
    .map(([y, n]) => `${y}:${n}`)
    .join(" "),
);
console.log("years since 1917 with no song:", missing.join(", ") || "none");
