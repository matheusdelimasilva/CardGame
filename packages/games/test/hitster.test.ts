import { describe, expect, it } from "vitest";
import {
  DECK_SIZE,
  INTRO_MS,
  REVEAL_MS,
  WIN_REVEAL_MS,
  SONGS,
  SONG_LISTS,
  fitsAt,
  hitster,
  songKey,
  songOf,
  type HitsterState,
  type SongListId,
} from "../src";

const players = ["a", "b", "c"];
const defaults = { cardsToWin: "10", showSongInfo: true };
const lists: SongListId[] = ["international", "brasil"];
const start = (
  seed = 11,
  settings: Record<string, string | boolean> = defaults,
  who = players,
) => hitster.resume!(hitster.setup({ players: who, seed, settings }));

const cards = (s: HitsterState, zone: string) => s.table.zones[zone]!.cards;
const years = (s: HitsterState, p: string) =>
  cards(s, `timeline:${p}`).map((c) => songOf(c.face, s.songList).year);
const currentYear = (s: HitsterState) =>
  songOf(cards(s, "current")[0]!.face, s.songList).year;
const current = (s: HitsterState) => s.players[s.turn]!;

function apply(s: HitsterState, player: string, move: unknown): HitsterState {
  const result = hitster.applyMove(s, player, move as never);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const complete = (s: HitsterState, player: string, move: unknown) =>
  hitster.resume!(apply(s, player, move));
/** A spot where the current song belongs (right) or does not (wrong), if one exists. */
function spot(s: HitsterState, right: boolean): number | null {
  const line = years(s, current(s));
  for (let i = 0; i <= line.length; i++)
    if (fitsAt(line, i, currentYear(s)) === right) return i;
  return null;
}
const totalCards = (s: HitsterState) =>
  Object.values(s.table.zones).reduce((n, z) => n + z.cards.length, 0);
const sorted = (list: number[]) =>
  list.every((y, i) => i === 0 || list[i - 1]! <= y);

describe("fitsAt", () => {
  it("accepts only positions that keep the timeline in order", () => {
    const line = [1970, 1985, 1985, 2001];
    expect([0, 1, 2, 3, 4].map((i) => fitsAt(line, i, 1990))).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
    expect([0, 1, 2, 3, 4].map((i) => fitsAt(line, i, 1960))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect([0, 1, 2, 3, 4].map((i) => fitsAt(line, i, 2020))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("lets a song from the same year as a neighbour go on either side of it", () => {
    expect([0, 1].map((i) => fitsAt([1985], i, 1985))).toEqual([true, true]);
    expect(
      [0, 1, 2, 3, 4].map((i) => fitsAt([1970, 1985, 1985, 2001], i, 1985)),
    ).toEqual([false, true, true, true, false]);
  });

  it("accepts anything in an empty timeline", () => {
    expect(fitsAt([], 0, 1999)).toBe(true);
  });
});

describe("song list", () => {
  it.each(lists)(
    "renders stale %s cards as placeholders but rejects them for play",
    (songList) => {
      const state = start(11, { ...defaults, songList });
      cards(state, "timeline:a")[0]!.face = "Removed|Artist";
      cards(state, "current")[0]!.face = "Removed|Artist";
      const view = hitster.view(state, null);
      expect(view.timelines.a![0]).toMatchObject({
        title: "Unknown song",
        artist: "Unknown artist",
        year: 0,
      });
      expect(view.current).toMatchObject({
        title: "Unknown song",
        artist: "Unknown artist",
      });
      expect(() => hitster.validateState!(state)).toThrow("Unknown song card");
    },
  );

  it.each(lists)(
    "has plenty of well-formed %s songs, each with its own key",
    (songList) => {
      const songs = SONG_LISTS[songList];
      expect(songs.length).toBeGreaterThanOrEqual(DECK_SIZE);
      expect(new Set(songs.map(songKey)).size).toBe(songs.length);
      for (const s of songs) {
        expect(s.title && s.artist).toBeTruthy();
        expect(
          Number.isInteger(s.year) && s.year >= 1900 && s.year <= 2100,
        ).toBe(true);
        expect(s.deezerId === null || s.deezerId > 0).toBe(true);
        expect(songOf(songKey(s), songList)).toBe(s);
      }
    },
  );

  it.each(lists)(
    "sets up, restores and plays using only the %s list",
    (songList) => {
      const initial = start(11, { ...defaults, songList });
      expect(initial.songList).toBe(songList);
      const state: HitsterState = JSON.parse(JSON.stringify(initial));
      expect(() => hitster.validateState!(state)).not.toThrow();
      expect(totalCards(state)).toBe(DECK_SIZE);
      for (const zone of Object.values(state.table.zones)) {
        for (const card of zone.cards) {
          const song = songOf(card.face, songList);
          expect(SONG_LISTS[songList]).toContain(song);
          expect(song.deezerId).not.toBeNull();
        }
      }
      const song = songOf(cards(state, "current")[0]!.face, songList);
      expect(hitster.currentTrack!(state)).toEqual({
        title: song.title,
        artist: song.artist,
        deezerId: song.deezerId,
      });
      expect(hitster.view(state, null).timelines.a![0]!.year).toBe(
        years(state, "a")[0],
      );
      const next = apply(state, "a", {
        type: "place",
        index: spot(state, true)!,
      });
      expect(next.lastTurn).toMatchObject({
        outcome: "correct",
        song: { title: song.title, artist: song.artist, year: song.year },
      });
      expect(next.songList).toBe(songList);
    },
  );

  it.each(lists)(
    "does not accept a key that exists only in the other list for %s",
    (songList) => {
      const other = songList === "brasil" ? "international" : "brasil";
      const keys = new Set(SONG_LISTS[songList].map(songKey));
      const foreign = SONG_LISTS[other].find(
        (song) => !keys.has(songKey(song)),
      )!;
      const state = start(11, { ...defaults, songList });
      cards(state, "current")[0]!.face = songKey(foreign);
      expect(() => hitster.validateState!(state)).toThrow("Unknown song card");
      expect(() => hitster.currentTrack!(state)).toThrow("Unknown song card");
      expect(hitster.view(state, null).current!.title).toBe("Unknown song");
    },
  );

  it.each(lists)(
    "resolves shared song keys against the saved %s list",
    (songList) => {
      const shared = SONGS.find((song) =>
        SONG_LISTS.brasil.some(
          (other) =>
            songKey(song) === songKey(other) && song.year !== other.year,
        ),
      )!;
      expect(shared).toBeDefined();
      const key = songKey(shared);
      const song = songOf(key, songList);
      const state = start(11, { ...defaults, songList });
      cards(state, "current")[0]!.face = key;
      cards(state, "timeline:a")[0]!.face = key;
      expect(hitster.view(state, null).timelines.a![0]).toMatchObject({
        title: song.title,
        artist: song.artist,
        year: song.year,
      });
      expect(hitster.currentTrack!(state)).toEqual({
        title: song.title,
        artist: song.artist,
        deezerId: song.deezerId,
      });
      for (const index of [0, 1]) {
        const next = apply(state, "a", { type: "place", index });
        expect(next.lastTurn).toMatchObject({
          outcome: "correct",
          song: { year: song.year },
        });
      }
    },
  );

  it("defaults to International for new and legacy saved games", () => {
    const state = start();
    expect(state.songList).toBe("international");
    expect(state).toEqual(
      start(11, { ...defaults, songList: "international" }),
    );
    const legacy = structuredClone(state);
    delete legacy.songList;
    expect(() => hitster.validateState!(legacy)).not.toThrow();
    expect(hitster.view(legacy, null)).toEqual(hitster.view(state, null));
    expect(hitster.currentTrack!(legacy)).toEqual(hitster.currentTrack!(state));
    expect(
      hitster.applyMove(legacy, "a", {
        type: "place",
        index: spot(state, true)!,
      }),
    ).toMatchObject({ ok: true, state: { lastTurn: { outcome: "correct" } } });
  });

  it("deals a different sample of songs for a different seed, and the same one for the same seed", () => {
    const faces = (seed: number) =>
      Object.values(start(seed).table.zones)
        .flatMap((z) => z.cards.map((c) => c.face))
        .sort();
    expect(faces(1)).toEqual(faces(1));
    expect(faces(1)).not.toEqual(faces(2));
    expect(new Set(faces(1)).size).toBe(DECK_SIZE);
  });
});

describe("hitster", () => {
  it("starts with a silent intro, refuses moves, then resumes the first player's fresh song without advancing", () => {
    const state = hitster.setup({ players, seed: 11, settings: defaults });
    const original = structuredClone(state);
    expect(state.intro).toBe(true);
    expect(hitster.pauseMs!(state)).toBe(INTRO_MS);
    expect(INTRO_MS).toBe(12000);
    expect(hitster.currentTrack!(state)).toBeNull();
    expect(hitster.view(state, null)).toMatchObject({
      intro: true,
      current: null,
      currentPlayer: "a",
      turnNumber: 1,
    });
    expect(hitster.activePlayers(state)).toEqual([]);
    for (const player of players) {
      expect(hitster.autoMove!(state, player)).toBeNull();
      expect(hitster.applyMove(state, player, { type: "pass" }).ok).toBe(false);
      expect(
        hitster.applyMove(state, player, { type: "place", index: 0 }).ok,
      ).toBe(false);
    }
    const resumed = hitster.resume!(state);
    expect(state).toEqual(original);
    expect(resumed).toMatchObject({
      intro: false,
      turn: 0,
      turnNumber: 1,
      lastTurn: null,
    });
    expect(hitster.currentTrack!(resumed)).not.toBeNull();
    expect(hitster.view(resumed, null).current).not.toBeNull();
    expect(hitster.activePlayers(resumed)).toEqual(["a"]);
    expect(hitster.pauseMs!(resumed)).toBeNull();
    expect(hitster.applyMove(resumed, "a", { type: "pass" }).ok).toBe(true);
  });

  it("treats legacy saved states without intro as already playing", () => {
    const state = start();
    const legacy = structuredClone(state);
    delete legacy.intro;
    expect(hitster.pauseMs!(legacy)).toBeNull();
    expect(hitster.view(legacy, null)).toEqual(hitster.view(state, null));
    expect(hitster.currentTrack!(legacy)).toEqual(hitster.currentTrack!(state));
    expect(hitster.activePlayers(legacy)).toEqual(["a"]);
    expect(hitster.resume!(legacy)).toEqual(legacy);
  });
  it.each(["correct", "wrong", "passed"] as const)(
    "holds a %s result without advancing or changing the recording",
    (outcome) => {
      const state = start();
      const before = structuredClone(state);
      const track = hitster.currentTrack!(state);
      const move =
        outcome === "passed"
          ? ({ type: "pass" } as const)
          : ({
              type: "place",
              index: spot(state, outcome === "correct")!,
            } as const);
      const revealed = apply(state, "a", move);
      expect(state).toEqual(before);
      expect(revealed).toMatchObject({
        revealing: true,
        turn: 0,
        turnNumber: 1,
        winners: null,
      });
      expect(revealed.lastTurn).toMatchObject({
        outcome,
        ...(move.type === "place" ? { index: move.index } : {}),
      });
      if (move.type === "pass")
        expect(revealed.lastTurn).not.toHaveProperty("index");
      expect(cards(revealed, "current")).toHaveLength(0);
      expect(cards(revealed, "deck")).toHaveLength(cards(state, "deck").length);
      expect(hitster.view(revealed, null)).toMatchObject({
        revealing: true,
        current: null,
        currentPlayer: "a",
        nextPlayer: "b",
      });
      expect(hitster.currentTrack!(revealed)).toEqual(track);
      expect(hitster.pauseMs!(revealed)).toBe(REVEAL_MS);
      expect(hitster.activePlayers(revealed)).toEqual([]);
      for (const player of players) {
        expect(hitster.autoMove!(revealed, player)).toBeNull();
        for (const move of [
          { type: "pass" },
          { type: "place", index: 0 },
        ] as const)
          expect(hitster.applyMove(revealed, player, move).ok).toBe(false);
      }
      const held = structuredClone(revealed);
      const resumed = hitster.resume!(revealed);
      expect(revealed).toEqual(held);
      expect(resumed).toMatchObject({
        revealing: false,
        turn: 1,
        turnNumber: 2,
        winners: null,
      });
      expect(cards(resumed, "current")).toHaveLength(1);
      expect(hitster.activePlayers(resumed)).toEqual(["b"]);
      expect(hitster.pauseMs!(resumed)).toBeNull();
      expect(totalCards(resumed)).toBe(DECK_SIZE);
      expect(hitster.resume!(resumed)).toEqual(resumed);
    },
  );

  it("holds the winning turn longer and only declares its winner on resume", () => {
    const state = start();
    state.cardsToWin = 2;
    const revealed = apply(state, "a", {
      type: "place",
      index: spot(state, true)!,
    });
    expect(hitster.result(revealed)).toBeNull();
    expect(hitster.pauseMs!(revealed)).toBe(WIN_REVEAL_MS);
    expect(hitster.view(revealed, null)).toMatchObject({
      currentPlayer: "a",
      nextPlayer: null,
      revealing: true,
      winners: null,
    });
    expect(hitster.currentTrack!(revealed)).toEqual(
      hitster.currentTrack!(state),
    );
    const snapshot = structuredClone(revealed);
    const resumed = hitster.resume!(revealed);
    expect(revealed).toEqual(snapshot);
    expect(hitster.result(resumed)).toEqual({ winners: ["a"] });
    expect(resumed.revealing).toBe(false);
    expect(cards(resumed, "current")).toHaveLength(0);
    expect(hitster.currentTrack!(resumed)).toBeNull();
    expect(hitster.pauseMs!(resumed)).toBeNull();
  });

  it("treats legacy state without revealing as an ordinary playable turn", () => {
    const state = start();
    const legacy = structuredClone(state);
    delete legacy.revealing;
    expect(hitster.view(legacy, null)).toEqual(hitster.view(state, null));
    expect(hitster.pauseMs!(legacy)).toBeNull();
    expect(hitster.activePlayers(legacy)).toEqual(["a"]);
    expect(hitster.resume!(legacy)).toEqual(legacy);
    expect(apply(legacy, "a", { type: "pass" }).revealing).toBe(true);
  });

  it("starts everyone with one card and draws a song for the first player", () => {
    const s = start();
    for (const p of players) expect(years(s, p)).toHaveLength(1);
    expect(cards(s, "current")).toHaveLength(1);
    expect(cards(s, "deck")).toHaveLength(DECK_SIZE - players.length - 1);
    expect(hitster.activePlayers(s)).toEqual(["a"]);
  });

  it("keeps a correctly placed song, in order, and passes the turn after revealing", () => {
    const s = start();
    const year = currentYear(s);
    const next = apply(s, "a", { type: "place", index: spot(s, true)! });
    expect(years(next, "a")).toHaveLength(2);
    expect(years(next, "a")).toContain(year);
    expect(sorted(years(next, "a"))).toBe(true);
    expect(next.lastTurn).toMatchObject({
      player: "a",
      outcome: "correct",
      turnNumber: 1,
    });
    expect(current(next)).toBe("a");
    expect(cards(next, "current")).toHaveLength(0);
    const resumed = hitster.resume!(next);
    expect(current(resumed)).toBe("b");
    expect(cards(resumed, "current")).toHaveLength(1);
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
    expect(hitster.applyMove(s, "b", { type: "place", index: 0 })).toEqual({
      ok: false,
      error: "It is not your turn.",
    });
    for (const index of [-1, 2, 0.5, NaN, "0", undefined]) {
      expect(
        hitster.applyMove(s, "a", { type: "place", index } as never).ok,
      ).toBe(false);
    }
    expect(hitster.applyMove(s, "a", { type: "nope" } as never).ok).toBe(false);
  });

  it("passes for an absent player: the song is discarded", () => {
    const s = start();
    expect(hitster.autoMove!(s, "b")).toBeNull();
    const next = apply(s, "a", hitster.autoMove!(s, "a"));
    expect(next.lastTurn!.outcome).toBe("passed");
    expect(years(next, "a")).toHaveLength(1);
    expect(current(next)).toBe("a");
    expect(current(hitster.resume!(next))).toBe("b");
  });

  it("never shows the year of the song being placed, to anyone", () => {
    const s = start();
    for (const viewer of [...players, null]) {
      const view = hitster.view(s, viewer);
      expect(Object.keys(view.current!).sort()).toEqual([
        "artist",
        "id",
        "title",
      ]);
      expect(view.current!.title).toBe(
        songOf(cards(s, "current")[0]!.face).title,
      );
      expect(view.timelines.a![0]!.year).toBe(years(s, "a")[0]);
      // Deezer ids would identify the song, and so its year: they stay on the server.
      expect(JSON.stringify(view)).not.toContain("deezerId");
    }
  });

  it("names the song to play on the server side only, and only deals songs that can be played", () => {
    const s = start();
    const song = songOf(cards(s, "current")[0]!.face);
    expect(hitster.currentTrack!(s)).toEqual({
      title: song.title,
      artist: song.artist,
      deezerId: song.deezerId,
    });
    for (const zone of Object.values(s.table.zones)) {
      for (const card of zone.cards)
        expect(songOf(card.face).deezerId).not.toBeNull();
    }
  });

  it("has no song to play once the game is over", () => {
    let s = start(5, { cardsToWin: "5", showSongInfo: false });
    for (let i = 0; i < 100 && !s.winners; i++) {
      s = complete(
        s,
        current(s),
        current(s) === "a"
          ? { type: "place", index: spot(s, true)! }
          : { type: "pass" },
      );
    }
    expect(hitster.currentTrack!(s)).toBeNull();
  });

  it("hides the title and artist too when that setting is off", () => {
    const view = hitster.view(
      start(11, { cardsToWin: "10", showSongInfo: false }),
      "a",
    );
    expect(view.current).toMatchObject({ title: null, artist: null });
  });

  it("ends after revealing the turn that reaches the target", () => {
    let s = start(5, { cardsToWin: "5", showSongInfo: true });
    // Player a always places correctly; the others always pass.
    for (let i = 0; i < 100 && !s.winners; i++) {
      s = complete(
        s,
        current(s),
        current(s) === "a"
          ? { type: "place", index: spot(s, true)! }
          : { type: "pass" },
      );
      expect(totalCards(s)).toBe(DECK_SIZE);
    }
    expect(hitster.result(s)).toEqual({ winners: ["a"] });
    expect(years(s, "a")).toHaveLength(5);
    expect(sorted(years(s, "a"))).toBe(true);
    expect(hitster.activePlayers(s)).toEqual([]);
    expect(hitster.view(s, null)).toMatchObject({
      current: null,
      currentPlayer: null,
    });
    expect(hitster.applyMove(s, "a", { type: "pass" }).ok).toBe(false);
  });

  it("reshuffles the discard pile when the deck runs out", () => {
    let s = start(3, defaults, ["a", "b"]);
    const turns = DECK_SIZE + 20; // more passes than there are cards
    for (let i = 0; i < turns; i++)
      s = complete(s, current(s), { type: "pass" });
    expect(s.winners).toBeNull();
    expect(cards(s, "current")).toHaveLength(1);
    expect(totalCards(s)).toBe(DECK_SIZE);
  });

  it("with eight players always placing correctly, someone reaches ten cards", () => {
    let s = start(9, defaults, ["a", "b", "c", "d", "e", "f", "g", "h"]);
    for (let i = 0; i < 500 && !s.winners; i++)
      s = complete(s, current(s), { type: "place", index: spot(s, true)! });
    expect(s.winners).toEqual(["a"]);
    for (const p of s.players) expect(sorted(years(s, p))).toBe(true);
  });
});
