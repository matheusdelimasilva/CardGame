import { describe, expect, it } from "vitest";
import { Deezer, scoreCandidate } from "../src/deezer";

const t = (id: number, title: string, artist: string, rank = 500_000, preview = `https://cdn/x${id}.mp3?hdnea=exp=9999999999`) => ({
  id,
  title,
  artist: { name: artist },
  rank,
  preview,
});

describe("scoreCandidate", () => {
  const want = { title: "Africa", artist: "Toto" };
  it("rejects other songs and artists", () => {
    expect(scoreCandidate(want, t(1, "Rosanna", "Toto"))).toBeNull();
    expect(scoreCandidate(want, t(1, "Africa", "Weezer"))).toBeNull();
    expect(scoreCandidate(want, t(1, "Africa", "Toto", 1, ""))).toBeNull();
  });
  it("prefers the original over a more popular live version", () => {
    const live = scoreCandidate(want, t(1, "Africa (Live)", "Toto", 900_000))!;
    const orig = scoreCandidate(want, t(2, "Africa", "Toto", 200_000))!;
    expect(orig).toBeGreaterThan(live);
  });
  it("matches the primary artist of a featuring credit", () => {
    expect(scoreCandidate({ title: "One Sweet Day", artist: "Mariah Carey featuring Boyz II Men" }, t(1, "One Sweet Day", "Mariah Carey"))).not.toBeNull();
  });
});

describe("Deezer.findTrack", () => {
  it("falls back to a title-only search and caches the id", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      const data = url.includes("Laine") ? [] : [t(7, "That Lucky Old Sun", "Frankie Laine")];
      return new Response(JSON.stringify({ data }));
    }) as typeof fetch;
    const dz = new Deezer(fake);
    const song = { title: "That Lucky Old Sun", artist: "Frankie Laine" };
    expect((await dz.findTrack(song))?.id).toBe(7);
    expect(calls).toHaveLength(2);
    await dz.findTrack(song);
    expect(calls).toHaveLength(2); // cached
  });
});
