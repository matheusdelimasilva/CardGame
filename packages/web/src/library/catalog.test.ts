import { expect, it } from "vitest";
import { catalog, filterSongs, missingFields } from "./catalog";
const defaults = { query: "", list: "", decade: "", quality: "", source: "" };
it("searches Brazilian names without requiring accents", () => {
  const rows = filterSongs({ ...defaults, query: "alcantara odeon" });
  expect(rows.some((s) => s.title === "Odeon")).toBe(true);
});
it("combines catalog, decade, source and missing-preview filters", () => {
  const rows = filterSongs({
    ...defaults,
    list: "brasil",
    decade: "1910",
    quality: "missing",
    source: "wikipedia",
  });
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every(
      (s) =>
        s.catalog === "brasil" &&
        s.year >= 1910 &&
        s.year < 1920 &&
        s.deezerId === null &&
        s.yearSource === "wikipedia",
    ),
  ).toBe(true);
});
it("partitions the catalog into matched and missing IDs", () => {
  expect(
    filterSongs({ ...defaults, quality: "missing" }).length +
      filterSongs({ ...defaults, quality: "matched" }).length,
  ).toBe(catalog.length);
  expect(filterSongs({ ...defaults, query: "no-such-song-abcdef" })).toEqual(
    [],
  );
});

it("separates ranked and unranked songs while preserving combined filters", () => {
  const scope = { ...defaults, list: "brasil", decade: "1960" };
  const ranked = filterSongs({ ...scope, quality: "ranked" });
  const unranked = filterSongs({ ...scope, quality: "unranked" });
  expect(ranked.length + unranked.length).toBe(filterSongs(scope).length);
  expect(unranked.length).toBeGreaterThan(0);
  expect(ranked.every((s) => s.chartRank != null)).toBe(true);
  expect(unranked.every((s) => s.chartRank == null)).toBe(true);
});
it("identifies absent fields and does not mistake year fallbacks for missing metadata", () => {
  const complete = {
    ...catalog[0]!,
    title: "Example",
    artist: "Artist",
    year: 2000,
    yearSource: "chart-year",
    chartRank: 1,
    chartYear: 2001,
    mbid: "recording-id",
    deezerId: 123,
  };
  expect(missingFields(complete)).toEqual([]);
  expect(missingFields({ ...complete, chartRank: null, mbid: null })).toEqual([
    "Chart rank",
    "MusicBrainz ID",
  ]);
  expect(
    missingFields({
      ...complete,
      title: " ",
      artist: "",
      year: 0,
      yearSource: "",
    }),
  ).toEqual(["Title", "Artist", "Release year", "Year source"]);
});
it("missing-information results include missing IDs or chart fields without double-counting records", () => {
  const rows = filterSongs({ ...defaults, quality: "incomplete" });
  expect(rows.length).toBeGreaterThan(0);
  expect(new Set(rows.map((s) => s.id)).size).toBe(rows.length);
  expect(rows.every((s) => missingFields(s).length > 0)).toBe(true);
  for (const quality of [
    "unranked",
    "missing-chart-year",
    "missing-mbid",
    "missing",
    "missing-core",
  ]) {
    const ids = new Set(rows.map((s) => s.id));
    expect(
      filterSongs({ ...defaults, quality }).every((s) => ids.has(s.id)),
    ).toBe(true);
  }
});
