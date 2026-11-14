// Minimal pt.wikipedia helpers: API fetch + wikitext table / infobox parsing.
import { USER_AGENT, politeFetch } from "../lib.mjs";

const API = "https://pt.wikipedia.org/w/api.php";

export async function wikiApi(params) {
  const qs = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await politeFetch(`${API}?${qs}`, { minGapMs: 1500, headers: { "User-Agent": USER_AGENT } });
  return res.json();
}

export async function getWikitext(page) {
  const j = await wikiApi({ action: "parse", prop: "wikitext", redirects: "1", page });
  return j.error ? null : j.parse.wikitext;
}

// Split on `sep` only at bracket depth 0 ([[ ]], {{ }}).
function splitTop(s, sep) {
  const out = [];
  let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") { depth++; cur += two; i++; continue; }
    if ((two === "]]" || two === "}}") && depth > 0) { depth--; cur += two; i++; continue; }
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ""; i += sep.length - 1; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

// Wikitext markup -> plain text.
export function plain(s) {
  return s
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\{\{(?:small|nowrap)\|([^{}]*)\}\}/gi, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“]([\s\S]*)["”]$/, "$1") // strip a whole-title wrapper, not the quote in '"P" da Vida'
    .trim();
}

// Parse every wikitable into rows of plain-text cells, expanding rowspans.
export function parseTables(wikitext) {
  const tables = [];
  const re = /\{\|([\s\S]*?)\n\|\}/g;
  let m;
  while ((m = re.exec(wikitext))) {
    const body = m[1].split("\n").slice(1).join("\n"); // drop table attributes line
    const rawRows = body.split(/\n\|-[^\n]*/);
    const rows = [];
    let pending = []; // pending[col] = { text, left }
    for (const raw of rawRows) {
      const cells = [];
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("|+")) continue;
        if (t[0] !== "|" && t[0] !== "!") {
          if (cells.length) cells[cells.length - 1].raw += " " + t; // continuation line
          continue;
        }
        const sep = t[0] === "!" ? /!!|\|\|/ : /\|\|/;
        for (const part of t.slice(1).split(sep)) {
          const pieces = splitTop(part, "|");
          let attrs = "", content = part;
          if (pieces.length > 1 && /^[^[{]*=/.test(pieces[0])) { attrs = pieces[0]; content = pieces.slice(1).join("|"); }
          const span = Number(/rowspan\s*=\s*"?(\d+)/i.exec(attrs)?.[1] ?? 1);
          cells.push({ raw: content, span, header: t[0] === "!" });
        }
      }
      if (!cells.length) continue;
      // Merge rowspan carry-overs into this row.
      const row = [];
      let ci = 0;
      for (let col = 0; ci < cells.length || pending.some((p, i) => i >= col && p?.left > 0); col++) {
        if (pending[col]?.left > 0) {
          row.push(pending[col].text);
          pending[col].left--;
          continue;
        }
        if (ci >= cells.length) break;
        const c = cells[ci++];
        const text = plain(c.raw);
        row.push(text);
        pending[col] = c.span > 1 ? { text, left: c.span - 1 } : undefined;
      }
      rows.push(row);
    }
    tables.push(rows);
  }
  return tables;
}

// Read `|key = value` from the first infobox (value up to the next top-level `|`).
export function infobox(wikitext, keys) {
  const start = wikitext.search(/\{\{\s*Info\//i);
  if (start < 0) return {};
  let depth = 0, end = start;
  for (let i = start; i < wikitext.length - 1; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === "{{") { depth++; i++; } else if (two === "}}") { depth--; i++; if (!depth) { end = i; break; } }
  }
  const box = wikitext.slice(start + 2, end - 1);
  const out = {};
  for (const field of splitTop(box, "|").slice(1)) {
    const eq = field.indexOf("=");
    if (eq < 0) continue;
    const k = field.slice(0, eq).trim().toLowerCase();
    if (keys.includes(k)) out[k] = plain(field.slice(eq + 1).replace(/<!--[\s\S]*?-->/g, ""));
  }
  return out;
}
