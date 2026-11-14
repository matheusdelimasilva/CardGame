// Step 3: merge the Billboard year-end lists with MusicBrainz first-release
// dates and write the final dataset. Pure local processing (no network).
// Usage: node build-songs.mjs
// Output: out/songs.json, out/songs.min.json
import { join } from "node:path";
import { CACHE_DIR, OUT_DIR, readJson, writeJson } from "./lib.mjs";
import { norm, primaryArtist, stripThe } from "./normalize.mjs";

const MIN_SCORE = 80;
// A hit's original release is normally the chart year or the year before.
// Allow a little slack; anything earlier is probably a different recording.
const MAX_YEARS_BEFORE_CHART = 2;

const billboard = await readJson(join(CACHE_DIR, "billboard.json"));
const mb = await readJson(join(CACHE_DIR, "musicbrainz.json"), {});

const yearOf = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

function matches(song, c) {
  if ((c.score ?? 0) < MIN_SCORE) return false;
  if (norm(c.title) !== norm(song.title)) return false;
  const want = stripThe(norm(primaryArtist(song.artist)));
  const got = stripThe(norm(c.artist));
  return want.length > 0 && got.includes(want);
}

const songs = [];
const stats = { musicbrainz: 0, chartYear: 0, noLookup: 0 };
for (const { rows } of Object.values(billboard.years)) {
  for (const row of rows) {
    const candidates = mb[`${row.chartYear}|${row.rank}`];
    let releaseYear = row.chartYear;
    let yearSource = "chart-year";
    let mbid = null;
    if (!candidates) {
      stats.noLookup++;
    } else {
      const good = candidates
        .filter((c) => matches(row, c))
        .map((c) => ({ ...c, year: yearOf(c.firstRelease) }))
        .filter((c) => c.year && c.year <= row.chartYear && c.year >= row.chartYear - MAX_YEARS_BEFORE_CHART)
        .sort((a, b) => a.year - b.year || b.score - a.score);
      if (good.length) {
        releaseYear = good[0].year;
        yearSource = "musicbrainz";
        mbid = good[0].id;
        stats.musicbrainz++;
      } else {
        stats.chartYear++;
      }
    }
    songs.push({
      title: row.title,
      artist: row.artist,
      year: releaseYear,
      yearSource,
      chartYear: row.chartYear,
      chartRank: row.rank,
      mbid,
    });
  }
}

// A song that charted in two consecutive year-end lists appears once, under its release year.
const seen = new Map();
for (const s of songs) {
  const key = `${norm(s.title)}|${norm(s.artist)}`;
  const prev = seen.get(key);
  if (!prev || s.chartRank < prev.chartRank) seen.set(key, s);
}
const final = [...seen.values()].sort((a, b) => a.year - b.year || a.chartRank - b.chartRank);

await writeJson(join(OUT_DIR, "songs.json"), final);
console.log(`songs: ${final.length} (deduped from ${songs.length})`);
console.log(stats);
const perYear = {};
for (const s of final) perYear[s.year] = (perYear[s.year] ?? 0) + 1;
console.log("per release year:", Object.entries(perYear).map(([y, n]) => `${y}:${n}`).join(" "));
