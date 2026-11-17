import test from "node:test";
import assert from "node:assert/strict";
import { applyAccepted } from "./apply.mjs";
const songs = [
  {
    title: "New",
    artist: "Artist",
    year: 1965,
    deezerId: null,
    mbid: null,
    yearSource: "chart-year",
  },
  { title: "Existing", artist: "Other", year: 1970, deezerId: 9 },
];
const evidence = {
  "Artist — New": { year: 1965, deezerId: 10, recordingMbid: "verified" },
};
test("offline replay adds verified identity and preserves every saved game key", () => {
  const result = applyAccepted(songs, evidence);
  assert.equal(result[0].deezerId, 10);
  assert.equal(result[0].yearSource, "musicbrainz");
  assert.equal(result[0].mbid, "verified");
  assert.equal(songs[0].deezerId, null);
  for (let i = 0; i < songs.length; i++)
    for (const k of ["title", "artist", "year"])
      assert.equal(result[i][k], songs[i][k]);
  assert.deepEqual(applyAccepted(result, evidence), result);
});
test("existing IDs remain unchanged", () =>
  assert.equal(
    applyAccepted(songs, {
      "Other — Existing": { year: 1970, deezerId: 999 },
    })[1].deezerId,
    9,
  ));
test("stale years, invalid IDs and duplicate IDs fail before writing", () => {
  for (const patch of [{ year: 1966 }, { deezerId: 9 }, { deezerId: -1 }])
    assert.throws(() =>
      applyAccepted(songs, {
        "Artist — New": { ...evidence["Artist — New"], ...patch },
      }),
    );
});
