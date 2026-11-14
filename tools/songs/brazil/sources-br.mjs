// Loads every Brazilian song source into one shape:
// { title, artist, source, chart?, chartYear?, rank?, year? (known release year) }
import { join } from "node:path";
import { CACHE_DIR, readJson } from "../lib.mjs";
import { norm } from "../normalize.mjs";
import { CURATED } from "./curated-br.mjs";

const BR_CACHE = join(CACHE_DIR, "br");

// "Kevinho (com a participação de Anitta)" -> "Kevinho"; "Tom Jobim e Vinicius" -> "Tom Jobim".
// Duos written with "&" ("Bruno & Marrone") stay whole, as on MusicBrainz.
export function primaryArtistBr(artist = "") {
  return artist
    .replace(/\(.*?\)/g, " ")
    .split(/\s+(?:feat\.?|ft\.?|part\.?|participação de|com|e|x|vs\.?)\s+|\s*[,/;]\s*/i)[0]
    .trim();
}

// A "Canções de <ano>" page counts as Brazilian if a category says so, or if the article's
// first paragraph calls it Brazilian and no category marks it as foreign-language.
const BR_CAT = /portugu[êe]s|Brasil|brasileir|samba|bossa nova|MPB|sertanej|ax[ée]|forr[óo]|bai[ãa]o|frevo|marchinha|pagode|funk carioca|funk ostenta|brega|tropic[áa]lia|choro|piseiro|arrocha|Jovem Guarda/i;
const FOREIGN_CAT = /em (ingl[êe]s|espanhol|castelhano|italiano|franc[êe]s|alem[ãa]o|japon[êe]s|coreano)|Estados Unidos|Reino Unido|Portugal/i;
const BR_LEAD = /brasileir|\bBrasil\b|samba|marchinha|baião|bossa nova/i;
export function isBrazilian(p) {
  if (p.cats.some((c) => BR_CAT.test(c))) return true;
  return BR_LEAD.test(p.lead ?? "") && !p.cats.some((c) => FOREIGN_CAT.test(c));
}

export const songKey =(s) => `${norm(s.title)}|${norm(primaryArtistBr(s.artist))}`;

export async function allSongs() {
  const out = [];
  const charts = await readJson(join(BR_CACHE, "charts.json"), { pages: {} });
  for (const { rows } of Object.values(charts.pages)) {
    for (const r of rows) out.push({ ...r, source: r.chart });
  }
  const cats = await readJson(join(BR_CACHE, "categories.json"), { years: {} });
  for (const { songs } of Object.values(cats.years)) {
    for (const s of songs.filter(isBrazilian)) out.push({ title: s.title, artist: s.artist, year: s.year, source: "wikipedia-category", page: s.page });
  }
  // Hand-picked list: "curated" rows carry a release year; the others are a year's #1
  // as reported by the press (Buscapé, Crowley, Pro-Música, Spotify), i.e. a chart year.
  for (const [year, title, artist, , src] of CURATED) {
    if (src === "curated") out.push({ title, artist, year, source: "curated" });
    else out.push({ title, artist, chartYear: year, rank: 1, source: `press:${src}` });
  }
  return out;
}
