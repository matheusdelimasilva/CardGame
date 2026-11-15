// Built by the pipeline in tools/songs (see its README). Imported from there so there is one copy.
import data from "../../../../tools/songs/out/songs.json";
import brazilData from "../../../../tools/songs/out/songs-br.json";

export interface Song {
  title: string;
  artist: string;
  /** Year of first release: the one the timeline is ordered by. */
  year: number;
  /** Deezer track for the 30-second preview, or null when not matched yet. */
  deezerId: number | null;
}

export type SongListId = "international" | "brasil";

const songs = (rows: readonly Song[]): readonly Song[] =>
  rows.map(({ title, artist, year, deezerId }) => ({
    title,
    artist,
    year,
    deezerId,
  }));

export const SONG_LISTS: Record<SongListId, readonly Song[]> = {
  international: songs(data),
  brasil: songs(brazilData),
};

export const SONGS = SONG_LISTS.international;

/**
 * A card's face. It is built from the title and artist rather than the
 * song's position in the list, so games saved before the dataset is rebuilt
 * still point at the right songs.
 */
export const songKey = (song: Pick<Song, "title" | "artist">) =>
  `${song.title}|${song.artist}`;

const byKey = {
  international: new Map(
    SONG_LISTS.international.map((song) => [songKey(song), song]),
  ),
  brasil: new Map(SONG_LISTS.brasil.map((song) => [songKey(song), song])),
};

export const songForView = (
  face: string,
  list: SongListId = "international",
): Song =>
  byKey[list].get(face) ?? {
    title: "Unknown song",
    artist: "Unknown artist",
    year: 0,
    deezerId: null,
  };

export function songOf(face: string, list: SongListId = "international"): Song {
  const song = byKey[list].get(face);
  if (!song) throw new Error(`Unknown song card: ${face}`);
  return song;
}
