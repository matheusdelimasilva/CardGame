import { describe, expect, it } from "vitest";
import {
  BET_REVEAL_MS,
  BET_WINDOW_SECONDS,
  DECK_SIZE,
  INTRO_MS,
  STARTING_TOKENS,
  addToken,
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

/** Plays one move; throws if it is refused. */
function play(s: HitsterState, player: string, move: unknown): HitsterState {
  const result = hitster.applyMove(s, player, move as never);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
/** Plays a move, then has everyone decline any betting window it opens, so a placement is judged at once. */
function apply(s: HitsterState, player: string, move: unknown): HitsterState {
  let next = play(s, player, move);
  while (next.locked != null && !next.revealing)
    next = play(next, hitster.activePlayers(next)[0]!, { type: "declineBet" });
  return next;
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
      apply(legacy, "a", { type: "place", index: spot(state, true)! }),
    ).toMatchObject({ lastTurn: { outcome: "correct" } });
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

/** A started game whose timelines and current song have these years. Player a is on turn. */
function rig(
  lines: Record<string, number[]>,
  song: number,
  who = players,
): HitsterState {
  const s = start(11, defaults, who);
  const deck = cards(s, "deck");
  const used = new Map<number, number>();
  const face = (year: number) => {
    const n = used.get(year) ?? 0;
    used.set(year, n + 1);
    return songKey(SONGS.filter((x) => x.year === year)[n]!);
  };
  for (const [p, line] of Object.entries(lines)) {
    const zone = s.table.zones[`timeline:${p}`]!;
    deck.push(...zone.cards.splice(0));
    zone.cards = line.map((year) => ({
      ...deck.shift()!,
      face: face(year),
      visibleTo: "all",
    }));
  }
  cards(s, "current")[0]!.face = face(song);
  return s;
}
const refusal = (s: HitsterState, player: string, move: unknown) => {
  const result = hitster.applyMove(s, player, move as never);
  return result.ok ? null : result.error;
};
const bet = (index: number) => ({ type: "bet", index }) as const;
const decline = { type: "declineBet" } as const;
const place = (index: number) => ({ type: "place", index }) as const;

describe("betting", () => {
  // a's timeline is 1970, 1990; the song is from 1980, so gap 1 is the only right one.
  const base = () => rig({ a: [1970, 1990], b: [2000], c: [1960] }, 1980);

  it("starts everyone with two public tokens and no bets", () => {
    const s = start();
    expect(STARTING_TOKENS).toBe(2);
    expect(s.tokens).toEqual([2, 2, 2]);
    for (const viewer of [...players, null])
      expect(hitster.view(s, viewer)).toMatchObject({
        tokens: { a: 2, b: 2, c: 2 },
        locked: false,
        lockedIndex: null,
        bets: [],
        declined: [],
        canBet: ["b", "c"],
      });
  });

  it("takes a token at once, in order, and keeps each gap secret from everyone but its bettor", () => {
    let s = base();
    const before = structuredClone(s);
    s = play(s, "c", bet(2));
    expect(base()).toEqual(before);
    s = play(s, "b", bet(0));
    expect(s.tokens).toEqual([2, 1, 1]);
    expect(s.bets).toEqual([
      { player: "c", index: 2 },
      { player: "b", index: 0 },
    ]);
    expect(hitster.view(s, "c").bets).toEqual([
      { player: "c", index: 2 },
      { player: "b", index: null },
    ]);
    expect(hitster.view(s, "b").bets).toEqual([
      { player: "c", index: null },
      { player: "b", index: 0 },
    ]);
    for (const viewer of ["a", null])
      expect(hitster.view(s, viewer).bets).toEqual([
        { player: "c", index: null },
        { player: "b", index: null },
      ]);
    // Bets before the lock do not change who the game waits on.
    expect(hitster.activePlayers(s)).toEqual(["a"]);
    expect(hitster.view(s, null).canBet).toEqual([]);
  });

  it("refuses every illegal bet with a precise reason", () => {
    const s = base();
    expect(refusal(s, "z", bet(0))).toBe("You are not in this game.");
    expect(refusal(s, "a", bet(0))).toBe("You cannot bet on your own turn.");
    expect(refusal(s, "a", decline)).toBe("You cannot bet on your own turn.");
    // Gaps are counted in a's timeline (3 gaps), not the bettor's (2 gaps).
    expect(refusal(s, "b", bet(3))).toBe(
      "That is not a gap in the current player's timeline.",
    );
    for (const index of [-1, 0.5, NaN])
      expect(refusal(s, "b", bet(index))).toBe(
        "That is not a gap in the current player's timeline.",
      );
    expect(refusal(s, "b", bet(2))).toBeNull();
    const after = play(s, "b", bet(2));
    expect(refusal(after, "b", bet(1))).toBe("You have already bet this turn.");
    expect(refusal(after, "b", decline)).toBe(
      "You have already bet this turn.",
    );
    const declined = play(s, "c", decline);
    expect(refusal(declined, "c", bet(1))).toBe(
      "You have already passed on betting this turn.",
    );
    expect(refusal(declined, "c", decline)).toBe(
      "You have already passed on betting this turn.",
    );
    const broke = structuredClone(s);
    broke.tokens = [2, 0, 2];
    expect(refusal(broke, "b", bet(1))).toBe("You have no tokens to bet.");
    expect(refusal(broke, "b", decline)).toBe("You have no tokens to bet.");
    expect(hitster.view(broke, null).canBet).toEqual(["c"]);

    const intro = hitster.setup({ players, seed: 11, settings: defaults });
    expect(refusal(intro, "b", bet(0))).toBe("The game is getting ready.");
    const revealing = apply(s, "a", { type: "pass" });
    expect(refusal(revealing, "b", bet(0))).toBe(
      "The previous turn is still being revealed.",
    );
    expect(refusal(revealing, "b", decline)).toBe(
      "The previous turn is still being revealed.",
    );
    const over = { ...s, winners: ["a"] };
    expect(refusal(over, "b", bet(0))).toBe("The game is over.");
    expect(hitster.moveSchema.safeParse(bet(-1)).success).toBe(false);
    expect(hitster.moveSchema.safeParse(bet(1.5)).success).toBe(false);
    expect(hitster.moveSchema.safeParse(bet(1)).success).toBe(true);
    expect(hitster.moveSchema.safeParse(decline).success).toBe(true);
  });

  it("hides the locked placement and opens a five-second window that waits on whoever can still bet", () => {
    let s = play(base(), "b", bet(1));
    s = play(s, "a", place(0));
    expect(s).toMatchObject({ locked: 0, revealing: false });
    expect(cards(s, "current")).toHaveLength(1);
    expect(hitster.activePlayers(s)).toEqual(["c"]);
    expect(hitster.turnTimeLimit!(s)).toBe(BET_WINDOW_SECONDS);
    expect(BET_WINDOW_SECONDS).toBe(5);
    expect(hitster.pauseMs!(s)).toBeNull();
    expect(hitster.autoMove!(s, "a")).toBeNull();
    expect(hitster.autoMove!(s, "b")).toBeNull();
    expect(hitster.autoMove!(s, "c")).toEqual(decline);
    expect(refusal(s, "a", place(1))).toBe(
      "You have already placed this song.",
    );
    expect(refusal(s, "a", { type: "pass" })).toBe(
      "You have already placed this song.",
    );
    expect(hitster.view(s, "a")).toMatchObject({
      locked: true,
      lockedIndex: 0,
    });
    for (const viewer of ["b", "c", null])
      expect(hitster.view(s, viewer)).toMatchObject({
        locked: true,
        lockedIndex: null,
        canBet: ["c"],
      });
  });

  it("serializes no hidden placement, gap or year into any viewer's view", () => {
    let s = rig({ a: [1970, 1990], b: [2000], c: [1960], d: [] }, 1980, [
      "a",
      "b",
      "c",
      "d",
    ]);
    s = play(s, "b", bet(2));
    s = play(s, "a", place(1));
    const json = (viewer: string | null) =>
      JSON.parse(JSON.stringify(hitster.view(s, viewer))) as Record<
        string,
        unknown
      >;
    const active = json("a");
    expect(active).toMatchObject({
      lockedIndex: 1,
      bets: [{ player: "b", index: null }],
    });
    const bettor = json("b");
    expect(bettor).toMatchObject({
      lockedIndex: null,
      bets: [{ player: "b", index: 2 }],
    });
    for (const viewer of ["c", "d", null]) {
      expect(json(viewer)).toMatchObject({
        lockedIndex: null,
        locked: true,
        bets: [{ player: "b", index: null }],
      });
      expect(JSON.stringify(json(viewer))).not.toMatch(
        /"(index|lockedIndex)":\d/,
      );
    }
    for (const view of [active, bettor, json("c"), json(null)]) {
      expect(JSON.stringify(view)).not.toContain("1980");
      expect(Object.keys(view.current as object).sort()).toEqual([
        "artist",
        "id",
        "title",
      ]);
    }
    expect(JSON.stringify(active)).not.toContain('"index":2');
  });

  it("keeps the clock key for the whole window while bets arrive, and closes it early once nobody can bet", () => {
    let s = base();
    const placing = hitster.clockKey!(s);
    s = play(s, "b", bet(1));
    expect(hitster.clockKey!(s)).toBe(placing);
    expect(hitster.turnTimeLimit!(s)).toBeNull();
    s = play(s, "a", place(0));
    const window = hitster.clockKey!(s);
    expect(window).not.toBe(placing);
    expect(hitster.activePlayers(s)).toEqual(["c"]);
    const judged = play(s, "c", bet(2));
    expect(judged.revealing).toBe(true);
    expect(hitster.activePlayers(judged)).toEqual([]);
    expect(hitster.turnTimeLimit!(judged)).toBeNull();

    // With four players, a bet changes who is waited on but not the key.
    let four = rig({ a: [1970, 1990], b: [], c: [], d: [] }, 1980, [
      "a",
      "b",
      "c",
      "d",
    ]);
    four = play(four, "a", place(0));
    const key = hitster.clockKey!(four);
    four = play(four, "b", bet(1));
    expect(hitster.activePlayers(four)).toEqual(["c", "d"]);
    expect(hitster.clockKey!(four)).toBe(key);
    four = play(four, "d", decline);
    expect(hitster.clockKey!(four)).toBe(key);
    expect(hitster.view(four, null).declined).toEqual(["d"]);
    expect(play(four, "c", decline).revealing).toBe(true);
  });

  it("judges at once when nobody can bet as the placement is locked in", () => {
    let s = play(play(base(), "b", bet(1)), "c", decline);
    expect(play(s, "a", place(1)).revealing).toBe(true);
    s = base();
    s.tokens = [2, 0, 0];
    const judged = play(s, "a", place(1));
    expect(judged.revealing).toBe(true);
    expect(judged.lastTurn).toMatchObject({ bets: [], thief: null });
    expect(hitster.pauseMs!(judged)).toBe(REVEAL_MS);
  });

  it("lets the first right bet steal a missed card; later right bets and wrong bets lose", () => {
    // a's timeline 1970, 1985, 1990; a song from 1985 fits at gaps 1 and 2.
    let s = rig(
      { a: [1970, 1985, 1990], b: [2000], c: [1960], d: [1990] },
      1985,
      ["a", "b", "c", "d"],
    );
    s = play(s, "c", bet(2));
    s = play(s, "b", bet(1));
    s = play(s, "a", place(0));
    s = play(s, "d", bet(3));
    expect(s.revealing).toBe(true);
    expect(s.lastTurn).toMatchObject({
      outcome: "wrong",
      index: 0,
      thief: "c",
      bets: [
        { player: "c", index: 2, result: "stole" },
        { player: "b", index: 1, result: "lost" },
        { player: "d", index: 3, result: "lost" },
      ],
    });
    expect(s.tokens).toEqual([2, 1, 1, 1]);
    expect(years(s, "a")).toEqual([1970, 1985, 1990]);
    expect(years(s, "c")).toEqual([1960, 1985]);
    expect(cards(s, "timeline:c")[1]!.visibleTo).toBe("all");
    expect(cards(s, "discard")).toHaveLength(0);
    expect(totalCards(s)).toBe(DECK_SIZE);
    expect(hitster.pauseMs!(s)).toBe(REVEAL_MS + BET_REVEAL_MS);
    expect(BET_REVEAL_MS).toBe(2000);
    for (const viewer of [...s.players, null])
      expect(hitster.view(s, viewer)).toMatchObject({
        revealing: true,
        locked: false,
        bets: [],
        declined: [],
        canBet: [],
        tokens: { a: 2, b: 1, c: 1, d: 1 },
        lastTurn: s.lastTurn,
      });
    const next = hitster.resume!(s);
    expect(next).toMatchObject({
      turn: 1,
      bets: [],
      declined: [],
      locked: null,
    });
    expect(hitster.view(next, null).canBet).toEqual(["a", "c", "d"]);
  });

  it("refunds a bet on the placed gap whether the placement is right or wrong", () => {
    // Right: a places at 1, b bets 1 too, c bets the wrong gap 0.
    let right = play(base(), "b", bet(1));
    right = play(right, "c", bet(0));
    right = play(right, "a", place(1));
    expect(right.lastTurn).toMatchObject({
      outcome: "correct",
      thief: null,
      bets: [
        { player: "b", index: 1, result: "refunded" },
        { player: "c", index: 0, result: "lost" },
      ],
    });
    expect(right.tokens).toEqual([2, 2, 1]);
    expect(years(right, "a")).toEqual([1970, 1980, 1990]);

    // Wrong: a places at 0, b bets 0 too (refunded), c bets 1 and steals.
    let wrong = play(base(), "b", bet(0));
    wrong = play(wrong, "a", place(0));
    wrong = play(wrong, "c", bet(1));
    expect(wrong.lastTurn).toMatchObject({
      outcome: "wrong",
      thief: "c",
      bets: [
        { player: "b", index: 0, result: "refunded" },
        { player: "c", index: 1, result: "stole" },
      ],
    });
    expect(wrong.tokens).toEqual([2, 2, 1]);
  });

  it("loses a right bet when the current player is also right, even on another same-year gap", () => {
    // a's timeline 1985; a 1985 song fits on either side.
    let s = rig({ a: [1985], b: [], c: [] }, 1985);
    s = play(s, "b", bet(1));
    s = play(s, "c", decline);
    s = play(s, "a", place(0));
    expect(s.lastTurn).toMatchObject({
      outcome: "correct",
      thief: null,
      bets: [{ player: "b", index: 1, result: "lost" }],
    });
    expect(s.tokens).toEqual([2, 1, 2]);
  });

  it("discards a missed card when no bet is right", () => {
    let s = play(base(), "b", bet(2));
    s = play(s, "a", place(0));
    s = play(s, "c", bet(0));
    expect(s.lastTurn).toMatchObject({
      outcome: "wrong",
      thief: null,
      bets: [
        { player: "b", index: 2, result: "lost" },
        { player: "c", index: 0, result: "refunded" },
      ],
    });
    expect(cards(s, "discard")).toHaveLength(1);
  });

  it("puts a stolen card into an empty timeline, or before equal years", () => {
    let empty = rig({ a: [1970, 1990], b: [], c: [] }, 1980);
    empty = play(empty, "b", bet(1));
    empty = play(empty, "a", place(2));
    empty = play(empty, "c", decline);
    expect(empty.lastTurn!.thief).toBe("b");
    expect(years(empty, "b")).toEqual([1980]);

    let equal = rig({ a: [1970, 1985], b: [1990, 1990, 1990], c: [] }, 1990);
    equal = play(equal, "b", bet(2));
    equal = play(equal, "a", place(0));
    equal = play(equal, "c", decline);
    expect(equal.lastTurn!.thief).toBe("b");
    expect(years(equal, "b")).toEqual([1990, 1990, 1990, 1990]);
    expect(cards(equal, "timeline:b")[0]!.face).toBe(
      cards(
        rig({ a: [1970, 1985], b: [1990, 1990, 1990], c: [] }, 1990),
        "current",
      )[0]!.face,
    );
  });

  it("lets a steal win the game for the thief", () => {
    let s = rig({ a: [1970, 1990], b: [2000, 2010], c: [] }, 1980);
    s.cardsToWin = 3;
    s = play(s, "b", bet(1));
    s = play(s, "a", place(0));
    s = play(s, "c", decline);
    expect(s.lastTurn!.thief).toBe("b");
    expect(hitster.result(s)).toBeNull();
    expect(hitster.pauseMs!(s)).toBe(WIN_REVEAL_MS + BET_REVEAL_MS);
    expect(hitster.view(s, null).nextPlayer).toBeNull();
    const over = hitster.resume!(s);
    expect(hitster.result(over)).toEqual({ winners: ["b"] });
    expect(hitster.activePlayers(over)).toEqual([]);
  });

  it("refunds every bet and discards the card when the turn is passed", () => {
    let s = play(base(), "b", bet(1));
    s = play(s, "c", bet(0));
    expect(hitster.autoMove!(s, "a")).toEqual({ type: "pass" });
    expect(hitster.autoMove!(s, "b")).toBeNull();
    s = play(s, "a", hitster.autoMove!(s, "a"));
    expect(s.lastTurn).toMatchObject({
      outcome: "passed",
      thief: null,
      bets: [
        { player: "b", index: 1, result: "refunded" },
        { player: "c", index: 0, result: "refunded" },
      ],
    });
    expect(s.lastTurn).not.toHaveProperty("index");
    expect(s.tokens).toEqual([2, 2, 2]);
    expect(cards(s, "discard")).toHaveLength(1);
  });

  it("never lets tokens go below zero", () => {
    // b bets wrong twice and is left with none.
    let s = start(11, defaults, ["a", "b"]);
    for (let turn = 0; turn < 4; turn++) {
      const active = current(s);
      if (active === "a" && s.tokens![1]! > 0) {
        const line = years(s, "a");
        const wrong = [...line.keys(), line.length].find(
          (i) => !fitsAt(line, i, currentYear(s)),
        );
        if (wrong === undefined) {
          s = complete(s, active, { type: "pass" });
          continue;
        }
        s = play(s, "b", bet(wrong));
        s = complete(s, "a", place(spot(s, true)!));
      } else s = complete(s, active, { type: "pass" });
    }
    expect(s.tokens![1]).toBe(0);
    if (current(s) === "b") s = complete(s, "b", { type: "pass" });
    expect(refusal(s, "b", bet(0))).toBe("You have no tokens to bet.");
    expect(hitster.view(s, null).canBet).toEqual([]);
    expect(play(s, "a", place(0)).revealing).toBe(true);
  });

  it("adds tokens with a pure helper, without an upper limit", () => {
    const s = start();
    const before = structuredClone(s);
    let more = addToken(s, "c");
    for (let i = 0; i < 5; i++) more = addToken(more, "c");
    expect(s).toEqual(before);
    expect(more.tokens).toEqual([2, 2, 8]);
    expect(() => addToken(s, "z")).toThrow();
    const legacy = structuredClone(s);
    delete legacy.tokens;
    expect(addToken(legacy, "a").tokens).toEqual([3, 2, 2]);
  });

  it("plays a legacy saved state without betting fields as if nobody had bet", () => {
    const s = base();
    const legacy = structuredClone(s);
    delete legacy.tokens;
    delete legacy.bets;
    delete legacy.declined;
    delete legacy.locked;
    expect(hitster.view(legacy, "a")).toEqual(hitster.view(s, "a"));
    expect(hitster.activePlayers(legacy)).toEqual(["a"]);
    expect(hitster.clockKey!(legacy)).toBe(hitster.clockKey!(s));
    const after = play(play(legacy, "b", bet(1)), "a", place(0));
    expect(after).toMatchObject({ locked: 0, tokens: [2, 1, 2] });
  });

  it("is deterministic: the same seed and moves give the same states", () => {
    const run = () => {
      const states: HitsterState[] = [];
      let s = start(7);
      for (let turn = 0; turn < 12 && !s.winners; turn++) {
        const active = current(s);
        const others = s.players.filter((p) => p !== active);
        const gaps = years(s, active).length + 1;
        if (s.tokens![s.players.indexOf(others[0]!)]! > 0)
          s = play(s, others[0]!, bet(turn % gaps));
        s = play(s, active, place((turn * 2) % gaps));
        states.push(s);
        for (const p of hitster.activePlayers(s)) s = play(s, p, decline);
        states.push(s);
        s = hitster.resume!(s);
        states.push(s);
      }
      return states;
    };
    const first = run();
    expect(JSON.parse(JSON.stringify(first))).toEqual(run());
    expect(first.some((s) => s.lastTurn?.thief)).toBe(true);
  });
});

describe("guessing in chat", () => {
  const rhapsody = songKey({ title: "Bohemian Rhapsody", artist: "Queen" });
  /** Past the intro, guessing on (as for settings saved before it existed), a's turn, Bohemian Rhapsody playing. */
  function table(settings: Record<string, string | boolean> = {}) {
    const s = start(11, { cardsToWin: "10", ...settings });
    cards(s, "current")[0]!.face = rhapsody;
    return s;
  }
  const say = (s: HitsterState, player: string | null, text: string) =>
    hitster.chat!(s, player, text, player ? player.toUpperCase() : "Watcher");
  /** Says a line that must change the game, and returns the new state. */
  const guess = (s: HitsterState, player: string, text: string) => {
    const outcome = say(s, player, text);
    if (!outcome?.state) throw new Error(`"${text}" changed nothing`);
    return outcome.state;
  };

  it("is a host setting, on by default", () => {
    expect(hitster.settings.find((d) => d.id === "guessInChat")).toEqual({
      type: "toggle",
      id: "guessInChat",
      label: "Guess in chat",
      description: expect.any(String),
      default: true,
    });
    expect(table()).toMatchObject({
      guessInChat: true,
      guessed: { title: [], artist: [] },
    });
    expect(table({ guessInChat: false }).guessInChat).toBe(false);
  });

  it("credits each part once, announces it instead of the line, and gives one token for both", () => {
    const s = table();
    const before = structuredClone(s);
    const first = say(s, "b", "bohemian rhapsody");
    expect(first).toEqual({
      state: expect.anything(),
      deliver: false,
      announce: [
        {
          text: "B guessed the song correctly.",
          textPtBR: "B acertou a música.",
        },
      ],
    });
    expect(s).toEqual(before);
    const titled = first!.state!;
    expect(titled.guessed).toEqual({ title: ["b"], artist: [] });
    expect(titled.tokens).toEqual([2, 2, 2]);

    expect(say(titled, "b", "Bohemian Rhapsody!")).toEqual({
      deliver: false,
      note: "You already got the song.",
      notePtBR: "Você já acertou a música.",
    });
    const both = say(titled, "b", "queen");
    expect(both).toEqual({
      state: expect.anything(),
      deliver: false,
      announce: [
        {
          text: "B guessed the artist correctly.",
          textPtBR: "B acertou o artista.",
        },
        {
          text: "B got both and earns a token.",
          textPtBR: "B acertou os dois e ganhou uma ficha.",
        },
      ],
    });
    expect(both!.state).toMatchObject({
      guessed: { title: ["b"], artist: ["b"] },
      tokens: [2, 3, 2],
    });
    expect(say(both!.state!, "b", "QUEEN")).toEqual({
      deliver: false,
      note: "You already got the artist.",
      notePtBR: "Você já acertou o artista.",
    });
    expect(say(both!.state!, "b", "bohemian rhapsody by queen")).toEqual({
      deliver: false,
      note: "You already got the song.",
      notePtBR: "Você já acertou a música.",
    });
  });

  it("credits both parts named in one line with one token", () => {
    const outcome = say(table(), "c", "Queen - Bohemian Rhapsody");
    expect(outcome).toMatchObject({
      deliver: false,
      announce: [
        {
          text: "C guessed the song correctly.",
          textPtBR: "C acertou a música.",
        },
        {
          text: "C guessed the artist correctly.",
          textPtBR: "C acertou o artista.",
        },
        {
          text: "C got both and earns a token.",
          textPtBR: "C acertou os dois e ganhou uma ficha.",
        },
      ],
      state: { tokens: [2, 2, 3] },
    });
  });

  it("holds back a near miss with a private note and lets ordinary chat through", () => {
    const s = table();
    expect(say(s, "b", "bohemian rapsodi")).toEqual({
      deliver: false,
      note: "Close, but not quite. Your message wasn't sent.",
      notePtBR: "Quase! Sua mensagem não foi enviada.",
    });
    expect(say(s, "b", "is this queen??")).toEqual({
      deliver: false,
      note: "Close, but not quite. Your message wasn't sent.",
      notePtBR: "Quase! Sua mensagem não foi enviada.",
    });
    expect(say(s, "b", "my dad plays this in the car")).toBeNull();
    expect(say(s, "b", "love this one")).toBeNull();
  });

  it("lets the player whose turn it is guess their own song, and while the betting window is open", () => {
    let s = guess(table(), "a", "bohemian rhapsody");
    expect(s.guessed).toEqual({ title: ["a"], artist: [] });
    s = play(s, "a", place(0));
    expect(s).toMatchObject({ locked: 0, revealing: false });
    s = guess(s, "a", "queen");
    expect(s.tokens).toEqual([3, 2, 2]);
    // The window stays one period, so earning a token does not restart its clock.
    expect(hitster.clockKey!(s)).toBe(`${s.turnNumber}:bets`);
  });

  it("can give a player with no tokens a token to bet with before the window closes", () => {
    let s = table();
    s.tokens = [2, 0, 2];
    s = play(s, "a", place(0));
    expect(hitster.activePlayers(s)).toEqual(["c"]);
    const key = hitster.clockKey!(s);
    s = guess(guess(s, "b", "queen"), "b", "bohemian rhapsody");
    expect(s.tokens).toEqual([2, 1, 2]);
    expect(hitster.activePlayers(s)).toEqual(["b", "c"]);
    expect(hitster.view(s, "b").canBet).toEqual(["b", "c"]);
    expect(hitster.clockKey!(s)).toBe(key);
    expect(play(s, "b", bet(1)).tokens).toEqual([2, 0, 2]);
  });

  it("is closed during the intro, a reveal and after the game", () => {
    const intro = hitster.setup({
      players,
      seed: 11,
      settings: { cardsToWin: "10" },
    });
    cards(intro, "current")[0]!.face = rhapsody;
    expect(intro.intro).toBe(true);
    expect(say(intro, "b", "bohemian rhapsody")).toBeNull();

    const revealing = apply(table(), "a", place(0));
    expect(revealing.revealing).toBe(true);
    expect(say(revealing, "b", "bohemian rhapsody")).toBeNull();
    expect(say(revealing, "b", "queen")).toBeNull();

    const over = { ...table(), winners: ["a"] };
    expect(say(over, "b", "bohemian rhapsody")).toBeNull();
    expect(hitster.view(over, "b").guessing).toBe(true);
  });

  it("is off when the host turns it off or shows the title and artist", () => {
    const off: Record<string, boolean>[] = [
      { guessInChat: false },
      { showSongInfo: true },
    ];
    for (const settings of off) {
      const s = table(settings);
      expect(say(s, "b", "bohemian rhapsody")).toBeNull();
      expect(say(s, "b", "bohemian rapsodi")).toBeNull();
      expect(hitster.view(s, "b").guessing).toBe(false);
    }
    expect(hitster.view(table(), "b").guessing).toBe(true);
  });

  it("holds back a watcher's right or near guess without credit, and lets their chat through", () => {
    const s = table();
    for (const player of [null, "z"])
      for (const text of ["bohemian rhapsody", "queen", "bohemian rapsodi"])
        expect(say(s, player, text)).toEqual({
          deliver: false,
          note: "Only players in this game can guess the song. Your message wasn't sent.",
          notePtBR:
            "Só quem está jogando pode tentar adivinhar a música. Sua mensagem não foi enviada.",
        });
    expect(say(s, null, "go team")).toBeNull();
  });

  it("clears the credits when the next song is drawn", () => {
    let s = guess(guess(table(), "b", "queen"), "c", "bohemian rhapsody");
    s = apply(s, "a", place(0));
    // The reveal still shows who guessed the song just revealed.
    expect(hitster.view(s, null).guesses).toMatchObject({
      b: { title: false, artist: true },
      c: { title: true, artist: false },
    });
    s = hitster.resume!(s);
    expect(s.guessed).toEqual({ title: [], artist: [] });
    expect(hitster.view(s, "b")).toMatchObject({
      yourGuess: { title: false, artist: false },
      guesses: {
        a: { title: false, artist: false },
        b: { title: false, artist: false },
        c: { title: false, artist: false },
      },
    });
  });

  it("shows each viewer their own credit and everyone's, but never the answer", () => {
    const s = guess(table(), "b", "queen");
    expect(hitster.view(s, "b")).toMatchObject({
      guessing: true,
      yourGuess: { title: false, artist: true },
      current: { title: null, artist: null },
    });
    expect(hitster.view(s, "c").yourGuess).toEqual({
      title: false,
      artist: false,
    });
    expect(hitster.view(s, null).yourGuess).toBeNull();
    for (const viewer of [...players, null]) {
      const view = hitster.view(s, viewer);
      expect(view.guesses).toEqual({
        a: { title: false, artist: false },
        b: { title: false, artist: true },
        c: { title: false, artist: false },
      });
      expect(JSON.stringify(view)).not.toMatch(/bohemian|queen/i);
    }
  });

  it("plays a legacy saved state without guessing fields with guessing on and nobody credited", () => {
    const s = table();
    const legacy = structuredClone(s);
    delete legacy.guessInChat;
    delete legacy.guessed;
    expect(hitster.view(legacy, "a")).toEqual(hitster.view(s, "a"));
    expect(guess(legacy, "b", "queen").guessed).toEqual({
      title: [],
      artist: ["b"],
    });
  });
});
