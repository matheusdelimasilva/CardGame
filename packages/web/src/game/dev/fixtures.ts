/**
 * Realistic RoomViews for the dev gallery and tests: every stage of a Hitster
 * game, for 2–8 players and 5, 8 or 10 cards to win. Development data only.
 */
import type { HitsterView, SongCardView, TurnSummary } from "@cardgame/games";
import type { RoomView, SeatView } from "@cardgame/protocol";
import { SEAT_COUNT } from "@cardgame/protocol";

type Song = Omit<SongCardView, "id">;

/** Real songs, several with long titles and featured artists. */
const SONGS: Song[] = [
  { title: "Johnny B. Goode", artist: "Chuck Berry", year: 1958 },
  {
    title: "Can't Help Falling in Love",
    artist: "Elvis Presley",
    year: 1961,
  },
  {
    title: "(I Can't Get No) Satisfaction",
    artist: "The Rolling Stones",
    year: 1965,
  },
  { title: "Respect", artist: "Aretha Franklin", year: 1967 },
  { title: "Here Comes the Sun", artist: "The Beatles", year: 1969 },
  {
    title: "Bridge over Troubled Water",
    artist: "Simon & Garfunkel",
    year: 1970,
  },
  { title: "Superstition", artist: "Stevie Wonder", year: 1972 },
  { title: "Bohemian Rhapsody", artist: "Queen", year: 1975 },
  { title: "Dancing Queen", artist: "ABBA", year: 1976 },
  { title: "Hotel California", artist: "Eagles", year: 1977 },
  { title: "Don't Stop Me Now", artist: "Queen", year: 1979 },
  { title: "Bette Davis Eyes", artist: "Kim Carnes", year: 1981 },
  { title: "Africa", artist: "Toto", year: 1982 },
  { title: "Total Eclipse of the Heart", artist: "Bonnie Tyler", year: 1983 },
  {
    title: "Everybody Wants to Rule the World",
    artist: "Tears for Fears",
    year: 1985,
  },
  { title: "Livin' on a Prayer", artist: "Bon Jovi", year: 1986 },
  {
    title: "I Wanna Dance with Somebody (Who Loves Me)",
    artist: "Whitney Houston",
    year: 1987,
  },
  { title: "Sweet Child o' Mine", artist: "Guns N' Roses", year: 1988 },
  { title: "Like a Prayer", artist: "Madonna", year: 1989 },
  { title: "Smells Like Teen Spirit", artist: "Nirvana", year: 1991 },
  { title: "Wonderwall", artist: "Oasis", year: 1995 },
  { title: "...Baby One More Time", artist: "Britney Spears", year: 1998 },
  { title: "Hey Ya!", artist: "OutKast", year: 2003 },
  {
    title: "Crazy in Love",
    artist: "Beyoncé featuring Jay-Z",
    year: 2003,
  },
  { title: "Mr. Brightside", artist: "The Killers", year: 2004 },
  { title: "Umbrella", artist: "Rihanna featuring Jay-Z", year: 2007 },
  { title: "Rolling in the Deep", artist: "Adele", year: 2010 },
  {
    title: "Somebody That I Used to Know",
    artist: "Gotye featuring Kimbra",
    year: 2011,
  },
  {
    title: "Uptown Funk",
    artist: "Mark Ronson featuring Bruno Mars",
    year: 2014,
  },
  {
    title: "Despacito",
    artist: "Luis Fonsi featuring Daddy Yankee",
    year: 2017,
  },
  { title: "Blinding Lights", artist: "The Weeknd", year: 2019 },
  { title: "As It Was", artist: "Harry Styles", year: 2022 },
];

/** Names up to the 14-character limit, so long names are always on screen. */
const NAMES = [
  "matt",
  "Mika",
  "Jonathan Silva",
  "Priya",
  "Otto",
  "Alexandrina V.",
  "Sam",
  "Bartholomew K.",
  "Ana",
];
/** Seats in the order players took them, so clockwise order differs from join order. */
const SEAT_ORDER = [3, 5, 0, 6, 1, 7, 2, 4];

export type Goal = 5 | 8 | 10;
export type TimelineLength = "short" | "long" | "mixed";

export interface FixtureOptions {
  /** People playing in the game, 2–8 (with a benched viewer, at most 7). */
  players?: number;
  goal?: Goal;
  /** short: one or two cards each; long: one short of winning; mixed: a spread. */
  timelines?: TimelineLength;
  /** Show the current song's title and artist (the "Show title and artist" setting). */
  showSongInfo?: boolean;
}

type Viewer = "player" | "spectator" | "benched";

interface Table {
  room: RoomView;
  /** Game players in turn order; the viewer first when they play. */
  players: string[];
  /** Everyone else in the game, in clockwise order after the viewer's seat. */
  others: string[];
  goal: Goal;
  showSongInfo: boolean;
  lengths: Record<string, number>;
}

const clampPlayers = (n: number, viewer: Viewer) =>
  Math.max(2, Math.min(viewer === "benched" ? 7 : 8, Math.round(n)));

function lengthFor(i: number, goal: Goal, mode: TimelineLength): number {
  if (mode === "short") return 1 + (i % 2);
  if (mode === "long") return goal - 1;
  return 1 + ((i * 3) % (goal - 1));
}

/** The seated people and an empty game around them. */
function table(viewer: Viewer, options: FixtureOptions): Table {
  const goal = options.goal ?? 10;
  const count = clampPlayers(options.players ?? 4, viewer);
  const mode = options.timelines ?? "mixed";
  const seats: (SeatView | null)[] = Array.from(
    { length: SEAT_COUNT },
    () => null,
  );
  const ids: string[] = [];
  const seatOf: Record<string, number> = {};
  // A spectator watches; everyone else takes a seat in SEAT_ORDER.
  const seated =
    viewer === "spectator" ? count : count + (viewer === "benched" ? 1 : 0);
  for (let i = 0; i < seated; i++) {
    const nameIndex = viewer === "spectator" ? i + 1 : i;
    const id = `p${nameIndex}`;
    const seat = SEAT_ORDER[i]!;
    const inGame = !(viewer === "benched" && i === 0);
    seats[seat] = {
      id,
      name: NAMES[nameIndex]!,
      connected: true,
      isHost: i === 0,
      inGame,
    };
    seatOf[id] = seat;
    if (inGame) ids.push(id);
  }
  const you =
    viewer === "spectator"
      ? { id: "p0", name: NAMES[0]!, seat: null, isHost: false }
      : { id: "p0", name: NAMES[0]!, seat: SEAT_ORDER[0]!, isHost: true };
  const from = you.seat === null ? 0 : you.seat + 1;
  const others = ids
    .filter((id) => id !== you.id)
    .sort(
      (a, b) =>
        ((seatOf[a]! - from + SEAT_COUNT) % SEAT_COUNT) -
        ((seatOf[b]! - from + SEAT_COUNT) % SEAT_COUNT),
    );
  const lengths = Object.fromEntries(
    ids.map((id, i) => [id, lengthFor(i, goal, mode)]),
  );
  return {
    room: {
      code: "92S7BT",
      gameInfo: {
        id: "hitster",
        name: "Hitster",
        minPlayers: 2,
        maxPlayers: 8,
        description:
          "Hear a song and place it in your timeline by release year. First to fill their timeline wins.",
        settings: [],
      },
      settings: {
        songList: "international",
        cardsToWin: String(goal),
        showSongInfo: options.showSongInfo ?? false,
      },
      you,
      seats,
      spectators:
        viewer === "spectator"
          ? [{ id: "p0", name: NAMES[0]!, connected: true }]
          : [],
      game: null,
    },
    players: ids,
    others,
    goal,
    showSongInfo: options.showSongInfo ?? false,
    lengths,
  };
}

/** `length` different songs for one player, oldest first, with ids unique to that player. */
function line(player: string, length: number, salt: number): SongCardView[] {
  return Array.from({ length }, (_, j) => {
    const song = SONGS[(salt * 7 + j * 3) % SONGS.length]!;
    return { id: `${player}-c${j}`, ...song };
  }).sort((a, b) => a.year - b.year);
}

function timelines(t: Table): Record<string, SongCardView[]> {
  return Object.fromEntries(
    t.players.map((id, i) => [id, line(id, t.lengths[id]!, i)]),
  );
}

/** A song not in `taken`, for the card being placed. */
function freshSong(taken: readonly SongCardView[], salt: number): Song {
  const years = new Set(taken.map((c) => c.year));
  for (let k = 0; k < SONGS.length; k++) {
    const song = SONGS[(salt * 11 + k * 5) % SONGS.length]!;
    if (!years.has(song.year)) return song;
  }
  return SONGS[0]!;
}

interface ViewParts {
  view?: Partial<HitsterView>;
  active?: string[];
  pause?: number | null;
  winners?: string[] | null;
}

function withGame(t: Table, parts: ViewParts): RoomView {
  const view: HitsterView = {
    players: t.players,
    timelines: timelines(t),
    current: null,
    currentPlayer: t.players[0]!,
    revealing: false,
    intro: false,
    nextPlayer: null,
    turnNumber: 7,
    deckCount: 241,
    discardCount: 12,
    cardsToWin: t.goal,
    lastTurn: null,
    winners: parts.winners ?? null,
    ...parts.view,
  };
  return {
    ...t.room,
    game: {
      gameId: "hitster",
      players: t.players,
      active: parts.active ?? [],
      view,
      result: parts.winners ? { winners: parts.winners } : null,
      track: parts.winners ? null : { url: "/api/tracks/dev-fixture" },
      timer: null,
      pause:
        parts.pause === undefined || parts.pause === null
          ? null
          : { remainingMs: parts.pause },
    },
  };
}

/** The player `who` is placing a fresh song. */
function placing(t: Table, who: string): RoomView {
  const lines = timelines(t);
  const song = freshSong(lines[who] ?? [], t.players.indexOf(who) + 3);
  return withGame(t, {
    active: [who],
    view: {
      timelines: lines,
      currentPlayer: who,
      current: {
        id: "current",
        title: t.showSongInfo ? song.title : null,
        artist: t.showSongInfo ? song.artist : null,
      },
    },
  });
}

/**
 * `who` has just placed a song with this outcome. A correct card is already
 * in their timeline, as the server sends it.
 */
function revealing(
  t: Table,
  who: string,
  outcome: TurnSummary["outcome"],
): RoomView {
  const lines = timelines(t);
  const before = lines[who] ?? [];
  const song = freshSong(before, t.players.indexOf(who) + 5);
  const fit = before.filter((c) => c.year <= song.year).length;
  const index = outcome === "correct" ? fit : fit === 0 ? before.length : 0;
  if (outcome === "correct")
    lines[who] = [
      ...before.slice(0, index),
      { id: `${who}-won`, ...song },
      ...before.slice(index),
    ];
  const next = t.players[(t.players.indexOf(who) + 1) % t.players.length]!;
  return withGame(t, {
    pause: 4000,
    view: {
      timelines: lines,
      currentPlayer: who,
      revealing: true,
      nextPlayer: next,
      lastTurn: {
        turnNumber: 7,
        player: who,
        song,
        outcome,
        ...(outcome === "passed" ? {} : { index }),
      },
    },
  });
}

/** The game is over and `winners` won. With several winners the deck ran out. */
function over(t: Table, winners: string[]): RoomView {
  const lines = timelines(t);
  const tie = winners.length > 1;
  // Reaching the goal ends the game at once, so a tie is always short of it.
  const top = tie ? t.goal - 1 : t.goal;
  for (const [i, id] of winners.entries()) lines[id] = line(id, top, i + 1);
  for (const id of t.players)
    if (!winners.includes(id) && lines[id]!.length >= top)
      lines[id] = lines[id]!.slice(0, top - 1);
  return withGame(t, {
    winners,
    view: {
      timelines: lines,
      currentPlayer: null,
      deckCount: tie ? 0 : 199,
      discardCount: tie ? 0 : 20,
    },
  });
}

function disconnect(room: RoomView, id: string): RoomView {
  return {
    ...room,
    seats: room.seats.map((s) =>
      s?.id === id ? { ...s, connected: false } : s,
    ),
  };
}

const me = "p0";
const first = (t: Table) => t.others[0]!;

/** Every scenario the gallery offers, by name. */
export const scenarios = {
  intro: (o: FixtureOptions = {}) => {
    const t = table("player", o);
    return withGame(t, {
      pause: 9000,
      view: { intro: true, turnNumber: 1 },
    });
  },
  myTurn: (o: FixtureOptions = {}) => placing(table("player", o), me),
  opponentTurn: (o: FixtureOptions = {}) => {
    const t = table("player", o);
    return placing(t, first(t));
  },
  myRevealCorrect: (o: FixtureOptions = {}) =>
    revealing(table("player", o), me, "correct"),
  myRevealWrong: (o: FixtureOptions = {}) =>
    revealing(table("player", o), me, "wrong"),
  opponentRevealCorrect: (o: FixtureOptions = {}) => {
    const t = table("player", o);
    return revealing(t, first(t), "correct");
  },
  opponentRevealWrong: (o: FixtureOptions = {}) => {
    const t = table("player", o);
    return revealing(t, first(t), "wrong");
  },
  opponentRevealPassed: (o: FixtureOptions = {}) => {
    const t = table("player", o);
    return disconnect(revealing(t, first(t), "passed"), first(t));
  },
  overIWin: (o: FixtureOptions = {}) => over(table("player", o), [me]),
  overOpponentWins: (o: FixtureOptions = {}) => {
    const t = table("player", o);
    return over(t, [first(t)]);
  },
  overTie: (o: FixtureOptions = {}) => {
    const t = table("player", o);
    return over(t, [me, first(t)]);
  },
  spectator: (o: FixtureOptions = {}) => {
    const t = table("spectator", o);
    return placing(t, t.players[1]!);
  },
  benched: (o: FixtureOptions = {}) => {
    const t = table("benched", o);
    return placing(t, t.others[0]!);
  },
  disconnectedOpponent: (o: FixtureOptions = {}) => {
    const t = table("player", o);
    return disconnect(placing(t, first(t)), first(t));
  },
} satisfies Record<string, (options?: FixtureOptions) => RoomView>;

export type ScenarioName = keyof typeof scenarios;
export const SCENARIO_NAMES = Object.keys(scenarios) as ScenarioName[];

export function isScenarioName(name: string): name is ScenarioName {
  return name in scenarios;
}
