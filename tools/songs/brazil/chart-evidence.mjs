// Preserve observations independently of the legacy builder's single chartRank.
import { norm } from "../normalize.mjs";
export const creditKey = (song) => `${norm(song.title)}|${norm(song.artist)}`;
export function chartObservations(cache) {
  return Object.entries(cache.pages ?? {}).flatMap(([page, data]) =>
    (data.rows ?? []).map((row) => ({
      title: row.title,
      artist: row.artist,
      chart: row.chart,
      chartYear: row.chartYear,
      position: Number.isInteger(row.rank) && row.rank > 0 ? row.rank : null,
      periodType: page.startsWith("Lista das canções mais executadas")
        ? "annual"
        : "unknown",
      // Existing caches omitted dates and inferred #1 for some tables. These
      // observations must be checked at the underlying source before acceptance.
      verification: "legacy-unverified",
      sourceUrl: `https://pt.wikipedia.org/wiki/${encodeURIComponent(page.replaceAll(" ", "_"))}`,
    })),
  );
}
export function candidateQueue(
  songs,
  observations,
  { from = 1960, to = 2026, limit = 200 } = {},
) {
  const grouped = new Map();
  for (const observation of observations) {
    const key = creditKey(observation);
    const list = grouped.get(key) ?? [];
    list.push(observation);
    grouped.set(key, list);
  }
  return songs
    .filter(
      (s) =>
        s.year >= from &&
        s.year <= to &&
        !s.deezerId &&
        grouped.has(creditKey(s)),
    )
    .map((song) => ({
      ...song,
      observations: grouped.get(creditKey(song)),
      state: "needs_recording_and_chart_verification",
    }))
    .sort(
      (a, b) =>
        Math.min(...a.observations.map((o) => o.position ?? Infinity)) -
          Math.min(...b.observations.map((o) => o.position ?? Infinity)) ||
        a.year - b.year,
    )
    .slice(0, limit);
}
