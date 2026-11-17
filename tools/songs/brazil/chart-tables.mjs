// Pure parser: a missing rank is unknown unless the source explicitly lists #1 songs.
export function rowsFromTables(
  tables,
  chartYear,
  chart,
  { numberOne = false } = {},
) {
  const out = [];
  for (const rows of tables) {
    const artistHeader = /^(artista|cantor|int[ée]rprete)/i;
    const hi = rows.findIndex(
      (r) =>
        r.some((c) => /^(can[çc][ãa]o|single|t[íi]tulo)/i.test(c)) &&
        r.some((c) => artistHeader.test(c)),
    );
    if (hi < 0) continue;
    const h = rows[hi];
    const iTitle = h.findIndex((c) =>
      /^(can[çc][ãa]o|single|t[íi]tulo)/i.test(c),
    );
    const iArtist = h.findIndex((c) => artistHeader.test(c));
    const iRank = h.findIndex((c) => /^(posi|#|n\.?º|rank)/i.test(c));
    for (const r of rows.slice(hi + 1)) {
      const title = r[iTitle],
        artist = r[iArtist];
      if (!title || !artist) continue;
      const rank =
        iRank >= 0 && r[iRank]?.trim()
          ? Number(r[iRank])
          : numberOne
            ? 1
            : null;
      if (rank !== null && (!Number.isInteger(rank) || rank < 1)) continue;
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
