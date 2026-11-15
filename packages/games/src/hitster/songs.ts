// Built by the pipeline in tools/songs (see its README). Imported from there so there is one copy.
import data from "../../../../tools/songs/out/songs.json";

export interface Song {
  title: string;
  artist: string;
  /** Year of first release: the one the timeline is ordered by. */
  year: number;
  /** Deezer track for the 30-second preview, or null when not matched yet. */
  deezerId: number | null;
}

export const SONGS: readonly Song[] = data.map(({ title, artist, year, deezerId }) => ({ title, artist, year, deezerId }));

/**
 * A card's face. It is built from the title and artist rather than the
 * song's position in the list, so games saved before the dataset is rebuilt
 * still point at the right songs.
 */
export const songKey = (song: Pick<Song, "title" | "artist">) => `${song.title}|${song.artist}`;

const byKey = new Map(SONGS.map((song) => [songKey(song), song]));

export const songForView = (face: string): Song =>
  byKey.get(face) ?? { title: "Unknown song", artist: "Unknown artist", year: 0, deezerId: null };

export function songOf(face: string): Song {
  const song = byKey.get(face);
  if (!song) throw new Error(`Unknown song card: ${face}`);
  return song;
}
