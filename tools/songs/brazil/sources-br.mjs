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
const FOREIGN_CAT = /em (ingl[êe]s|espanhol|castelhano|italiano|franc[êe]s|alem[ãa]o|japon[êe]s|coreano)|Estados Unidos|Reino Unido|Portugal|Eurovis/i;
const BR_LEAD = /brasileir|\bBrasil\b|samba|marchinha|baião|bossa nova/i;
export function isBrazilian(p, brArtists) {
  if (p.cats.some((c) => /Portugal|Eurovis/i.test(c))) return false;
  if (p.cats.some((c) => BR_CAT.test(c))) return true;
  if (p.cats.some((c) => FOREIGN_CAT.test(c))) return false;
  if (BR_LEAD.test(p.lead ?? "")) return true;
  return !!brArtists && artistsOf(p).some((a) => brArtists.has(a));
}

// Artists named in "Canções gravadas/compostas por X" categories.
const artistsOf = (p) =>
  p.cats.map((c) => /^Canções (?:gravadas|compostas) por (.+)$/.exec(c)?.[1]).filter(Boolean)
    .flatMap((a) => a.split(/\s+e\s+/));

// No infobox artist: take a "Canções gravadas por X" category, preferring a singer-songwriter.
function fallbackArtist(p) {
  const by = (kind) => p.cats.map((c) => new RegExp(`^Canções ${kind} por (.+)$`).exec(c)?.[1]).filter(Boolean);
  const sung = by("gravadas");
  const wrote = by("compostas").join(" e ");
  return sung.find((a) => wrote.includes(a)) ?? sung[0] ?? "";
}

// An artist is Brazilian if at least 2 of their song pages, and most of them, pass the
// category/lead test. ("Garota de Ipanema" recorded by Sinatra doesn't make Sinatra Brazilian.)
export function brazilianArtists(pages) {
  const tally = new Map();
  for (const p of pages) {
    const br = isBrazilian(p);
    for (const a of artistsOf(p)) {
      const t = tally.get(a) ?? { br: 0, all: 0 };
      t.all++;
      if (br) t.br++;
      tally.set(a, t);
    }
  }
  return new Set([...tally].filter(([, t]) => t.br >= 2 && t.br * 2 > t.all).map(([a]) => a));
}

export const songKey =(s) => `${norm(s.title)}|${norm(primaryArtistBr(s.artist))}`;

export async function allSongs() {
  const out = [];
  const charts = await readJson(join(BR_CACHE, "charts.json"), { pages: {} });
  for (const { rows } of Object.values(charts.pages)) {
    for (const r of rows) out.push({ ...r, source: r.chart });
  }
  const cats = await readJson(join(BR_CACHE, "categories.json"), { years: {} });
  const pages = Object.values(cats.years).flatMap((y) => y.songs);
  const brArtists = brazilianArtists(pages);
  for (const { songs } of Object.values(cats.years)) {
    for (const s of songs.filter((p) => isBrazilian(p, brArtists))) out.push({ title: s.title, artist: s.artist || fallbackArtist(s), year: s.year, source: "wikipedia-category", page: s.page });
  }
  // Hand-picked list: "curated" rows carry a release year; the others are a year's #1
  // as reported by the press (Buscapé, Crowley, Pro-Música, Spotify), i.e. a chart year.
  for (const [year, title, artist, , src] of CURATED) {
    if (src === "curated") out.push({ title, artist, year, source: "curated" });
    else out.push({ title, artist, chartYear: year, rank: 1, source: `press:${src}` });
  }
  return out;
}
