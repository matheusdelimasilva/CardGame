// Loads every Brazilian song source into one shape:
// { title, artist, source, chart?, chartYear?, rank?, year? (known release year) }
import { join } from "node:path";
import { CACHE_DIR, readJson } from "../lib.mjs";
import { norm } from "../normalize.mjs";
import { CURATED, LIVE_HITS } from "./curated-br.mjs";
import { VERIFIED_ADDITIONS } from "./verified-additions.mjs";

const BR_CACHE = join(CACHE_DIR, "br");

// "Kevinho (com a participação de Anitta)" -> "Kevinho"; "Tom Jobim e Vinicius" -> "Tom Jobim".
// Duos written with "&" ("Bruno & Marrone") stay whole, as on MusicBrainz.
export function primaryArtistBr(artist = "") {
  return artist
    .replace(/\(.*?\)/g, " ")
    .split(
      /\s+(?:feat\.?|ft\.?|part\.?|participação(?: de)?|com|e|x|vs\.?)\s+|\s*[,/;]\s*/i,
    )[0]
    .trim();
}

// A "Canções de <ano>" page counts as Brazilian if a category says so, or if the article's
// first paragraph calls it Brazilian and no category marks it as foreign-language.
const BR_CAT =
  /Brasil|brasileir|samba|bossa nova|MPB|sertanej|ax[ée]|forr[óo]|bai[ãa]o|frevo|marchinha|pagode|funk carioca|funk ostenta|brega|tropic[áa]lia|choro|piseiro|arrocha|Jovem Guarda/i;
const FOREIGN_CAT =
  /em (ingl[êe]s|espanhol|castelhano|italiano|franc[êe]s|alem[ãa]o|japon[êe]s|coreano)|Estados Unidos|Reino Unido|Portugal/i;
const BR_LEAD = /brasileir|\bBrasil\b|samba|marchinha|baião|bossa nova/i;
export function isBrazilian(p) {
  // This article mixes Johnny Restivo's US original with a later Brazilian cover.
  if (["Dear Someone", "Amarillo by Morning"].includes(p.page)) return false;
  if (p.cats.some((c) => BR_CAT.test(c))) return true;
  return BR_LEAD.test(p.lead ?? "") && !p.cats.some((c) => FOREIGN_CAT.test(c));
}

export const songKey = (s) =>
  `${norm(s.title)}|${norm(primaryArtistBr(s.artist))}`;

// Category dates can describe the composition while the infobox credits a cover.
// These individual corrections are documented in verification-br.md.
const CATEGORY_CORRECTIONS = {
  "No Rancho Fundo": { year: 1989 },
  Brasileirinho: { year: 1949 },
  "Garota de Ipanema": { title: "The Girl from Ipanema", year: 1964 },
  "Marvada Pinga": { artist: "Raul Torres", year: 1937 },
  Enrosca: { year: 2000 },
  "Positivismo (canção de Noel Rosa)": { artist: "Noel Rosa", year: 1933 },
  "Chão de Giz": { title: "Chão de Giz" },
  '"P" da Vida': { title: '"P" da Vida' },
  '"Oretachi" no Theme': { title: '"Oretachi" no Theme' },
  "Tititi (Galinhagem)": { year: 1985 },
  "Aquarela do Brasil": { artist: "Francisco Alves", year: 1939 },
  "O Que É que a Baiana Tem?": {
    artist: "Carmen Miranda e Dorival Caymmi",
    year: 1939,
  },
};

export async function allSongs() {
  const out = VERIFIED_ADDITIONS.map(({ year, title, artist }) => ({
    year,
    title,
    artist,
    source: "curated",
  }));
  const accepted = await readJson(
    new URL("./accepted-chart-songs.json", import.meta.url),
    [],
  );
  for (const { title, artist, year, mbid, yearSource } of accepted) {
    out.push({ title, artist, year, mbid, yearSource, source: "curated" });
  }
  const charts = await readJson(join(BR_CACHE, "charts.json"), { pages: {} });
  for (const { rows } of Object.values(charts.pages)) {
    for (const r of rows) out.push({ ...r, source: r.chart });
  }
  const cats = await readJson(join(BR_CACHE, "categories.json"), { years: {} });
  for (const { songs } of Object.values(cats.years)) {
    // Categories also contain compositions with no recorded performer (e.g. folk songs).
    // Do not invent an artist or emit an unplayable, invalid dataset row.
    for (const raw of songs.filter(isBrazilian)) {
      const s = { ...raw, ...CATEGORY_CORRECTIONS[raw.page] };
      if (
        !s.title.trim() ||
        !s.artist.trim() ||
        /^(vários(?: artistas)?|diversos(?: intérpretes)?|various artists)$/i.test(
          s.artist.trim(),
        )
      )
        continue;
      out.push({
        title: s.title,
        artist: s.artist,
        year: s.year,
        source: "wikipedia-category",
        page: s.page,
      });
    }
  }
  // Hand-picked list: "curated" rows carry a release year; the others are a year's #1
  // as reported by the press (Buscapé, Crowley, Pro-Música, Spotify), i.e. a chart year.
  for (const [year, title, artist, , src] of CURATED) {
    if (src === "curated") out.push({ title, artist, year, source: "curated" });
    else
      out.push({
        title,
        artist,
        chartYear: year,
        rank: 1,
        source: `press:${src}`,
      });
  }
  // Unify e/& spellings only when that complete act is actually present with &.
  // Do not turn arbitrary collaborations into duos or discard guest credits.
  const named = out.map((s) => ({
    ...s,
    title:
      norm(s.title) === "ta ok" &&
      /Maluma/i.test(s.artist) &&
      /Karol G/i.test(s.artist)
        ? "Tá OK (Remix)"
        : s.title,
    artist: s.artist
      .replace(/^MC Paiva ZS\b/i, "MC Paiva")
      .replace(
        /^Dennis(?: DJ)? e (?:MC )?Kevin o Chris$/i,
        "Dennis & MC Kevin o Chris",
      )
      .replace(
        /^Pedro Sampaio com (?:a )?participação de MC Pedrinho$/i,
        "Pedro Sampaio & MC Pedrinho",
      ),
  }));
  const creditKey = (s) => norm(s).replace(/\be\b/g, "and");
  const acts = new Map(
    named
      .filter((s) => / & /.test(s.artist) && !/[()]/.test(s.artist))
      .map((s) => [creditKey(s.artist), s.artist]),
  );
  const credited = named.map((s) => ({
    ...s,
    artist: !/[()]/.test(s.artist)
      ? (acts.get(creditKey(s.artist)) ?? s.artist)
      : s.artist,
  }));
  const liveHits = new Set(
    LIVE_HITS.map(([title, artist]) => songKey({ title, artist })),
  );
  return credited.map((s) =>
    liveHits.has(songKey(s)) && !/\bao vivo\b/i.test(s.title)
      ? { ...s, title: `${s.title} (Ao Vivo)` }
      : s,
  );
}
