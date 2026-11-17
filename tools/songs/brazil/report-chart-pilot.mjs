import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { CACHE_DIR, OUT_DIR, readJson } from "../lib.mjs";
const input = await readJson(join(OUT_DIR, "chart-pilot-br.json"));
const matches = Object.values(
  await readJson(join(CACHE_DIR, "br", "chart-pilot-matches.json"), {}),
);
const review = Object.values(
  await readJson(join(CACHE_DIR, "br", "chart-pilot-review.json"), {}),
);
const audio = [
  ...matches.filter((x) => x.preview?.ok),
  ...review.filter((x) => x.preview?.ok),
];
const counts = {
  candidates: input.candidates.length,
  strictProcessed: matches.length,
  strictMatches: matches.filter((x) => x.metadata).length,
  alternateProcessed: review.length,
  audioCandidates: audio.length,
  liveAudioCandidates: audio.filter((x) =>
    /ao vivo|live/i.test(x.metadata.title),
  ).length,
};
const lines = [
  `# Brazilian chart pilot results`,
  ``,
  `Generated ${new Date().toISOString()}. This is an evidence queue, not accepted catalog additions.`,
  ``,
  ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`),
  ``,
  `## Interpretation`,
  ``,
  `The recovery cohort consists of previously unmatched songs, so its strict success rate is not representative of fresh chart discovery. Candidate counts include foreign performers appearing in Brazilian charts. No nationality or original-year approval is inferred. Working alternate previews may be live, remixed or later recordings and are not automatically eligible.`,
  ``,
  `The input includes 749 legacy chart observations and 25 provisional Cash Box annual-1964 rows. Legacy observations need underlying-source checks. Cash Box transcription needs scan verification: direct PDF retrieval was blocked. No chart rank has been upgraded to verified.`,
  ``,
  `## Preview candidates requiring version/release review`,
  ``,
  `| Candidate | Deezer version | Album | Deezer ID |`,
  `| --- | --- | --- | --- |`,
  ...audio.map(
    (x) =>
      `| ${`${x.song.artist} — ${x.song.title}`.replaceAll("|", "/")} | ${x.metadata.title.replaceAll("|", "/")} | ${x.metadata.album.replaceAll("|", "/")} | ${x.metadata.id} |`,
  ),
  ``,
  `No songs were added to songs-br.json by these scripts. Source inventory: docs/song-chart-source-inventory.md. Re-run prepare, match, review and report commands to refresh the resumable pilot.`,
];
await writeFile(
  join(OUT_DIR, "chart-pilot-br-report.md"),
  lines.join("\n") + "\n",
);
console.log(counts);
