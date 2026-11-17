import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCandidate } from "./accept-chart-candidates.mjs";
const item = {
  song: {
    title: "Hit",
    observations: [
      {
        chartYear: 1980,
        position: 4,
        rawTitle: "Hit",
        verification: "scan-verified",
      },
    ],
  },
  metadata: { id: 123, title: "Hit", artist: "Singer", isrc: "ABC" },
  preview: { ok: true },
};
const recording = {
  recordings: [
    {
      score: 100,
      title: "Hit",
      artist: "Singer",
      artistIds: ["singer"],
      firstRelease: "1979-12-01",
      mbid: "recording",
    },
  ],
};
const artists = { singer: { country: "BR" } };
test("accepts a supported recording year separately from chart year and preserves verified rank", () => {
  const x = assessCandidate(item, recording, artists);
  assert.equal(x.song.year, 1979);
  assert.equal(x.song.provenance.chartObservations[0].chartYear, 1980);
  assert.equal(x.song.provenance.chartObservations[0].position, 4);
});
test("never promotes unverified cached ranks or assigns a studio rank to a live version", () => {
  const live = structuredClone(item);
  live.metadata.title = "Hit (Ao Vivo)";
  const x = assessCandidate(live, recording, artists);
  assert.equal(x.song.title, "Hit (Ao Vivo)");
  assert.equal(x.song.provenance.chartObservations[0].position, null);
  assert.equal(
    x.song.provenance.chartObservations[0].unverifiedPositionClaim,
    4,
  );
  const cached = structuredClone(item);
  cached.song.observations[0].verification = "legacy-unverified";
  assert.equal(
    assessCandidate(cached, recording, artists).song.provenance
      .chartObservations[0].position,
    null,
  );
});
test("holds post-chart rerecordings, foreign acts, ambiguous ISRCs and duplicates", () => {
  const late = structuredClone(recording);
  late.recordings[0].firstRelease = "2017-01-01";
  assert.equal(assessCandidate(item, late, artists).accepted, false);
  assert.equal(
    assessCandidate(item, recording, { singer: { country: "GB" } }).accepted,
    false,
  );
  assert.equal(
    assessCandidate(
      item,
      { recordings: [...recording.recordings, ...recording.recordings] },
      artists,
    ).accepted,
    false,
  );
  assert.equal(
    assessCandidate(item, recording, artists, new Set([123])).accepted,
    false,
  );
});
