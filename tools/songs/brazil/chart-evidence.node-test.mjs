import assert from "node:assert/strict";
import { test } from "node:test";
import { rowsFromTables } from "./chart-tables.mjs";
import { chartObservations, candidateQueue } from "./chart-evidence.mjs";
test("unranked tables cannot create a #1 claim; explicit number-one sources can", () => {
  const tables = [
    [
      ["Título", "Artista"],
      ["Song", "Singer"],
    ],
  ];
  assert.equal(rowsFromTables(tables, 1980, "Example")[0].rank, null);
  assert.equal(
    rowsFromTables(tables, 1980, "Example", { numberOne: true })[0].rank,
    1,
  );
  assert.equal(
    rowsFromTables(
      [
        [
          ["Posição", "Título", "Artista"],
          ["0", "Song", "Singer"],
        ],
      ],
      1980,
      "Example",
    ).length,
    0,
  );
});
test("multiple chart appearances survive and do not replace release years", () => {
  const row = {
    title: "Song",
    artist: "Singer",
    chart: "Example",
    rank: 12,
    chartYear: 1981,
  };
  const observations = chartObservations({
    pages: {
      "Lista das canções mais executadas no Brasil em 1981": { rows: [row] },
      Other: { rows: [{ ...row, rank: 3, chartYear: 1982 }] },
    },
  });
  const queue = candidateQueue(
    [{ title: "Song", artist: "Singer", year: 1980, deezerId: null }],
    observations,
  );
  assert.equal(queue[0].year, 1980);
  assert.equal(queue[0].observations.length, 2);
  assert.equal(queue[0].observations[0].verification, "legacy-unverified");
  assert.equal(queue[0].observations[1].periodType, "unknown");
});
