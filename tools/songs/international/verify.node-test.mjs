import test from "node:test";
import assert from "node:assert/strict";
import { verifyRecording, isAudio } from "./verify.mjs";
const song = { title: "Example Song", artist: "Example Artist", year: 1965 };
const track = {
  id: 1,
  title: song.title,
  artist: { name: song.artist },
  isrc: "USABC6500001",
  preview: "https://example.test/audio",
  readable: true,
  duration: 180,
};
const recording = {
  id: "recording",
  title: song.title,
  "artist-credit": [{ name: song.artist }],
  isrcs: [track.isrc],
  length: 180000,
  "first-release-date": "1965-04-01",
};
test("accepts corroborated recording; compilation date does not replace original year", () =>
  assert.equal(
    verifyRecording(song, { ...track, release_date: "2015-01-01" }, recording),
    null,
  ));
test("rejects different performer, recording version, year, ISRC, or duration", () => {
  for (const patch of [
    { "artist-credit": [{ name: "Another Artist" }] },
    { title: "Example Song (Live)" },
    { disambiguation: "1998 re-recording" },
    { "first-release-date": "1966" },
    { isrcs: ["USABC6500002"] },
    { length: 200000 },
  ])
    assert.notEqual(
      verifyRecording(song, track, { ...recording, ...patch }),
      null,
    );
});
test("missing date or duration cannot silently pass", () => {
  assert.equal(
    verifyRecording(song, track, { ...recording, length: null }),
    "duration",
  );
  assert.equal(
    verifyRecording(song, track, { ...recording, "first-release-date": null }),
    "release-year",
  );
});
test("rejects lookalike track and absent preview", () => {
  assert.equal(
    verifyRecording(
      song,
      { ...track, title: "Example Song (Remix)" },
      recording,
    ),
    "track-identity",
  );
  assert.equal(
    verifyRecording(song, { ...track, preview: "" }, recording),
    "preview-metadata",
  );
});
test("audio checks reject HTML, empty responses, and mislabeled nonaudio payloads", () => {
  const bytes = new Uint8Array(2048);
  bytes.set([73, 68, 51]);
  assert.equal(isAudio(bytes, "audio/mpeg"), true);
  assert.equal(isAudio(bytes, "text/html"), false);
  assert.equal(isAudio(new Uint8Array(2048), "audio/mpeg"), false);
  assert.equal(isAudio(new Uint8Array(0), "audio/mpeg"), false);
});
test("conflicting single dates are reviewed even with matching ISRC and MB date", () => {
  assert.equal(
    verifyRecording(
      song,
      { ...track, album: { title: song.title }, release_date: "1966-02-07" },
      recording,
    ),
    "single-release-year-conflict",
  );
  assert.equal(
    verifyRecording(song, { ...track, release_date: "1964-01-01" }, recording),
    "earlier-deezer-release",
  );
  assert.equal(
    verifyRecording(
      { ...song, title: "Example Song / Other Song" },
      track,
      recording,
    ),
    "combined-title",
  );
});
