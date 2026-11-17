// Offline audit and report. Run after expand.mjs --apply.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { keyOf, verifyRecording } from "./verify.mjs";
import { applyAccepted } from "./apply.mjs";
import { renderReport } from "./render-report.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (p) => JSON.parse(await readFile(resolve(root, p), "utf8"));
const save = async (p, v) =>
  writeFile(resolve(root, p), JSON.stringify(v, null, 2) + "\n");
const counts = (rows) =>
  Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => 1940 + i * 10).map((y) => [
      y,
      rows.filter(
        (s) => Math.floor(s.year / 10) * 10 === y && s.deezerId !== null,
      ).length,
    ]),
  );
const keyHash = (rows) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        rows.map(({ title, artist, year, chartYear, chartRank }) => ({
          title,
          artist,
          year,
          chartYear,
          chartRank,
        })),
      ),
    )
    .digest("hex");
let baseline;
try {
  baseline = await read("international/baseline.json");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  const original = await read(".cache/international/baseline.json");
  baseline = {
    rows: original.length,
    keyHash: keyHash(original),
    ids: Object.fromEntries(
      original
        .filter((s) => s.deezerId !== null)
        .map((s) => [keyOf(s), s.deezerId]),
    ),
    byDecade: counts(original),
    byYear: Object.fromEntries(
      Array.from({ length: 77 }, (_, i) => 1949 + i).map((y) => [
        y,
        original.filter((s) => s.year === y && s.deezerId !== null).length,
      ]),
    ),
  };
  await save("international/baseline.json", baseline);
}
const songs = await read("out/songs.json");
const evidence = await read("international/accepted.json");
assert.equal(songs.length, baseline.rows, "row count changed");
assert.equal(
  keyHash(songs),
  baseline.keyHash,
  "existing keys, years, chart metadata or order changed",
);
const ids = new Set(),
  recordings = new Set(),
  isrcs = new Set(),
  additions = [];
for (const song of songs) {
  const key = keyOf(song);
  if (baseline.ids[key]) {
    assert.equal(song.deezerId, baseline.ids[key], "legacy ID changed");
    continue;
  }
  if (song.deezerId === null) continue;
  const e = evidence[key];
  assert.ok(e, `missing evidence ${key}`);
  assert.equal(song.deezerId, e.deezerId);
  assert.equal(song.year, e.year);
  assert.equal(song.mbid, e.recordingMbid);
  assert.equal(
    verifyRecording(
      song,
      {
        title: e.trackTitle,
        artist: { name: e.trackArtist },
        isrc: e.isrc,
        preview: "verified",
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
    ),
    null,
    `identity check ${key}`,
  );
  assert.ok(!ids.has(e.deezerId));
  assert.ok(!recordings.has(e.recordingMbid));
  assert.ok(!isrcs.has(e.isrc));
  assert.ok(!Object.values(baseline.ids).includes(e.deezerId));
  assert.ok(Number.isSafeInteger(e.deezerId) && e.deezerId > 0);
  assert.ok(
    e.previewCheck.bytes >= 1024 &&
      /^audio\//.test(e.previewCheck.contentType) &&
      [200, 206].includes(e.previewCheck.status),
  );
  ids.add(e.deezerId);
  recordings.add(e.recordingMbid);
  isrcs.add(e.isrc);
  additions.push(e);
}
assert.equal(
  additions.length,
  Object.keys(evidence).length,
  "accepted evidence not fully applied",
);
assert.deepEqual(
  applyAccepted(songs, evidence),
  songs,
  "offline application is not idempotent",
);
const after = counts(songs);
const byYear = Object.fromEntries(
  Array.from({ length: 77 }, (_, i) => 1949 + i).map((y) => [
    y,
    songs.filter((s) => s.year === y && s.deezerId !== null).length,
  ]),
);
const deficits = Object.entries(byYear)
  .filter(([y, n]) => Number(y) >= 1950 && n < 15)
  .map(([year, n]) => ({ year: Number(year), withIds: n, deficit: 15 - n }));
let decisions = {};
try {
  decisions = await read(".cache/international/decisions.json");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const review = Object.entries(decisions)
  .filter(([, v]) => v.status === "needs-review")
  .map(([song, v]) => ({ song, ...v }));
const reasons = {};
for (const r of review)
  for (const reason of r.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
const summary = {
  generatedAt: new Date().toISOString(),
  catalogRows: songs.length,
  baselineWithIds: Object.keys(baseline.ids).length,
  addedPlayable: additions.length,
  afterWithIds: Object.keys(baseline.ids).length + additions.length,
  newCatalogTitles: 0,
  baselineByDecade: baseline.byDecade,
  afterByDecade: after,
  byYear,
  yearsAtTarget: 76 - deficits.length,
  remainingDeficit: deficits.reduce((n, d) => n + d.deficit, 0),
  deficits,
  reviewCandidates: review.length,
  reviewReasons: reasons,
  checkedPreviews: additions.length,
  previewCheckFirst: additions.map((e) => e.previewCheckedAt).sort()[0],
  previewCheckLast: additions
    .map((e) => e.previewCheckedAt)
    .sort()
    .at(-1),
  validation: "passed",
};
await save("out/international-expansion-summary.json", summary);
await save("international/review.json", review);
let md = `# International catalog expansion results\n\nExecuted after authorization on 2026-11-15 (America/New_York).\n\n**${summary.addedPlayable} additional playable songs**, growing the ID-backed game pool from **${summary.baselineWithIds} to ${summary.afterWithIds}**. These are existing chart rows newly enabled for playback; **0 newly discovered catalog titles**. The catalog retains all ${songs.length.toLocaleString("en-US")} rows and their original title, artist, release-year and chart fields in the same order. Original nonnull audio IDs remain unchanged.\n\n| Decade | Before | After | Added |\n| --- | ---: | ---: | ---: |\n`;
for (const [d, n] of Object.entries(after))
  md += `| ${d}s | ${baseline.byDecade[d]} | ${n} | +${n - baseline.byDecade[d]} |\n`;
md += `\nThe 1940s consist of 1949 only; the 2020s cover 2020–2025. **${summary.yearsAtTarget}/76 target years** reach 15 ID-backed tracks. Remaining deficit: **${summary.remainingDeficit}**. Decade totals include the 357 legacy IDs, whose previews were not rechecked in this campaign.\n\nEvery new addition has matching Deezer/MusicBrainz ISRC evidence, compatible title/version, full MusicBrainz artist credit, original year matching the card year, duration within five seconds, and a successfully fetched audio preview. This validates metadata and audio delivery; no claim is made that a human listened to every track. Preview checks ran between ${summary.previewCheckFirst} and ${summary.previewCheckLast} (UTC) and availability can change. Evidence: tools/songs/international/accepted.json.\n\n## Review queue\n\n${review.length} candidates need review. Reasons can overlap:\n\n`;
for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]))
  md += `- ${r}: ${n}\n`;
md +=
  "\nThese candidates were not accepted automatically. A missing ISRC or mismatched date does not prove the song cannot be added; it requires better recording/release evidence. The committed review manifest permits a follow-up without repeating discovery.\n\n## Remaining year gaps\n\n";
md += deficits.length
  ? deficits.map((d) => `${d.year}: ${d.withIds}/15`).join(", ") + ".\n"
  : "None in 1950–2025.\n";
md +=
  "\n## Validation and reproducibility\n\nOffline audit passed: original keys, years, chart metadata, order and legacy IDs preserved; new IDs, recording MBIDs and ISRCs unique within the accepted batch; each new ID backed by accepted evidence; metadata identity gates rerun; successful preview response evidence checked; offline application idempotent. Identity tests cover wrong versions, artists, dates, ISRCs, duration and malformed audio, plus stale/duplicate offline imports.\n\nRun `node --test tools/songs/international/*.node-test.mjs` and `node tools/songs/international/report.mjs`. Resume discovery with `node tools/songs/international/expand.mjs --limit 200 --target 15 --apply`. Network cache is ignored; accepted evidence is checked in and reused by the catalog builder. The report audit itself is offline.\n\nSee [implementation plan](../../../docs/international-song-expansion-plan.md) and [source research](../../../docs/international-song-source-research.md). The next phase is better evidence for deficient historical years, followed by chart-backed discovery outside the existing US year-end pool. Exact equal-decade gameplay probability would require a separate sampling change.\n";
await writeFile(resolve(root, "out/international-expansion-report.md"), md);
const artifactDir = resolve(root, "../../.lavish");
await mkdir(artifactDir, { recursive: true });
const plan = await readFile(
  resolve(root, "../../docs/international-song-expansion-plan.md"),
  "utf8",
);
const research = await readFile(
  resolve(root, "../../docs/international-song-source-research.md"),
  "utf8",
);
await writeFile(
  resolve(artifactDir, "international-song-expansion.html"),
  renderReport(summary, additions, plan, research),
);
console.log(JSON.stringify(summary, null, 2));
