// Conservative automated gate. Keeps incomplete/conflicting evidence in review.
import { join } from "node:path";
import { CACHE_DIR, OUT_DIR, readJson, writeJson } from "../lib.mjs";
import { norm } from "../normalize.mjs";
export function assessCandidate(
  item,
  recordingEvidence,
  artists,
  existingIds = new Set(),
) {
  const fail = (reason) => ({ accepted: false, reason });
  if (!item.preview?.ok || !item.metadata?.id) return fail("No checked audio");
  if (existingIds.has(item.metadata.id))
    return fail("Already playable Deezer ID");
  const records = recordingEvidence?.recordings ?? [];
  if (records.length !== 1) return fail("Missing or ambiguous recording ISRC");
  const recording = records[0];
  if (recording.score !== 100) return fail("Nonexact recording search");
  if (norm(recording.artist) !== norm(item.metadata.artist))
    return fail("Recording credit differs");
  if (norm(recording.title) !== norm(item.metadata.title))
    return fail("Recording title differs");
  if (
    recording.artistIds.length !== 1 ||
    artists[recording.artistIds[0]]?.country !== "BR"
  )
    return fail("Brazilian performer origin unverified");
  if (!/^\d{4}(?:-|$)/.test(recording.firstRelease ?? ""))
    return fail("No recording release date");
  const year = Number(recording.firstRelease.slice(0, 4));
  const observations = item.song.observations ?? [];
  if (!observations.length || !observations.some((o) => year <= o.chartYear))
    return fail("Recording postdates available chart evidence");
  if (year < 1960 || year > new Date().getUTCFullYear())
    return fail("Outside campaign years");
  const scanned = observations.filter(
    (o) => o.verification === "scan-verified",
  );
  // Published ranks are only recording-specific when the displayed version is
  // compatible. Work-level chart claims never become verified recording ranks.
  const versioned = /\b(ao vivo|live|remix|acoustic|acústic|medley)\b/i.test(
    item.metadata.title,
  );
  const ranking = scanned.filter(
    (o) =>
      !versioned &&
      norm(o.rawTitle ?? item.song.title) === norm(item.metadata.title),
  );
  const title = versioned ? item.metadata.title : item.song.title;
  return {
    accepted: true,
    song: {
      title,
      artist: item.metadata.artist,
      year,
      yearSource: "musicbrainz",
      mbid: recording.mbid,
      deezerId: item.metadata.id,
      provenance: {
        isrc: item.metadata.isrc,
        recordingSource: `https://musicbrainz.org/recording/${recording.mbid}`,
        recordingDate: recording.firstRelease,
        artist: artists[recording.artistIds[0]],
        deezer: item.metadata,
        preview: item.preview,
        checkedAt: item.checkedAt,
        popularityTier: ranking.length
          ? "scan-verified-chart"
          : "chart-listed-work",
        chartObservations: observations.map((o) => ({
          ...o,
          position: ranking.includes(o) ? o.position : null,
          unverifiedPositionClaim: ranking.includes(o) ? null : o.position,
          recordingSpecific: ranking.includes(o),
        })),
      },
    },
  };
}
// Explicit entrypoint so tests can import the gate without I/O.
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const recordings = await readJson(
    join(CACHE_DIR, "br", "chart-pilot-recordings.json"),
    {},
  );
  const artists = await readJson(
    join(CACHE_DIR, "br", "chart-pilot-artists.json"),
    {},
  );
  const existing = await readJson(join(OUT_DIR, "songs-br.json"));
  const ids = new Set(
    existing.filter((s) => s.deezerId).map((s) => s.deezerId),
  );
  const accepted = await readJson(
    new URL("./accepted-chart-songs.json", import.meta.url),
    [],
  );
  const acceptedIds = new Set(accepted.map((s) => s.deezerId));
  const decisions = [];
  for (const p of ["chart-pilot-matches.json", "chart-pilot-review.json"])
    for (const item of Object.values(
      await readJson(join(CACHE_DIR, "br", p), {}),
    )) {
      const result = assessCandidate(
        item,
        recordings[item.metadata?.isrc],
        artists,
        ids,
      );
      decisions.push({
        title: item.song.title,
        artist: item.song.artist,
        ...(result.accepted
          ? { accepted: true, deezerId: result.song.deezerId }
          : { accepted: false, reason: result.reason }),
      });
      if (result.accepted && !acceptedIds.has(result.song.deezerId)) {
        accepted.push(result.song);
        acceptedIds.add(result.song.deezerId);
        ids.add(result.song.deezerId);
      }
    }
  await writeJson(
    new URL("./accepted-chart-songs.json", import.meta.url),
    accepted,
  );
  await writeJson(
    join(OUT_DIR, "chart-acceptance-decisions-br.json"),
    decisions,
  );
  console.log(
    `${accepted.length} accepted recordings persisted with provenance`,
  );
}
