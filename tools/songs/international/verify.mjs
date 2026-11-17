import { norm, scoreCandidate } from "../../../packages/server/src/deezer.ts";

export const keyOf = (s) => `${s.artist} — ${s.title}`;
export const yearOf = (date) =>
  /^\d{4}(?:-|$)/.test(date ?? "") ? Number(date.slice(0, 4)) : null;
export const creditOf = (r) =>
  (r["artist-credit"] ?? [])
    .map((a) => (a.name ?? a.artist?.name ?? "") + (a.joinphrase ?? ""))
    .join("");
const creditNorm = (s) =>
  norm(s.replace(/\b(featuring|feat\.?|ft\.?|with|and)\b/gi, " and "));

// A shared ISRC is evidence only when the recording's credits, version and date agree too.
export function verifyRecording(song, track, recording) {
  if (/\s\/\s/.test(song.title)) return "combined-title";
  if (!track.isrc || !(recording.isrcs ?? []).includes(track.isrc))
    return "isrc";
  if (track.readable === false || !track.preview) return "preview-metadata";
  if (scoreCandidate(song, track) === null) return "track-identity";
  const credit = creditOf(recording);
  if (creditNorm(credit) !== creditNorm(song.artist)) return "recording-credit";
  if (
    scoreCandidate(song, {
      title: recording.title,
      artist: { name: credit },
      preview: "evidence",
    }) === null
  )
    return "recording-title-version";
  if (
    /live|remix|re-record|alternate|demo|karaoke|instrumental|acoustic|edit|sped|slowed/i.test(
      recording.disambiguation ?? "",
    )
  )
    return "recording-disambiguation";
  const trackYear = yearOf(track.release_date);
  if (trackYear && trackYear < song.year) return "earlier-deezer-release";
  if (
    trackYear &&
    norm(track.album?.title ?? "") === norm(song.title) &&
    trackYear !== song.year
  )
    return "single-release-year-conflict";
  if (yearOf(recording["first-release-date"]) !== song.year)
    return "release-year";
  if (
    !recording.length ||
    !track.duration ||
    Math.abs(recording.length / 1000 - track.duration) > 5
  )
    return "duration";
  return null;
}

export function isAudio(bytes, type) {
  if (!/^audio\//i.test(type ?? "") || bytes.length < 1024) return false;
  return (
    (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) ||
    bytes.some((b, i) => i < 4096 && b === 255 && (bytes[i + 1] & 224) === 224)
  );
}
