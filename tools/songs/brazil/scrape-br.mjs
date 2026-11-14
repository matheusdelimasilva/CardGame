// Step 1 (Brazil): collect popular Brazilian songs from pt.wikipedia.
//  a) chart pages: Crowley year-end top 100 lists + number-one lists of the Brazilian charts
//  b) "Categoria:Canções de <ano>" pages that are Brazilian songs (best coverage before 1999)
// Usage: node scrape-br.mjs [fromYear] [toYear]     (years for the categories, default 1900-now)
// Output: ../.cache/br/charts.json, ../.cache/br/categories.json
import { join } from "node:path";
import { CACHE_DIR, readJson, writeJson } from "../lib.mjs";
import { getWikitext, infobox, parseTables, plain, wikiApi } from "./wikitext.mjs";
import { isBrazilian } from "./sources-br.mjs";

const BR_CACHE = join(CACHE_DIR, "br");
const FROM = Number(process.argv[2] ?? 1900);
const TO = Number(process.argv[3] ?? new Date().getFullYear());

// ---------- a) chart pages ----------
const CHART_PREFIXES = [
  "Lista das canções mais executadas no Brasil em ", // Crowley year-end top 100 (radio)
  "Lista de canções número um na ",
  "Lista de singles número um na Brasil Hot 100 em ",
  "Lista de singles número um na Brazil Songs em ",
];
// International-only charts: skip, the overall charts already cover what was big in Brazil.
const SKIP = /Hot Pop Songs|Pop Internacional/;

async function listPages(prefix) {
  const j = await wikiApi({ action: "query", list: "allpages", aplimit: "500", apfilterredir: "nonredirects", apprefix: prefix });
  return j.query.allpages.map((p) => p.title);
}

function chartName(page) {
  if (/mais executadas/.test(page)) return "Crowley year-end";
  return /número um na (.+?) em \d{4}/.exec(page)?.[1] ?? page;
}

function rowsFromTables(tables, chartYear, chart) {
  const out = [];
  for (const rows of tables) {
    const hi = rows.findIndex((r) => r.some((c) => /^(can[çc][ãa]o|single|t[íi]tulo)/i.test(c)) && r.some((c) => /^artista/i.test(c)));
    if (hi < 0) continue;
    const h = rows[hi];
    const iTitle = h.findIndex((c) => /^(can[çc][ãa]o|single|t[íi]tulo)/i.test(c));
    const iArtist = h.findIndex((c) => /^artista/i.test(c));
    const iRank = h.findIndex((c) => /^(posi|#|n\.?º|rank)/i.test(c));
    for (const r of rows.slice(hi + 1)) {
      const title = r[iTitle], artist = r[iArtist];
      if (!title || !artist) continue;
      const rank = iRank >= 0 ? Number(r[iRank]) : 1;
      if (!Number.isInteger(rank)) continue;
      out.push({ chartYear, rank, title, artist, chart });
    }
  }
  // number-one lists repeat a song for every week it led: keep it once
  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.title}|${r.artist}`.toLowerCase();
    return seen.has(k) ? false : seen.add(k);
  });
}

const chartsPath = join(BR_CACHE, "charts.json");
const charts = await readJson(chartsPath, { pages: {} });
for (const prefix of CHART_PREFIXES) {
  for (const page of await listPages(prefix)) {
    if (SKIP.test(page) || charts.pages[page]) continue;
    const chartYear = Number(/em (\d{4})/.exec(page)?.[1]);
    const wt = await getWikitext(page);
    const rows = wt ? rowsFromTables(parseTables(wt), chartYear, chartName(page)) : [];
    charts.pages[page] = { chartYear, rows };
    await writeJson(chartsPath, charts);
    console.log(`${page}: ${rows.length}`);
  }
}

// ---------- b) song categories by year ----------
// First paragraph of the article body (after the infobox), as plain text.
function leadText(wt) {
  const body = wt.replace(/\{\{[\s\S]*?\}\}\s*\n/, "");
  const para = body.split(/\n\s*\n/).find((p) => /'''/.test(p)) ?? "";
  return plain(para).slice(0, 400);
}

async function categoryMembers(year) {
  const titles = [];
  let cont = {};
  do {
    const j = await wikiApi({ action: "query", list: "categorymembers", cmtitle: `Categoria:Canções de ${year}`, cmnamespace: "0", cmlimit: "500", ...cont });
    titles.push(...(j.query?.categorymembers ?? []).map((m) => m.title));
    cont = j.continue ?? null;
  } while (cont);
  return titles;
}

async function pageDetails(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    let cont = {};
    const pages = new Map();
    do {
      const j = await wikiApi({
        action: "query", titles: batch.join("|"), prop: "revisions|categories",
        rvprop: "content", rvslots: "main", cllimit: "max", ...cont,
      });
      for (const p of j.query?.pages ?? []) {
        const cur = pages.get(p.title) ?? { title: p.title, cats: [], text: "" };
        cur.cats.push(...(p.categories ?? []).map((c) => c.title.replace(/^Categoria:/, "")));
        cur.text ||= p.revisions?.[0]?.slots?.main?.content ?? "";
        pages.set(p.title, cur);
      }
      cont = j.continue ?? null;
    } while (cont);
    out.push(...pages.values());
  }
  return out;
}

const catPath = join(BR_CACHE, "categories.json");
const cats = await readJson(catPath, { years: {} });
for (let year = FROM; year <= TO; year++) {
  if (cats.years[year]) continue;
  const titles = await categoryMembers(year);
  const details = titles.length ? await pageDetails(titles) : [];
  // Keep every page with its categories and lead text; the Brazilian filter runs at build time.
  const songs = details.map((d) => {
    const ib = infobox(d.text, ["nome", "artista", "intérprete", "interprete"]);
    return {
      year,
      page: d.title,
      title: ib.nome || d.title.replace(/\s*\(.*\)\s*$/, ""),
      artist: ib.artista || ib["intérprete"] || ib.interprete || "",
      cats: d.cats.filter((c) => !c.startsWith("!")),
      lead: leadText(d.text),
    };
  });
  cats.years[year] = { total: titles.length, songs };
  await writeJson(catPath, cats);
  console.log(`Canções de ${year}: ${songs.filter(isBrazilian).length}/${titles.length} brasileiras`);
}
