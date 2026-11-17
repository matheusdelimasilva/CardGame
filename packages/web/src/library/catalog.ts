import international from "../../../../tools/songs/out/songs.json";
import brasil from "../../../../tools/songs/out/songs-br.json";

export const catalog = [
  ...international.map((song, i) => ({
    ...song,
    source: "billboard",
    catalog: "international",
    id: `international-${i}`,
  })),
  ...brasil.map((song, i) => ({
    ...song,
    catalog: "brasil",
    id: `brasil-${i}`,
  })),
];
export type CatalogSong = (typeof catalog)[number];
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export interface Filters {
  query: string;
  list: string;
  decade: string;
  quality: string;
  source: string;
}
/** Missing optional fields describe coverage, not necessarily incorrect records. */
export function missingFields(song: {
  title: string;
  artist: string;
  year: number;
  yearSource: string;
  chartRank: number | null;
  chartYear: number | null;
  mbid: string | null;
  deezerId: number | null;
}): string[] {
  return [
    ["Title", !song.title?.trim()],
    ["Artist", !song.artist?.trim()],
    ["Release year", !song.year],
    ["Year source", !song.yearSource?.trim()],
    ["Chart rank", song.chartRank == null],
    ["Chart year", song.chartYear == null],
    ["MusicBrainz ID", !song.mbid],
    ["Preview ID", !song.deezerId],
  ]
    .filter(([, missing]) => missing)
    .map(([label]) => String(label));
}
export const qualityOptions = [
  {
    value: "incomplete",
    label: "Missing information",
    description: "At least one field listed below is absent",
    matches: (s: CatalogSong) => missingFields(s).length > 0,
  },
  {
    value: "unranked",
    label: "No chart rank",
    description: "No rank recorded in the dataset",
    matches: (s: CatalogSong) => s.chartRank == null,
  },
  {
    value: "ranked",
    label: "Has chart rank",
    description: "Rank recorded; visible in the table",
    matches: (s: CatalogSong) => s.chartRank != null,
  },
  {
    value: "missing-chart-year",
    label: "No chart year",
    description: "No chart-year context recorded",
    matches: (s: CatalogSong) => s.chartYear == null,
  },
  {
    value: "missing-mbid",
    label: "No MusicBrainz ID",
    description: "No linked MusicBrainz recording",
    matches: (s: CatalogSong) => !s.mbid,
  },
  {
    value: "missing",
    label: "Missing preview ID",
    description: "No Deezer preview match recorded",
    matches: (s: CatalogSong) => !s.deezerId,
  },
  {
    value: "missing-core",
    label: "Missing core metadata",
    description: "Title, artist, release year or year source absent",
    matches: (s: CatalogSong) =>
      !s.title?.trim() || !s.artist?.trim() || !s.year || !s.yearSource?.trim(),
  },
  {
    value: "fallback",
    label: "Chart-year fallback",
    description: "Release year inferred from the chart year",
    matches: (s: CatalogSong) => s.yearSource === "chart-year",
  },
  {
    value: "matched",
    label: "Preview matched",
    description: "A Deezer ID is recorded",
    matches: (s: CatalogSong) => !!s.deezerId,
  },
];
export function filterSongs(filters: Filters) {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);
  const quality = qualityOptions.find(
    (option) => option.value === filters.quality,
  );
  return catalog.filter(
    (song) =>
      (!filters.list || song.catalog === filters.list) &&
      (!filters.decade ||
        Math.floor(song.year / 10) * 10 === Number(filters.decade)) &&
      (!filters.source || song.yearSource === filters.source) &&
      (!quality || quality.matches(song)) &&
      terms.every((term) =>
        normalize(
          `${song.title} ${song.artist} ${song.year} ${song.deezerId ?? ""} ${song.mbid ?? ""}`,
        ).includes(term),
      ),
  );
}
