import { translate, type Locale } from "../i18n/locale";
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
export function missingFields(
  song: {
    title: string;
    artist: string;
    year: number;
    yearSource: string;
    chartRank: number | null;
    chartYear: number | null;
    mbid: string | null;
    deezerId: number | null;
  },
  locale: Locale = "en",
): string[] {
  return [
    [translate(locale, "Title", "Título"), !song.title?.trim()],
    [translate(locale, "Artist", "Artista"), !song.artist?.trim()],
    [translate(locale, "Release year", "Ano de lançamento"), !song.year],
    [
      translate(locale, "Year source", "Fonte do ano"),
      !song.yearSource?.trim(),
    ],
    [
      translate(locale, "Chart rank", "Posição na parada"),
      song.chartRank == null,
    ],
    [translate(locale, "Chart year", "Ano da parada"), song.chartYear == null],
    [translate(locale, "MusicBrainz ID", "ID do MusicBrainz"), !song.mbid],
    [translate(locale, "Preview ID", "ID da prévia"), !song.deezerId],
  ]
    .filter(([, missing]) => missing)
    .map(([label]) => String(label));
}
export const qualityOptions = [
  {
    value: "incomplete",
    label: "Missing information",
    labelPtBR: "Informações ausentes",
    description: "At least one field listed below is absent",
    descriptionPtBR: "Falta pelo menos um dos campos listados",
    matches: (s: CatalogSong) => missingFields(s).length > 0,
  },
  {
    value: "unranked",
    label: "No chart rank",
    labelPtBR: "Sem posição na parada",
    description: "No rank recorded in the dataset",
    descriptionPtBR: "Os dados não registram a posição na parada",
    matches: (s: CatalogSong) => s.chartRank == null,
  },
  {
    value: "ranked",
    label: "Has chart rank",
    labelPtBR: "Com posição na parada",
    description: "Rank recorded; visible in the table",
    descriptionPtBR: "A posição na parada aparece na tabela",
    matches: (s: CatalogSong) => s.chartRank != null,
  },
  {
    value: "missing-chart-year",
    label: "No chart year",
    labelPtBR: "Sem ano da parada",
    description: "No chart-year context recorded",
    descriptionPtBR: "Os dados não registram o ano da parada",
    matches: (s: CatalogSong) => s.chartYear == null,
  },
  {
    value: "missing-mbid",
    label: "No MusicBrainz ID",
    labelPtBR: "Sem ID do MusicBrainz",
    description: "No linked MusicBrainz recording",
    descriptionPtBR: "Não há gravação vinculada no MusicBrainz",
    matches: (s: CatalogSong) => !s.mbid,
  },
  {
    value: "missing",
    label: "Missing preview ID",
    labelPtBR: "Sem ID da prévia",
    description: "No Deezer preview match recorded",
    descriptionPtBR: "Não há prévia identificada no Deezer",
    matches: (s: CatalogSong) => !s.deezerId,
  },
  {
    value: "missing-core",
    label: "Missing core metadata",
    labelPtBR: "Faltam dados essenciais",
    description: "Title, artist, release year or year source absent",
    descriptionPtBR: "Falta título, artista, ano de lançamento ou fonte do ano",
    matches: (s: CatalogSong) =>
      !s.title?.trim() || !s.artist?.trim() || !s.year || !s.yearSource?.trim(),
  },
  {
    value: "fallback",
    label: "Chart-year fallback",
    labelPtBR: "Ano da parada como referência",
    description: "Release year inferred from the chart year",
    descriptionPtBR: "Ano de lançamento estimado pelo ano da parada",
    matches: (s: CatalogSong) => s.yearSource === "chart-year",
  },
  {
    value: "matched",
    label: "Preview matched",
    labelPtBR: "Prévia identificada",
    description: "A Deezer ID is recorded",
    descriptionPtBR: "Há um ID do Deezer registrado",
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
