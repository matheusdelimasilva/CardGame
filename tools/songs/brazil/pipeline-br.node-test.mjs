// Offline integration checks. Run: node --test tools/songs/brazil/pipeline-br.node-test.mjs
// The Deezer CLI, like the real lookup, requires Node with native TS support.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { plain } from "./wikitext.mjs";

test("wikitext strips whole-title quotes while preserving quoted words", () => {
  assert.equal(plain('"[[Song]]"'), "Song");
  assert.equal(plain('"[[P]]" da Vida'), '"P" da Vida');
  assert.equal(plain("“[[Oretachi]]” no Theme"), "“Oretachi” no Theme");
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "songs-br-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const songsDir = join(root, "tools/songs");
  for (const file of [
    "lib.mjs",
    "normalize.mjs",
    "fetch-deezer.mjs",
    "brazil/build-songs-br.mjs",
    "brazil/sources-br.mjs",
    "brazil/curated-br.mjs",
  ]) {
    const target = join(songsDir, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(new URL(`../${file}`, import.meta.url), target);
  }
  const json = async (file, data) => {
    await mkdir(dirname(join(songsDir, file)), { recursive: true });
    await writeFile(join(songsDir, file), JSON.stringify(data));
  };
  const read = async (file) =>
    JSON.parse(await readFile(join(songsDir, file), "utf8"));
  const run = (file, ...args) =>
    execFileSync(process.execPath, [join(songsDir, file), ...args], {
      encoding: "utf8",
    });
  return { root, songsDir, json, read, run };
}

test("Brazil build merges verified years and Deezer IDs, preserves live hits, and omits unknown performers", async (t) => {
  const f = await fixture(t);
  await f.json(".cache/br/charts.json", {
    pages: {
      example: {
        rows: [
          {
            title: "Jura",
            artist: "Mário Reis",
            chartYear: 1930,
            rank: 5,
            chart: "fixture-chart",
          },
          {
            title: "Gosta de Rua",
            artist: "Felipe e Rodrigo",
            chartYear: 2024,
            rank: 1,
            chart: "fixture-chart",
          },
          {
            title: "Guest fixture",
            artist: "Ivete Sangalo",
            chartYear: 2005,
            rank: 2,
            chart: "fixture-chart",
          },
        ],
      },
    },
  });
  await f.json(".cache/br/categories.json", {
    years: {
      1929: {
        songs: [
          {
            title: "Jura",
            artist: "Mário Reis",
            year: 1929,
            cats: ["Canções do Brasil"],
            page: "Jura (canção)",
          },
          {
            title: "No Performer",
            artist: "",
            year: 1929,
            cats: ["Canções do Brasil"],
          },
          {
            title: "A Minha Casinha",
            artist: "Milú",
            year: 1943,
            cats: ["Canções em português"],
            lead: "Uma canção portuguesa",
          },
          {
            title: "Example - Version",
            artist: "The Test Artist - Credit",
            year: 1929,
            cats: ["Canções do Brasil"],
          },
          {
            title: "Guest fixture",
            artist: "Ivete Sangalo participação Gilberto Gil",
            year: 2004,
            cats: ["Canções do Brasil"],
          },
        ],
      },
    },
  });
  await f.json(".cache/br/deezer.json", {
    "mario reis|jura": { id: 123, title: "Jura", artist: "Mário Reis" },
    "test artist|example": { id: 456, title: "Example", artist: "Test Artist" },
  });
  assert.match(f.run("brazil/build-songs-br.mjs"), /Deezer matched: 2\//);
  const songs = await f.read("out/songs-br.json");
  assert.equal(songs.filter((s) => s.title === "Jura").length, 1);
  const jura = songs.find((s) => s.title === "Jura");
  assert.equal(jura.year, 1928);
  assert.equal(jura.yearSource, "curated");
  assert.equal(jura.chartRank, 5);
  assert.equal(jura.deezerId, 123);
  assert.equal(
    songs.find((s) => s.title === "Example - Version").deezerId,
    456,
  );
  const live = songs.filter((s) => s.title.startsWith("Gosta de Rua"));
  assert.equal(live.length, 1);
  assert.equal(live[0].title, "Gosta de Rua (Ao Vivo)");
  assert.equal(live[0].artist, "Felipe & Rodrigo");
  assert.equal(live[0].deezerId, null);
  assert.equal(songs.filter((s) => s.title === "Guest fixture").length, 1);
  assert.ok(songs.every((s) => s.artist && s.title !== "A Minha Casinha"));
});

test("Deezer CLI isolates Brazil paths and top-ranked filtering while preserving US behavior", async (t) => {
  const f = await fixture(t);
  const serverDir = join(f.root, "packages/server/src");
  await mkdir(serverDir, { recursive: true });
  // Execute the actual CLI offline, with a deterministic matcher at its public seam.
  await writeFile(
    join(serverDir, "deezer.ts"),
    `export const norm = s => s.toLowerCase();
export class Deezer { async findTrack(s) { return { id: s.chartRank ?? 99, title: s.title, artist: s.artist }; } }`,
  );
  const songs = [
    { title: "Ranked", artist: "A", chartRank: 1 },
    { title: "Unranked", artist: "B", chartRank: null },
    { title: "Below", artist: "C", chartRank: 6 },
  ];
  for (const file of ["songs.json", "songs-br.json"])
    await f.json(`out/${file}`, songs);
  f.run("fetch-deezer.mjs", "--br", "--top", "5");
  assert.equal(Object.keys(await f.read(".cache/br/deezer.json")).length, 1);
  assert.match(
    await readFile(join(f.songsDir, "out/deezer-review-br.txt"), "utf8"),
    /1 matched, 0 missing/,
  );
  f.run("fetch-deezer.mjs", "--br");
  assert.equal(Object.keys(await f.read(".cache/br/deezer.json")).length, 3);
  f.run("fetch-deezer.mjs", "--top", "5");
  assert.equal(Object.keys(await f.read(".cache/deezer.json")).length, 2);
  assert.match(
    await readFile(join(f.songsDir, "out/deezer-review.txt"), "utf8"),
    /2 matched, 0 missing/,
  );
});
