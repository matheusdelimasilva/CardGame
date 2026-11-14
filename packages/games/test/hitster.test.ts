import { describe, expect, it } from "vitest";
import { SONGS, fitsAt, hitster, songOf, type HitsterState } from "../src";

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
  it("has enough distinct, plausible songs for eight players", () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(8 * 10 + 20);
    expect(new Set(SONGS.map((s) => `${s.title}|${s.artist}`)).size).toBe(SONGS.length);
    for (const s of SONGS) {
      expect(s.title && s.artist).toBeTruthy();
      expect(s.year).toBeGreaterThanOrEqual(1900);
      expect(s.year).toBeLessThanOrEqual(2030);
    }
  });
});

describe("hitster", () => {
  it("starts everyone with one card and draws a song for the first player", () => {
    const s = start();
    for (const p of players) expect(years(s, p)).toHaveLength(1);
    expect(cards(s, "current")).toHaveLength(1);
    expect(cards(s, "deck")).toHaveLength(SONGS.length - players.length - 1);
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
    expect(totalCards(next)).toBe(SONGS.length);
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
    }
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
      expect(totalCards(s)).toBe(SONGS.length);
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
    const turns = SONGS.length + 20; // more passes than there are songs
    for (let i = 0; i < turns; i++) s = apply(s, current(s), { type: "pass" });
    expect(s.winners).toBeNull();
    expect(cards(s, "current")).toHaveLength(1);
    expect(totalCards(s)).toBe(SONGS.length);
  });

  it("with eight players always placing correctly, someone reaches ten cards", () => {
    let s = start(9, defaults, ["a", "b", "c", "d", "e", "f", "g", "h"]);
    for (let i = 0; i < 500 && !s.winners; i++) s = apply(s, current(s), { type: "place", index: spot(s, true)! });
    expect(s.winners).toEqual(["a"]);
    for (const p of s.players) expect(sorted(years(s, p))).toBe(true);
  });
});
