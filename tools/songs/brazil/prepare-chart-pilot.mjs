// Offline, repeatable inventory. Raw cache claims are explicitly unverified.
import { join } from "node:path";
import { CACHE_DIR, OUT_DIR, readJson, writeJson } from "../lib.mjs";
import { chartObservations, candidateQueue } from "./chart-evidence.mjs";
const songs = await readJson(join(OUT_DIR, "songs-br.json"));
const observations = chartObservations(
  await readJson(join(CACHE_DIR, "br", "charts.json"), { pages: {} }),
);
const seeds = await readJson(
  new URL("./chart-seeds-1964.json", import.meta.url),
);
const historical = seeds.rows.map((row) => ({
  title: row.rawTitle,
  artist: row.rawArtist,
  year: null,
  deezerId: null,
  state: "needs_transcription_nationality_release_and_recording_review",
  observations: [
    {
      chart: seeds.source.chartTitle,
      chartYear: row.chartYear,
      position: row.position,
      periodType: seeds.source.period,
      territory: seeds.source.territoryAsPrinted,
      publicationDate: seeds.source.publicationDate,
      printedPage: seeds.source.printedPage,
      sourceUrl: seeds.source.sourceUrl,
      verification: seeds.source.visualVerification
        ? "scan-verified"
        : "provisional-index-transcription",
      rawTitle: row.rawTitle,
      rawArtist: row.rawArtist,
    },
  ],
}));
const additional = await readJson(
  new URL("./chart-seeds-historical.json", import.meta.url),
  [],
);
for (const row of additional) {
  if (row.needsReview) continue;
  historical.push({
    title: row.rawTitle,
    artist: row.rawArtist,
    year: null,
    deezerId: null,
    state: "needs_nationality_release_and_recording_review",
    observations: [
      {
        ...row,
        chart: row.chartTitle,
        periodType: row.period,
        verification: row.visualVerification
          ? "scan-verified"
          : "provisional-index-transcription",
      },
    ],
  });
}
const seen = new Map();
for (const candidate of [
  ...historical,
  ...candidateQueue(songs, observations),
]) {
  const key = `${candidate.artist}|${candidate.title}`;
  if (seen.has(key)) seen.get(key).observations.push(...candidate.observations);
  else seen.set(key, candidate);
}
const queue = [...seen.values()];
await writeJson(join(OUT_DIR, "chart-pilot-br.json"), {
  generatedAt: new Date().toISOString(),
  observations,
  candidates: queue,
});
console.log(
  `${observations.length} legacy observations; ${queue.length} missing-audio chart candidates. No ranks or recordings promoted to verified.`,
);
