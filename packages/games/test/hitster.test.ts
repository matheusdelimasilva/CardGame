import { describe, expect, it } from "vitest";
import { DECK_SIZE, SONGS, fitsAt, hitster, songKey, songOf, type HitsterState } from "../src";

const players = ["a", "b", "c"];
const defaults = { cardsToWin: "10", showSongInfo: true };
const start = (seed = 11, settings: Record<string, string | boolean> = defaults, who = players) =>
  hitster.setup({ players: who, seed, settings });

const cards = (s: HitsterState, zone: string) => s.table.zones[zone]!.cards;
const years = (s: HitsterState, p: string) => cards(s, `timeline:${p}`).map((c) => songOf(c.face).year);
const currentYear = (s: HitsterState) => songOf(cards(s, "current")[0]!.face).year;
const current = (s: HitsterState) => s.players[s.turn]!;

function apply(s: HitsterState, player: string, move: unknown): HitsterState {
  const result = hitster.applyMove(s, player, move as never);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
/** A spot where the current song belongs (right) or does not (wrong), if one exists. */
function spot(s: HitsterState, right: boolean): number | null {
  const line = years(s, current(s));
  for (let i = 0; i <= line.length; i++) if (fitsAt(line, i, currentYear(s)) === right) return i;
  return null;
}
const totalCards = (s: HitsterState) => Object.values(s.table.zones).reduce((n, z) => n + z.cards.length, 0);
const sorted = (list: number[]) => list.every((y, i) => i === 0 || list[i - 1]! <= y);

describe("fitsAt", () => {
  it("accepts only positions that keep the timeline in order", () => {
    const line = [1970, 1985, 1985, 2001];
    expect([0, 1, 2, 3, 4].map((i) => fitsAt(line, i, 1990))).toEqual([false, false, false, true, false]);
    expect([0, 1, 2, 3, 4].map((i) => fitsAt(line, i, 1960))).toEqual([true, false, false, false, false]);
    expect([0, 1, 2, 3, 4].map((i) => fitsAt(line, i, 2020))).toEqual([false, false, false, false, true]);
  });

  it("lets a song from the same year as a neighbour go on either side of it", () => {
    expect([0, 1].map((i) => fitsAt([1985], i, 1985))).toEqual([true, true]);
    expect([0, 1, 2, 3, 4].map((i) => fitsAt([1970, 1985, 1985, 2001], i, 1985))).toEqual([false, true, true, true, false]);
  });

  it("accepts anything in an empty timeline", () => {
    expect(fitsAt([], 0, 1999)).toBe(true);
  });
});

describe("song list", () => {
  it("renders unknown timeline and current cards as placeholders but rejects them for play", () => {
    const state = start();
    cards(state, "timeline:a")[0]!.face = "Removed|Artist";
    cards(state, "current")[0]!.face = "Removed|Artist";
    const view = hitster.view(state, null);
    expect(view.timelines.a![0]).toMatchObject({ title: "Unknown song", artist: "Unknown artist", year: 0 });
    expect(view.current).toMatchObject({ title: "Unknown song", artist: "Unknown artist" });
    expect(() => hitster.validateState!(state)).toThrow("Unknown song card");
  });

  it("has plenty of well-formed songs, each with its own key", () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(DECK_SIZE);
    expect(new Set(SONGS.map(songKey)).size).toBe(SONGS.length);
    for (const s of SONGS) {
      expect(s.title && s.artist).toBeTruthy();
      expect(Number.isInteger(s.year) && s.year >= 1900 && s.year <= 2100).toBe(true);
      expect(s.deezerId === null || s.deezerId > 0).toBe(true);
      expect(songOf(songKey(s))).toBe(s);
    }
  });

  it("deals a different sample of songs for a different seed, and the same one for the same seed", () => {
    const faces = (seed: number) => Object.values(start(seed).table.zones).flatMap((z) => z.cards.map((c) => c.face)).sort();
    expect(faces(1)).toEqual(faces(1));
    expect(faces(1)).not.toEqual(faces(2));
    expect(new Set(faces(1)).size).toBe(DECK_SIZE);
  });
});

describe("hitster", () => {
  it("starts everyone with one card and draws a song for the first player", () => {
    const s = start();
    for (const p of players) expect(years(s, p)).toHaveLength(1);
    expect(cards(s, "current")).toHaveLength(1);
    expect(cards(s, "deck")).toHaveLength(DECK_SIZE - players.length - 1);
    expect(hitster.activePlayers(s)).toEqual(["a"]);
  });

  it("keeps a correctly placed song, in order, and passes the turn", () => {
    const s = start();
    const year = currentYear(s);
    const next = apply(s, "a", { type: "place", index: spot(s, true)! });
    expect(years(next, "a")).toHaveLength(2);
    expect(years(next, "a")).toContain(year);
    expect(sorted(years(next, "a"))).toBe(true);
    expect(next.lastTurn).toMatchObject({ player: "a", outcome: "correct", turnNumber: 1 });
    expect(current(next)).toBe("b");
    expect(cards(next, "current")).toHaveLength(1);
    expect(totalCards(next)).toBe(DECK_SIZE);
  });

  it("discards a wrongly placed song face up and leaves the timeline alone", () => {
    const s = start();
    const before = years(s, "a");
    const next = apply(s, "a", { type: "place", index: spot(s, false)! });
    expect(years(next, "a")).toEqual(before);
    expect(cards(next, "discard")).toHaveLength(1);
    expect(cards(next, "discard")[0]!.visibleTo).toBe("all");
    expect(next.lastTurn).toMatchObject({ player: "a", outcome: "wrong" });
    expect(next.lastTurn!.song.year).toBe(currentYear(s));
  });

  it("does not change the state it was given", () => {
    const s = start();
    const snapshot = JSON.stringify(s);
    apply(s, "a", { type: "place", index: 0 });
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("rejects moves out of turn, bad positions and unknown moves", () => {
    const s = start();
    expect(hitster.applyMove(s, "b", { type: "place", index: 0 })).toEqual({ ok: false, error: "It is not your turn." });
    for (const index of [-1, 2, 0.5, NaN, "0", undefined]) {
      expect(hitster.applyMove(s, "a", { type: "place", index } as never).ok).toBe(false);
    }
    expect(hitster.applyMove(s, "a", { type: "nope" } as never).ok).toBe(false);
  });

  it("passes for an absent player: the song is discarded", () => {
    const s = start();
    expect(hitster.autoMove!(s, "b")).toBeNull();
    const next = apply(s, "a", hitster.autoMove!(s, "a"));
    expect(next.lastTurn!.outcome).toBe("passed");
    expect(years(next, "a")).toHaveLength(1);
    expect(current(next)).toBe("b");
  });

  it("never shows the year of the song being placed, to anyone", () => {
    const s = start();
    for (const viewer of [...players, null]) {
      const view = hitster.view(s, viewer);
      expect(Object.keys(view.current!).sort()).toEqual(["artist", "id", "title"]);
      expect(view.current!.title).toBe(songOf(cards(s, "current")[0]!.face).title);
      expect(view.timelines.a![0]!.year).toBe(years(s, "a")[0]);
      // Deezer ids would identify the song, and so its year: they stay on the server.
      expect(JSON.stringify(view)).not.toContain("deezerId");
    }
  });

  it("names the song to play on the server side only, and only deals songs that can be played", () => {
    const s = start();
    const song = songOf(cards(s, "current")[0]!.face);
    expect(hitster.currentTrack!(s)).toEqual({ title: song.title, artist: song.artist, deezerId: song.deezerId });
    for (const zone of Object.values(s.table.zones)) {
      for (const card of zone.cards) expect(songOf(card.face).deezerId).not.toBeNull();
    }
  });

  it("has no song to play once the game is over", () => {
    let s = start(5, { cardsToWin: "5", showSongInfo: false });
    for (let i = 0; i < 100 && !s.winners; i++) {
      s = apply(s, current(s), current(s) === "a" ? { type: "place", index: spot(s, true)! } : { type: "pass" });
    }
    expect(hitster.currentTrack!(s)).toBeNull();
  });

  it("hides the title and artist too when that setting is off", () => {
    const view = hitster.view(start(11, { cardsToWin: "10", showSongInfo: false }), "a");
    expect(view.current).toMatchObject({ title: null, artist: null });
  });

  it("ends as soon as a timeline reaches the target", () => {
    let s = start(5, { cardsToWin: "5", showSongInfo: true });
    // Player a always places correctly; the others always pass.
    for (let i = 0; i < 100 && !s.winners; i++) {
      s = apply(s, current(s), current(s) === "a" ? { type: "place", index: spot(s, true)! } : { type: "pass" });
      expect(totalCards(s)).toBe(DECK_SIZE);
    }
    expect(hitster.result(s)).toEqual({ winners: ["a"] });
    expect(years(s, "a")).toHaveLength(5);
    expect(sorted(years(s, "a"))).toBe(true);
    expect(hitster.activePlayers(s)).toEqual([]);
    expect(hitster.view(s, null)).toMatchObject({ current: null, currentPlayer: null });
    expect(hitster.applyMove(s, "a", { type: "pass" }).ok).toBe(false);
  });

  it("reshuffles the discard pile when the deck runs out", () => {
    let s = start(3, defaults, ["a", "b"]);
    const turns = DECK_SIZE + 20; // more passes than there are cards
    for (let i = 0; i < turns; i++) s = apply(s, current(s), { type: "pass" });
    expect(s.winners).toBeNull();
    expect(cards(s, "current")).toHaveLength(1);
    expect(totalCards(s)).toBe(DECK_SIZE);
  });

  it("with eight players always placing correctly, someone reaches ten cards", () => {
    let s = start(9, defaults, ["a", "b", "c", "d", "e", "f", "g", "h"]);
    for (let i = 0; i < 500 && !s.winners; i++) s = apply(s, current(s), { type: "place", index: spot(s, true)! });
    expect(s.winners).toEqual(["a"]);
    for (const p of s.players) expect(sorted(years(s, p))).toBe(true);
  });
});
