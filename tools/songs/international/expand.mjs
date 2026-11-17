// Resumable, conservative recovery of existing international chart entries.
// node tools/songs/international/expand.mjs --limit 200 --target 15 [--apply]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Deezer } from "../../../packages/server/src/deezer.ts";
import { keyOf, verifyRecording, isAudio } from "./verify.mjs";
import { applyAccepted } from "./apply.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = resolve(root, ".cache/international");
const evidencePath = resolve(root, "international/accepted.json");
const catalogPath = resolve(root, "out/songs.json");
const arg = (k, fallback) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
};
const limit = arg("--limit", 200),
  target = arg("--target", 15);
if (![limit, target].every((n) => Number.isSafeInteger(n) && n > 0))
  throw new Error("Positive integer --limit and --target required");
const read = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
};
let writes = Promise.resolve();
const save = (p, value) => {
  const text = JSON.stringify(value, null, 2) + "\n";
  writes = writes.then(async () => {
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, text);
  });
  return writes;
};
const songs = await read(catalogPath);
const baselinePath = resolve(cacheDir, "baseline.json");
if (!(await read(baselinePath))) await save(baselinePath, songs);
const accepted = await read(evidencePath, {});
const decisions = await read(resolve(cacheDir, "decisions.json"), {});
const counts = new Map();
const usedIds = new Set();
const usedRecordings = new Set();
const usedIsrcs = new Set();
for (const s of songs)
  if (s.deezerId !== null) {
    counts.set(s.year, (counts.get(s.year) ?? 0) + 1);
    usedIds.add(s.deezerId);
    if (s.mbid) usedRecordings.add(s.mbid);
  }
for (const s of songs)
  if (s.deezerId === null && accepted[keyOf(s)]) {
    counts.set(s.year, (counts.get(s.year) ?? 0) + 1);
    usedIds.add(accepted[keyOf(s)].deezerId);
  }
for (const e of Object.values(accepted)) {
  usedRecordings.add(e.recordingMbid);
  usedIsrcs.add(e.isrc);
}
let last = new Map();
async function request(url, raw = false) {
  const host = new URL(url).host;
  const gap = host === "musicbrainz.org" ? 1150 : 180;
  for (let attempt = 0; attempt < 5; attempt++) {
    const due = Math.max((last.get(host) ?? 0) + gap, Date.now());
    last.set(host, due);
    const wait = due - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "CardGameSongData/1.0 (noncommercial music timeline catalog research)",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      await new Promise((r) =>
        setTimeout(r, Math.min(15000, 1500 * 2 ** attempt)),
      );
      continue;
    }
    if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`);
    if (raw) return res;
    const data = await res.json();
    if (data.error) throw new Error(`${host}: ${JSON.stringify(data.error)}`);
    return data;
  }
  throw new Error(`${host}: retries exhausted`);
}
// The existing matcher remains the first gate. Preserve full track metadata for verification.
const deezer = new Deezer(async (url) => {
  const res = await request(url, true);
  const data = await res.clone().json();
  if (data.error) throw new Error(`Deezer ${JSON.stringify(data.error)}`);
  return res;
});
const mbByIsrc = async (isrc) => {
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc ?? "")) return [];
  const p = resolve(cacheDir, `isrc/${isrc}.json`);
  let data = await read(p);
  if (!data) {
    data = await request(
      `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent("isrc:" + isrc)}&fmt=json&limit=100`,
    );
    await save(p, data);
  }
  return data.recordings ?? [];
};
const queues = new Map();
for (let y = 1950; y <= 2025; y++)
  queues.set(
    y,
    songs
      .filter(
        (s) =>
          s.year === y &&
          s.deezerId === null &&
          !accepted[keyOf(s)] &&
          !decisions[keyOf(s)],
      )
      .sort((a, b) => a.chartRank - b.chartRank),
  );
let attempted = 0,
  added = 0;
let changed = true;
const concurrency = arg("--concurrency", 4);
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8)
  throw new Error("--concurrency must be 1..8");
while (attempted < limit && changed) {
  changed = false;
  const years = [...queues.keys()].sort(
    (a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a - b,
  );
  let jobs = [];
  for (const year of years) {
    if (attempted >= limit) break;
    if ((counts.get(year) ?? 0) >= target) continue;
    const song = queues.get(year).shift();
    if (!song) continue;
    changed = true;
    attempted++;
    const attemptNumber = attempted;
    jobs.push(
      (async () => {
        const key = keyOf(song),
          now = new Date().toISOString();
        try {
          const hit = await deezer.findTrack(song);
          if (!hit) {
            decisions[key] = { status: "no-match", checkedAt: now };
            return;
          }
          const track = await request(`https://api.deezer.com/track/${hit.id}`);
          if (usedIds.has(track.id)) {
            decisions[key] = {
              status: "duplicate-id",
              deezerId: track.id,
              checkedAt: now,
            };
            return;
          }
          const recordings = await mbByIsrc(track.isrc);
          const recording = recordings.find(
            (r) => !verifyRecording(song, track, r),
          );
          if (!recording) {
            decisions[key] = {
              status: "needs-review",
              deezerId: track.id,
              isrc: track.isrc,
              releaseDate: track.release_date,
              album: track.album?.title,
              checkedAt: now,
              reasons: recordings.length
                ? [
                    ...new Set(
                      recordings.map((r) => verifyRecording(song, track, r)),
                    ),
                  ]
                : ["no-isrc-evidence"],
            };
            return;
          }
          if (usedRecordings.has(recording.id) || usedIsrcs.has(track.isrc)) {
            decisions[key] = {
              status: "duplicate-recording",
              deezerId: track.id,
              checkedAt: now,
            };
            return;
          }
          const audio = await request(track.preview, true);
          const bytes = new Uint8Array(await audio.arrayBuffer());
          if (!isAudio(bytes, audio.headers.get("content-type")))
            throw new Error("invalid audio payload");
          if (usedIds.has(track.id)) {
            decisions[key] = {
              status: "duplicate-id",
              deezerId: track.id,
              checkedAt: now,
            };
            return;
          }
          // Never persist signed preview URLs or audio bytes.
          accepted[key] = {
            title: song.title,
            artist: song.artist,
            year: song.year,
            chartYear: song.chartYear,
            chartRank: song.chartRank,
            deezerId: track.id,
            isrc: track.isrc,
            recordingMbid: recording.id,
            originalReleaseDate: recording["first-release-date"],
            recordingTitle: recording.title,
            recordingCredit: recording["artist-credit"],
            recordingLengthMs: recording.length,
            trackTitle: track.title,
            trackArtist: track.artist.name,
            trackDuration: track.duration,
            albumTitle: track.album?.title,
            albumId: track.album?.id,
            deezerReleaseDate: track.release_date,
            sources: [
              `https://api.deezer.com/track/${track.id}`,
              `https://musicbrainz.org/recording/${recording.id}`,
            ],
            previewCheckedAt: now,
            previewCheck: {
              status: audio.status,
              contentType: audio.headers.get("content-type"),
              bytes: bytes.length,
            },
            decision: "accepted-isrc-credit-year-duration-preview",
            ruleVersion: 2,
            recordingDisambiguation: recording.disambiguation ?? "",
          };
          usedIds.add(track.id);
          usedRecordings.add(recording.id);
          usedIsrcs.add(track.isrc);
          counts.set(year, (counts.get(year) ?? 0) + 1);
          added++;
          await save(evidencePath, accepted);
          console.log(`ACCEPT ${added} / ${attemptNumber} ${year} ${key}`);
        } catch (e) {
          // Network errors remain retryable; they are never permanent misses.
          console.error(`RETRY ${year} ${key}: ${e.message}`);
        } finally {
          await save(resolve(cacheDir, "decisions.json"), decisions);
          if (attemptNumber % 10 === 0)
            console.log(
              `PROGRESS ${attempted} attempted; ${added} accepted this run; ${Object.keys(accepted).length} total accepted`,
            );
        }
      })(),
    );
    if (jobs.length >= concurrency) {
      await Promise.all(jobs);
      jobs = [];
    }
  }
  await Promise.all(jobs);
}
if (process.argv.includes("--apply")) {
  const fresh = await read(catalogPath);
  await save(catalogPath, applyAccepted(fresh, accepted));
}
console.log(
  JSON.stringify({
    attempted,
    added,
    totalAccepted: Object.keys(accepted).length,
    counts: Object.fromEntries(counts),
    review: Object.values(decisions).filter((d) => d.status === "needs-review")
      .length,
  }),
);
