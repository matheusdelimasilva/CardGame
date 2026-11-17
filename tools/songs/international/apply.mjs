// Offline application: existing nonnull IDs and saved-game keys are preserved.
import { keyOf } from "./verify.mjs";
export function applyAccepted(songs, evidence) {
  const ids = new Set(
    songs.filter((s) => s.deezerId !== null).map((s) => s.deezerId),
  );
  return songs.map((song) => {
    const e = evidence[keyOf(song)];
    if (!e || song.deezerId !== null) return { ...song };
    if (e.year !== song.year)
      throw new Error(`Stale release year: ${keyOf(song)}`);
    if (!Number.isSafeInteger(e.deezerId) || e.deezerId <= 0)
      throw new Error(`Invalid Deezer ID: ${keyOf(song)}`);
    if (ids.has(e.deezerId))
      throw new Error(`Duplicate Deezer ID: ${e.deezerId}`);
    ids.add(e.deezerId);
    return {
      ...song,
      deezerId: e.deezerId,
      mbid: e.recordingMbid,
      yearSource: "musicbrainz",
    };
  });
}
