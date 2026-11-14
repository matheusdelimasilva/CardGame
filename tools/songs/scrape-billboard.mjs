// Step 1: scrape Billboard year-end singles lists from Wikipedia.
// Usage: node scrape-billboard.mjs [fromYear] [toYear]
// Output: .cache/billboard.json  -> [{ chartYear, rank, title, artist }]
import { join } from "node:path";
import { CACHE_DIR, USER_AGENT, politeFetch, readJson, writeJson } from "./lib.mjs";

const FROM = Number(process.argv[2] ?? 1946);
const TO = Number(process.argv[3] ?? new Date().getFullYear() - 1);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—" };
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function cleanCell(html) {
  return decode(
    html
      .replace(/<sup[\s\S]*?<\/sup>/gi, "") // footnote markers
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, " / ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .replace(/^["“”\s]+|["“”\s]+$/g, "")
    .trim();
}

function parseTable(html, chartYear) {
  const tables = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/gi) ?? [];
  for (const table of tables) {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
      [...m[1].matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/\1>/gi)].map((c) => cleanCell(c[3])),
    );
    const header = rows.find((r) => r.some((c) => /^title/i.test(c)) && r.some((c) => /^artist/i.test(c)));
    if (!header) continue;
    const iRank = header.findIndex((c) => /^(no|#|№|rank)/i.test(c));
    const iTitle = header.findIndex((c) => /^title/i.test(c));
    const iArtist = header.findIndex((c) => /^artist/i.test(c));
    const out = [];
    let prevArtist = "";
    for (const r of rows) {
      if (r === header) continue;
      // A rowspan'd artist cell (same artist on consecutive ranks) leaves the next row one cell short.
      if (r.length === header.length - 1 && iArtist === header.length - 1 && prevArtist) r.push(prevArtist);
      if (r.length < header.length) continue;
      prevArtist = r[iArtist] || prevArtist;
      const rank = Number(r[iRank]);
      if (!Number.isInteger(rank) || !r[iTitle] || !r[iArtist]) continue;
      out.push({ chartYear, rank, title: r[iTitle], artist: r[iArtist] });
    }
    if (out.length) return out;
  }
  return [];
}

async function fetchYear(year) {
  const htmlPath = join(CACHE_DIR, "html", `${year}.json`);
  const cached = await readJson(htmlPath, null);
  if (cached) return { title: cached.title, rows: parseTable(cached.html, year) };
  const page = `Billboard_Year-End_Hot_100_singles_of_${year}`;
  const url =
    `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&redirects=1` +
    `&format=json&formatversion=2`;
  const res = await politeFetch(url, { minGapMs: 1500, headers: { "User-Agent": USER_AGENT } });
  const json = await res.json();
  if (json.error) return { title: page, rows: [] };
  await writeJson(htmlPath, { title: json.parse.title, html: json.parse.text });
  return { title: json.parse.title, rows: parseTable(json.parse.text, year) };
}

const cachePath = join(CACHE_DIR, "billboard.json");
const cache = await readJson(cachePath, { years: {} });
for (let year = FROM; year <= TO; year++) {
  const { title, rows } = await fetchYear(year);
  cache.years[year] = { page: title, rows };
  await writeJson(cachePath, cache);
  console.log(`${year}: ${rows.length} rows  (${title})`);
}

const summary = Object.entries(cache.years).map(([y, v]) => `${y}:${v.rows.length}`);
console.log("\nrows per year:", summary.join(" "));
