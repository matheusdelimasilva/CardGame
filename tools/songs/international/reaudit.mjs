// Reapply stricter metadata gates to all saved acceptances before export.
import { readFile, writeFile } from "node:fs/promises";
import { verifyRecording } from "./verify.mjs";
const root = new URL("../", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const save = async (p, v) =>
  writeFile(new URL(p, root), JSON.stringify(v, null, 2) + "\n");
const accepted = await read("international/accepted.json");
const decisions = await read(".cache/international/decisions.json");
let removed = 0;
for (const [key, e] of Object.entries(accepted)) {
  const reason = verifyRecording(
    e,
    {
      title: e.trackTitle,
      artist: { name: e.trackArtist },
      isrc: e.isrc,
      preview: "checked",
      duration: e.trackDuration,
      release_date: e.deezerReleaseDate,
      album: { title: e.albumTitle },
    },
    {
      title: e.recordingTitle,
      "artist-credit": e.recordingCredit,
      isrcs: [e.isrc],
      length: e.recordingLengthMs,
      disambiguation: e.recordingDisambiguation ?? "",
      "first-release-date": e.originalReleaseDate,
    },
  );
  if (reason) {
    decisions[key] = {
      status: "needs-review",
      deezerId: e.deezerId,
      checkedAt: new Date().toISOString(),
      reasons: [reason],
      previousEvidence: e,
    };
    delete accepted[key];
    removed++;
    console.log("HELD", key, reason);
  } else e.ruleVersion = 2;
}
await save("international/accepted.json", accepted);
await save(".cache/international/decisions.json", decisions);
console.log({ removed, retained: Object.keys(accepted).length });
