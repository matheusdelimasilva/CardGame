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
  it("rejects other recordings of the song unless asked for", () => {
    expect(scoreCandidate(want, t(1, "Africa (Live)", "Toto"))).toBeNull();
    expect(scoreCandidate(want, t(1, "Africa (Gigamesh Remix)", "Toto"))).toBeNull();
    expect(scoreCandidate(want, t(1, "Africa (Rerecorded)", "Toto"))).toBeNull();
    expect(scoreCandidate(want, t(1, "Africa (A Capella Mix)", "Toto"))).toBeNull();
    expect(scoreCandidate(want, t(1, "Africa (Single Version)", "Toto"))).not.toBeNull();
    expect(scoreCandidate(want, t(1, "Africa (2006 Remaster)", "Toto"))).not.toBeNull();
    expect(scoreCandidate({ title: "Ignition (Remix)", artist: "R. Kelly" }, t(1, "Ignition (Remix)", "R. Kelly"))).not.toBeNull();
  });
  it("rejects sound-alike uploads and empty normalised artists", () => {
    expect(scoreCandidate({ title: "Just Dance", artist: "Lady Gaga" }, t(1, "Just dance", "Made famous by Lady Gaga"))).toBeNull();
    expect(scoreCandidate({ title: "Hollaback Girl", artist: "Gwen Stefani" }, t(1, "Hollaback Girl", "Gwen Stefani Piano Tribute"))).toBeNull();
    expect(scoreCandidate({ title: "Rolling in the Deep", artist: "Adele" }, t(1, "Rolling In The Deep", "Hello I'm Adele"))).toBeNull();
    expect(scoreCandidate({ title: "I'll Be Missing You", artist: "Puff Daddy" }, t(1, "I'll Be Missing You", "코케"))).toBeNull();
  });
  it("needs the whole title, not a prefix", () => {
    expect(scoreCandidate({ title: "Hero", artist: "Mariah Carey" }, t(1, "Héroe", "Mariah Carey"))).toBeNull();
    expect(scoreCandidate({ title: "Somebody That I Used to Know", artist: "Gotye" }, t(1, "Somebody (2024)", "Gotye"))).toBeNull();
  });
  it("handles bracketed words, Part II and double A-sides", () => {
    expect(scoreCandidate({ title: "Whoomp! (There It Is)", artist: "Tag Team" }, t(1, "Whoomp! There It Is", "Tag Team"))).not.toBeNull();
    expect(scoreCandidate({ title: "Another Brick in the Wall, Part II", artist: "Pink Floyd" }, t(1, "Another Brick in the Wall, Pt. 2", "Pink Floyd"))).not.toBeNull();
    expect(scoreCandidate({ title: 'Maggie May"/"Reason to Believe', artist: "Rod Stewart" }, t(1, "Maggie May", "Rod Stewart"))).not.toBeNull();
  });
  it("rejects re-recordings and oddly named remixes", () => {
    const ls = { title: "Love Story", artist: "Taylor Swift" };
    expect(scoreCandidate(ls, t(1, "Love Story (Taylor’s Version)", "Taylor Swift"))).toBeNull();
    expect(scoreCandidate({ title: "Counting Stars", artist: "OneRepublic" }, t(1, "Counting Stars (2023 Version)", "OneRepublic"))).toBeNull();
    expect(scoreCandidate({ title: "Temperature", artist: "Sean Paul" }, t(1, "Temperature (GAMEBOYS RMX) (Radio Edit)", "Sean Paul"))).toBeNull();
    expect(scoreCandidate({ title: "He'll Have to Go", artist: "Jim Reeves" }, t(1, "He'll Have to Go (New Overdub)", "Jim Reeves"))).toBeNull();
    expect(scoreCandidate({ title: "I Like It", artist: "X" }, t(1, "I Like It (2002 Remastered Version)", "X"))).not.toBeNull();
  });
  it("accepts only tags known to be harmless", () => {
    const want = { title: "Apologize", artist: "OneRepublic" };
    expect(scoreCandidate(want, t(1, "Apologize (from One Night In Malibu)", "OneRepublic"))).toBeNull();
    expect(scoreCandidate(want, t(1, "Apologize (Commentary)", "OneRepublic"))).toBeNull();
    expect(scoreCandidate(want, t(1, "Apologize (Remastered 2009) (Single Version)", "OneRepublic"))).not.toBeNull();
    expect(scoreCandidate(want, t(1, 'Apologize (From "Some Film" Soundtrack)', "OneRepublic"))).not.toBeNull();
    expect(scoreCandidate({ title: "Trap Queen", artist: "Fetty Wap" }, t(1, "Trap Queen (feat. Quavo & Gucci Mane)", "Fetty Wap"))).toBeNull();
    expect(scoreCandidate({ title: "Smooth", artist: "Santana featuring Rob Thomas" }, t(1, "Smooth (feat. Rob Thomas)", "Santana"))).not.toBeNull();
  });
  it("accepts the act's name plus extra words", () => {
    expect(scoreCandidate({ title: "The Stripper", artist: "David Rose" }, t(1, "The Stripper", "David Rose Orchestra"))).not.toBeNull();
  });
  it("matches the primary artist of a featuring credit", () => {
    expect(scoreCandidate({ title: "One Sweet Day", artist: "Mariah Carey featuring Boyz II Men" }, t(1, "One Sweet Day", "Mariah Carey"))).not.toBeNull();
  });
});

describe("Deezer.findTrack", () => {
  it("accepts a feat. tag naming artists from the full credit", async () => {
    const fake = (async () => new Response(JSON.stringify({ data: [t(9, "Uptown Funk (feat. Bruno Mars)", "Mark Ronson")] }))) as typeof fetch;
    const hit = await new Deezer(fake).findTrack({ title: "Uptown Funk", artist: "Mark Ronson featuring Bruno Mars" });
    expect(hit?.id).toBe(9);
  });
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
