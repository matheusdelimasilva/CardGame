// Validate the built dataset and print reproducible counts plus 15 sample rows.
// Usage (repo root): node tools/songs/brazil/verify-songs-br.mjs
import assert from "node:assert/strict";
import { join } from "node:path";
import { OUT_DIR, readJson } from "../lib.mjs";
import { norm } from "../normalize.mjs";

const songs = await readJson(join(OUT_DIR, "songs-br.json"));
assert.ok(Array.isArray(songs) && songs.length > 0, "Expected a nonempty song array");
const seen = new Set();
for (const [i, s] of songs.entries()) {
  assert.ok(typeof s.title === "string" && s.title.trim(), `Missing title at ${i}`);
  assert.ok(typeof s.artist === "string" && s.artist.trim(), `Missing artist at ${i}`);
  assert.ok(Number.isInteger(s.year), `Invalid year at ${i}`);
  assert.ok(s.deezerId === null || (Number.isSafeInteger(s.deezerId) && s.deezerId > 0), `Invalid Deezer id at ${i}`);
  const key = `${norm(s.title)}|${norm(s.artist)}`;
  assert.ok(!seen.has(key), `Duplicate title/artist: ${s.artist} — ${s.title}`);
  seen.add(key);
}
const counts = (key) => Object.fromEntries(
  [...songs.reduce((m, s) => m.set(key(s), (m.get(key(s)) ?? 0) + 1), new Map())]
    .sort(([a], [b]) => String(a).localeCompare(String(b))),
);
// One row per decade, then fill to 15 using evenly spaced years (not row indices,
// which would overrepresent the chart-heavy 2000s and 2020s).
const samples = new Map();
for (const s of songs) {
  const decade = Math.floor(s.year / 10) * 10;
  if (![...samples.values()].some((x) => Math.floor(x.year / 10) * 10 === decade)) samples.set(`${s.title}|${s.artist}`, s);
}
const min = Math.min(...songs.map((s) => s.year));
const max = Math.max(...songs.map((s) => s.year));
const latest = songs.filter((s) => s.year === max).at(-1);
samples.set(`${latest.title}|${latest.artist}`, latest);
const extra = Math.min(15, songs.length) - samples.size;
for (let i = 0; i < extra; i++) {
  const target = min + (max - min) * (i + 1) / (extra + 1);
  const s = songs.filter((s) => !samples.has(`${s.title}|${s.artist}`))
    .sort((a, b) => Math.abs(a.year - target) - Math.abs(b.year - target))[0];
  if (s) samples.set(`${s.title}|${s.artist}`, s);
}
console.log(JSON.stringify({
  songs: songs.length,
  deezerMatched: songs.filter((s) => s.deezerId !== null).length,
  perDecade: counts((s) => `${Math.floor(s.year / 10) * 10}s`),
  perYearSource: counts((s) => s.yearSource),
  perSource: counts((s) => s.source),
  samples: [...samples.values()].sort((a, b) => a.year - b.year),
}, null, 2));
