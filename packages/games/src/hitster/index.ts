import { z } from "zod";
import {
  FACE_DOWN,
  FACE_UP,
  addCards,
  addZone,
  createTable,
  deal,
  moveAll,
  moveCard,
  nextRandom,
  shuffle,
  type GameModule,
  type PlayerId,
  type TableState,
} from "@cardgame/engine";
import {
  answersFor,
  buildLexicon,
  judgeGuess,
  type Lexicon,
  type Part,
} from "./guess";
import {
  SONG_LISTS,
  songKey,
  songOf,
  songForView,
  type Song,
  type SongListId,
} from "./songs";

export {
  SONGS,
  SONG_LISTS,
  songKey,
  songOf,
  type Song,
  type SongListId,
} from "./songs";

/** Songs dealt into one game, drawn at random from the full list. Keeps saved games small. */
export const DECK_SIZE = 300;
export const INTRO_MS = 12000;
export const REVEAL_MS = 4000;
export const WIN_REVEAL_MS = 6000;
/** Added to the reveal pause when the turn had bets, so clients can show them. */
export const BET_REVEAL_MS = 2000;
/** Tokens every player starts a game with. */
export const STARTING_TOKENS = 2;
/** How long the others may still bet once the current player locks in. */
export const BET_WINDOW_SECONDS = 5;

/**
 * Hitster. Every player builds a timeline of songs in order of release year.
 * On your turn the table draws a song for you; you hear it and choose where
 * it goes in your timeline. Right: the card stays. Wrong: it is discarded.
 * The first player whose timeline reaches the target wins.
 *
 * Betting: while someone else's song is in play, a player may spend one token
 * on the gap in that player's timeline where they think the song really goes.
 * Once the current player locks in, the others have BET_WINDOW_SECONDS left
 * to bet, then the turn is judged. A bet on the same gap as the placement is
 * refunded. If the placement is wrong, the first bet on a right gap steals the
 * card into the bettor's own timeline. Every other bet loses its token.
 *
 * Guessing (the "Guess in chat" setting, off while the title and artist are
 * shown): while a song is in play, any player may type its title or its
 * artist in the chat. A right guess is never shown as typed; the table is
 * told who got which part instead, and each player who gets both parts of
 * a song earns one token. A near miss is held back with a private note.
 * See guess.ts for how lines are matched.
 *
 * A card's face is the song's key (see songKey). Zones:
 *   deck, discard      shared piles
 *   current            the song being placed; its year is hidden from everyone
 *   timeline:<player>  that player's cards, oldest first, face up
 */

export interface HitsterState {
  table: TableState;
  /** Absent in legacy saved games, which use the International list. */
  songList?: SongListId;
  players: PlayerId[];
  /** Index into players of whoever is placing a song. */
  turn: number;
  /** Counts turns from 1, so clients can tell one turn from the next. */
  turnNumber: number;
  cardsToWin: number;
  /** Whether the title and artist of the current song are shown. */
  showSongInfo: boolean;
  lastTurn: TurnSummary | null;
  /** Absent in legacy saved games, which are not paused. */
  revealing?: boolean;
  /** Absent in legacy saved games, which have already started. */
  intro?: boolean;
  winners: PlayerId[] | null;
  /** Betting tokens, by index into players. Absent in legacy saved games: everyone has STARTING_TOKENS. */
  tokens?: number[];
  /** This turn's bets, oldest first. Absent in legacy saved games: none. */
  bets?: Bet[];
  /** Players who declined to bet this turn. Absent in legacy saved games: none. */
  declined?: PlayerId[];
  /** Where the current player locked in this turn's song; null until they do. Absent in legacy saved games: null. */
  locked?: number | null;
  /** The "Guess in chat" setting. Absent in legacy saved games: on. */
  guessInChat?: boolean;
  /** Who has guessed the current song's title and artist in the chat. Reset with every song. Absent in legacy saved games: nobody. */
  guessed?: Guessed;
}

/** Players who have guessed each part of the current song. Never the guesses themselves. */
export interface Guessed {
  title: PlayerId[];
  artist: PlayerId[];
}

/** A token on a gap in the current player's timeline: "the song really goes here". */
export interface Bet {
  player: PlayerId;
  /** 0 = before the current player's oldest card. */
  index: number;
}

export interface TurnSummary {
  turnNumber: number;
  /** Whose turn it was. */
  player: PlayerId;
  song: RevealedSong;
  /** How the current player did: kept the card, missed it, or gave it up. */
  outcome: "correct" | "wrong" | "passed";
  /** Where the current player placed the song. Absent when they passed. */
  index?: number;
  /** Every bet of the turn, in the order placed, and what became of it. Absent in turns from before betting. */
  bets?: BetResult[];
  /** The bettor who took the card into their own timeline, or null. Absent in turns from before betting. */
  thief?: PlayerId | null;
}

/** A judged bet, as everyone is told after the turn. */
export interface BetResult {
  player: PlayerId;
  /** The gap bet on in the current player's timeline, as it was before the turn was judged. */
  index: number;
  /**
   * refunded: same gap as the placement, or the turn was passed; the token came back.
   * stole: the placement was wrong and this was the first bet on a right gap; the card went to the bettor, the token did not come back.
   * lost: the token is gone.
   */
  result: "refunded" | "lost" | "stole";
}

export type HitsterMove =
  /** Lock the current song in at this position in your timeline (0 = before your oldest card). */
  | { type: "place"; index: number }
  /** Give up the current song. Used when the host plays an absent player's turn. */
  | { type: "pass" }
  /** Spend a token on this gap in the current player's timeline. One bet per turn; it cannot be changed. */
  | { type: "bet"; index: number }
  /** Do not bet this turn (the "Pass" button while someone else plays). */
  | { type: "declineBet" };

/** A face-up song card as sent to clients. */
export interface SongCardView {
  id: string;
  title: string;
  artist: string;
  year: number;
}

/** What everyone is told about a finished turn. */
export type RevealedSong = Pick<Song, "title" | "artist" | "year">;

/**
 * Picks `count` different songs using the game's seed, so a game can be
 * replayed exactly. Only songs that can be played (they have a Deezer id) are
 * used, unless there are too few of them to fill a deck.
 */
function sampleSongs(seed: number, count: number, list: SongListId): Song[] {
  const songs = SONG_LISTS[list];
  const playable = songs.filter((s) => s.deezerId !== null);
  const pool = playable.length >= count ? playable : [...songs];
  let rng = seed | 0;
  const picked: Song[] = [];
  while (picked.length < count && pool.length > 0) {
    const r = nextRandom(rng);
    rng = r.state;
    const i = Math.floor(r.value * pool.length);
    picked.push(pool[i]!);
    pool[i] = pool.at(-1)!;
    pool.pop();
  }
  return picked;
}

export interface HitsterView {
  players: PlayerId[];
  timelines: Record<PlayerId, SongCardView[]>;
  /** The song being placed. It never includes the year. */
  current: { id: string; title: string | null; artist: string | null } | null;
  currentPlayer: PlayerId | null;
  revealing: boolean;
  intro: boolean;
  nextPlayer: PlayerId | null;
  turnNumber: number;
  deckCount: number;
  discardCount: number;
  cardsToWin: number;
  lastTurn: TurnSummary | null;
  winners: PlayerId[] | null;
  // The fields below are always sent; they are optional only so views built before betting still type-check.
  /** Betting tokens per player. Public. */
  tokens?: Record<PlayerId, number>;
  /** Whether the current player has locked in their placement. While true and canBet is not empty, the betting window runs (see GameView.timer). */
  locked?: boolean;
  /** Your own locked placement when you are the current player and have locked in; null for everyone else. */
  lockedIndex?: number | null;
  /** This turn's bets, oldest first. index is the gap bet on, shown only to the bettor; null for everyone else. */
  bets?: { player: PlayerId; index: number | null }[];
  /** Players who declined to bet this turn. */
  declined?: PlayerId[];
  /** Players who may still bet this turn: not the current player, holding a token, not yet bet or declined. */
  canBet?: PlayerId[];
  /**
   * Whether this game lets players guess the song in the chat: the "Guess in
   * chat" setting, off while the title and artist are shown. Guesses count
   * only while a song is in play, not during the intro, a reveal or after
   * the game.
   */
  guessing?: boolean;
  /** What you have guessed of the current song; null for spectators. */
  yourGuess?: { title: boolean; artist: boolean } | null;
  /**
   * Who has guessed which part of the current song, for every player. Public,
   * like the chat lines announcing it. During a reveal it still shows the
   * song just revealed; it clears when the next song is drawn.
   */
  guesses?: Record<PlayerId, { title: boolean; artist: boolean }>;
}

const timeline = (player: PlayerId) => `timeline:${player}`;

const tokensOf = (state: HitsterState) =>
  state.tokens ?? state.players.map(() => STARTING_TOKENS);
const betsOf = (state: HitsterState) => state.bets ?? [];
const declinedOf = (state: HitsterState) => state.declined ?? [];
const lockedOf = (state: HitsterState) => state.locked ?? null;
const guessedOf = (state: HitsterState): Guessed =>
  state.guessed ?? { title: [], artist: [] };
/** Whether this game judges chat lines as guesses at all. */
const guessing = (state: HitsterState) =>
  (state.guessInChat ?? true) && !state.showSongInfo;

const creditOf = (guessed: Guessed, player: PlayerId) => ({
  title: guessed.title.includes(player),
  artist: guessed.artist.includes(player),
});

/** Whether a song is in play: moves and bets are accepted. */
const playing = (state: HitsterState) =>
  !state.winners && !state.intro && !state.revealing;

/** Players who may still bet on this turn's song. */
function bettors(state: HitsterState): PlayerId[] {
  if (!playing(state)) return [];
  const tokens = tokensOf(state);
  const bets = betsOf(state);
  const declined = declinedOf(state);
  return state.players.filter(
    (p, i) =>
      i !== state.turn &&
      tokens[i]! > 0 &&
      !bets.some((b) => b.player === p) &&
      !declined.includes(p),
  );
}

/** Built from both song lists on first use, so starting the server does not wait on it. */
let lexicon: Lexicon | undefined;
const songLexicon = () => (lexicon ??= buildLexicon(Object.values(SONG_LISTS)));

const PART_NAMES: Record<Part, string> = { title: "song", artist: "artist" };

/** Gives a player one more token. For rewards such as guessing the song. */
export function addToken(state: HitsterState, player: PlayerId): HitsterState {
  const i = state.players.indexOf(player);
  if (i < 0) throw new Error(`${player} is not in this game`);
  return {
    ...state,
    tokens: tokensOf(state).map((t, j) => (j === i ? t + 1 : t)),
  };
}

/**
 * Whether a song from `year` may sit at `index` in a timeline with these
 * years (oldest first). A song from the same year as a neighbour fits on
 * either side of it.
 */
export function fitsAt(
  years: readonly number[],
  index: number,
  year: number,
): boolean {
  const before = index > 0 ? years[index - 1]! : -Infinity;
  const after = index < years.length ? years[index]! : Infinity;
  return before <= year && year <= after;
}

const yearsOf = (state: HitsterState, player: PlayerId) =>
  state.table.zones[timeline(player)]!.cards.map(
    (c) => songOf(c.face, state.songList).year,
  );

function turnWinners(state: HitsterState): PlayerId[] | null {
  // Only the current player or the thief gained a card this turn.
  for (const player of [state.players[state.turn]!, state.lastTurn?.thief])
    if (
      player &&
      state.table.zones[timeline(player)]!.cards.length >= state.cardsToWin
    )
      return [player];
  if (
    state.table.zones.deck!.cards.length ||
    state.table.zones.discard!.cards.length
  )
    return null;
  const sizes = state.players.map(
    (p) => state.table.zones[timeline(p)]!.cards.length,
  );
  const most = Math.max(...sizes);
  return state.players.filter((_, i) => sizes[i] === most);
}

/** Draws the next song for the player whose turn it is, or ends the game if no songs are left. */
function drawSong(state: HitsterState): void {
  state.guessed = { title: [], artist: [] };
  let table = state.table;
  if (table.zones.deck!.cards.length === 0) {
    if (table.zones.discard!.cards.length === 0) {
      // Every song is in a timeline: whoever holds the most wins.
      const sizes = state.players.map(
        (p) => table.zones[timeline(p)]!.cards.length,
      );
      const most = Math.max(...sizes);
      state.winners = state.players.filter((_, i) => sizes[i] === most);
      return;
    }
    table = shuffle(moveAll(table, "discard", "deck"), "deck");
  }
  state.table = deal(table, "deck", "current", FACE_DOWN).table;
}

/**
 * Settles the turn on a cloned state: the current player placed the song at
 * `placed`, or passed (null). Moves the card, settles the bets in the order
 * they were placed, and starts the reveal.
 */
function judge(state: HitsterState, placed: number | null): void {
  const player = state.players[state.turn]!;
  const card = state.table.zones.current!.cards[0]!;
  const { title, artist, year } = songOf(card.face, state.songList);
  const line = yearsOf(state, player);
  const outcome: TurnSummary["outcome"] =
    placed === null
      ? "passed"
      : fitsAt(line, placed, year)
        ? "correct"
        : "wrong";

  const tokens = tokensOf(state).slice();
  let thief: PlayerId | null = null;
  const bets: BetResult[] = [];
  for (const bet of betsOf(state)) {
    let result: BetResult["result"] = "lost";
    if (placed === null || bet.index === placed) result = "refunded";
    else if (outcome === "wrong" && !thief && fitsAt(line, bet.index, year)) {
      result = "stole";
      thief = bet.player;
    }
    if (result === "refunded") tokens[state.players.indexOf(bet.player)]! += 1;
    bets.push({ ...bet, result });
  }

  if (outcome === "correct") {
    state.table = moveCard(state.table, card.id, timeline(player), {
      index: placed!,
      visibleTo: FACE_UP,
    });
  } else if (thief) {
    const theirs = yearsOf(state, thief);
    let index = 0;
    while (!fitsAt(theirs, index, year)) index++;
    state.table = moveCard(state.table, card.id, timeline(thief), {
      index,
      visibleTo: FACE_UP,
    });
  } else {
    state.table = moveCard(state.table, card.id, "discard", {
      visibleTo: FACE_UP,
    });
  }

  state.lastTurn = {
    turnNumber: state.turnNumber,
    player,
    song: { title, artist, year },
    outcome,
    ...(placed === null ? {} : { index: placed }),
    bets,
    thief,
  };
  state.tokens = tokens;
  state.bets = [];
  state.declined = [];
  state.locked = null;
  state.revealing = true;
}

/** Closes the betting window once nobody is left who could bet. */
function judgeIfSettled(state: HitsterState): void {
  const placed = lockedOf(state);
  if (placed !== null && bettors(state).length === 0) judge(state, placed);
}

export const hitster: GameModule<HitsterState, HitsterMove, HitsterView> = {
  id: "hitster",
  moveSchema: z.discriminatedUnion("type", [
    z.object({ type: z.literal("place"), index: z.number().int().min(0) }),
    z.object({ type: z.literal("pass") }),
    z.object({ type: z.literal("bet"), index: z.number().int().min(0) }),
    z.object({ type: z.literal("declineBet") }),
  ]),
  name: "Hitster",
  minPlayers: 2,
  maxPlayers: 8,
  description:
    "Hear a song and place it in your timeline by release year. First to fill their timeline wins.",
  settings: [
    {
      type: "select",
      id: "songList",
      label: "Song list",
      options: [
        { value: "international", label: "International" },
        { value: "brasil", label: "Brasil" },
      ],
      default: "international",
    },
    {
      type: "select",
      id: "cardsToWin",
      label: "Cards to win",
      description:
        "The first player with this many songs in their timeline wins.",
      options: [
        { value: "5", label: "5: short game" },
        { value: "8", label: "8" },
        { value: "10", label: "10: classic" },
      ],
      default: "10",
    },
    {
      type: "toggle",
      id: "guessInChat",
      label: "Guess in chat",
      description:
        "Type the song and the artist in the chat. Get both to earn a token.",
      default: true,
    },
    {
      type: "toggle",
      id: "showSongInfo",
      label: "Show title and artist",
      description:
        "Shows the song's name while it plays. Much easier; meant for playing without sound.",
      default: false,
    },
  ],

  setup({ players, seed, settings }) {
    const songList =
      settings.songList === "brasil" ? "brasil" : "international";
    let table = createTable(seed);
    for (const zone of ["deck", "discard", "current"])
      table = addZone(table, zone);
    for (const player of players)
      table = addZone(table, timeline(player), player);
    table = shuffle(
      addCards(
        table,
        "deck",
        sampleSongs(seed, DECK_SIZE, songList).map(songKey),
      ),
      "deck",
    );
    for (const player of players)
      table = deal(table, "deck", timeline(player), FACE_UP).table;

    const state: HitsterState = {
      table,
      songList,
      players: [...players],
      turn: 0,
      turnNumber: 1,
      cardsToWin: Number(settings.cardsToWin),
      showSongInfo: settings.showSongInfo === true,
      lastTurn: null,
      revealing: false,
      intro: true,
      winners: null,
      tokens: players.map(() => STARTING_TOKENS),
      bets: [],
      declined: [],
      locked: null,
      // Settings saved before this option existed lack it: on, like its default.
      guessInChat: settings.guessInChat !== false,
      guessed: { title: [], artist: [] },
    };
    drawSong(state);
    return state;
  },

  applyMove(current, player, move) {
    if (current.winners) return { ok: false, error: "The game is over." };
    if (current.intro)
      return { ok: false, error: "The game is getting ready." };
    if (current.revealing)
      return { ok: false, error: "The previous turn is still being revealed." };
    const active = current.players[current.turn]!;
    const gapsIn = (p: PlayerId) => yearsOf(current, p).length;
    const isGap = (index: number, p: PlayerId) =>
      Number.isInteger(index) && index >= 0 && index <= gapsIn(p);

    if (move.type === "place" || move.type === "pass") {
      if (active !== player)
        return { ok: false, error: "It is not your turn." };
      if (lockedOf(current) !== null)
        return { ok: false, error: "You have already placed this song." };
      if (move.type === "place" && !isGap(move.index, player))
        return { ok: false, error: "That is not a spot in your timeline." };
      const state = structuredClone(current);
      if (move.type === "pass") {
        judge(state, null);
      } else {
        state.locked = move.index;
        judgeIfSettled(state);
      }
      return { ok: true, state };
    }

    if (move.type === "bet" || move.type === "declineBet") {
      const seat = current.players.indexOf(player);
      if (seat < 0) return { ok: false, error: "You are not in this game." };
      if (player === active)
        return { ok: false, error: "You cannot bet on your own turn." };
      if (betsOf(current).some((b) => b.player === player))
        return { ok: false, error: "You have already bet this turn." };
      if (declinedOf(current).includes(player))
        return {
          ok: false,
          error: "You have already passed on betting this turn.",
        };
      if (tokensOf(current)[seat]! < 1)
        return { ok: false, error: "You have no tokens to bet." };
      if (move.type === "bet" && !isGap(move.index, active))
        return {
          ok: false,
          error: "That is not a gap in the current player's timeline.",
        };
      const state = structuredClone(current);
      if (move.type === "bet") {
        state.tokens = tokensOf(state).map((t, i) => (i === seat ? t - 1 : t));
        state.bets = [...betsOf(state), { player, index: move.index }];
      } else {
        state.declined = [...declinedOf(state), player];
      }
      judgeIfSettled(state);
      return { ok: true, state };
    }

    return { ok: false, error: "Unknown move." };
  },

  pauseMs(state) {
    if (state.intro) return INTRO_MS;
    if (!state.revealing) return null;
    const extra = state.lastTurn?.bets?.length ? BET_REVEAL_MS : 0;
    return (turnWinners(state) ? WIN_REVEAL_MS : REVEAL_MS) + extra;
  },

  resume(current) {
    const state = structuredClone(current);
    if (state.intro) {
      state.intro = false;
      return state;
    }
    if (!state.revealing) return state;
    state.revealing = false;
    state.winners = turnWinners(state);
    if (!state.winners) {
      state.turn = (state.turn + 1) % state.players.length;
      state.turnNumber += 1;
      drawSong(state);
    }
    return state;
  },

  validateState(state) {
    for (const zone of Object.values(state.table.zones)) {
      for (const card of zone.cards) songOf(card.face, state.songList);
    }
  },

  view(state, viewer) {
    // Built field by field rather than from the raw table, so the current song's year,
    // the locked placement and other players' bet gaps cannot slip out.
    const tokens = tokensOf(state);
    const locked = lockedOf(state);
    const guessed = guessedOf(state);
    const card =
      state.winners || state.revealing || state.intro
        ? undefined
        : state.table.zones.current!.cards[0];
    const song = card ? songForView(card.face, state.songList) : null;
    return {
      players: state.players,
      timelines: Object.fromEntries(
        state.players.map((p) => [
          p,
          state.table.zones[timeline(p)]!.cards.map((c) => {
            const { title, artist, year } = songForView(c.face, state.songList);
            return { id: c.id, title, artist, year };
          }),
        ]),
      ),
      current:
        card && song
          ? {
              id: card.id,
              title: state.showSongInfo ? song.title : null,
              artist: state.showSongInfo ? song.artist : null,
            }
          : null,
      currentPlayer: state.winners ? null : state.players[state.turn]!,
      revealing: state.revealing === true,
      intro: state.intro === true,
      nextPlayer:
        state.revealing && !turnWinners(state)
          ? state.players[(state.turn + 1) % state.players.length]!
          : null,
      turnNumber: state.turnNumber,
      deckCount: state.table.zones.deck!.cards.length,
      discardCount: state.table.zones.discard!.cards.length,
      cardsToWin: state.cardsToWin,
      lastTurn: state.lastTurn,
      winners: state.winners,
      tokens: Object.fromEntries(state.players.map((p, i) => [p, tokens[i]!])),
      locked: locked !== null,
      lockedIndex:
        viewer !== null && viewer === state.players[state.turn] ? locked : null,
      bets: betsOf(state).map((b) => ({
        player: b.player,
        index: b.player === viewer ? b.index : null,
      })),
      declined: declinedOf(state),
      canBet: bettors(state),
      guessing: guessing(state),
      yourGuess:
        viewer !== null && state.players.includes(viewer)
          ? creditOf(guessed, viewer)
          : null,
      guesses: Object.fromEntries(
        state.players.map((p) => [p, creditOf(guessed, p)]),
      ),
    };
  },

  activePlayers(state) {
    if (!playing(state)) return [];
    // Once the placement is locked in, the game waits only on those who may still bet.
    return lockedOf(state) === null
      ? [state.players[state.turn]!]
      : bettors(state);
  },

  autoMove(state, player) {
    if (!playing(state)) return null;
    if (lockedOf(state) === null)
      return state.players[state.turn] === player ? { type: "pass" } : null;
    return bettors(state).includes(player) ? { type: "declineBet" } : null;
  },

  turnTimeLimit(state) {
    return playing(state) && lockedOf(state) !== null
      ? BET_WINDOW_SECONDS
      : null;
  },

  clockKey(state) {
    // One key for the whole betting window, so a bet does not restart its countdown.
    return `${state.turnNumber}:${lockedOf(state) === null ? "place" : "bets"}`;
  },

  currentTrack(state) {
    if (state.intro) return null;
    if (state.revealing && state.lastTurn) {
      const { title, artist, deezerId } = songOf(
        songKey(state.lastTurn.song),
        state.songList,
      );
      return { title, artist, deezerId };
    }
    const card = state.winners
      ? undefined
      : state.table.zones.current!.cards[0];
    if (!card) return null;
    const { title, artist, deezerId } = songOf(card.face, state.songList);
    return { title, artist, deezerId };
  },

  result(state) {
    return state.winners ? { winners: state.winners } : null;
  },

  chat(state, player, text, name) {
    if (!guessing(state) || !playing(state)) return null;
    const card = state.table.zones.current!.cards[0];
    if (!card) return null;
    const lexicon = songLexicon();
    const answers = answersFor(songOf(card.face, state.songList), lexicon);
    const guessed = guessedOf(state);
    const inGame = player !== null && state.players.includes(player);
    const had = inGame
      ? creditOf(guessed, player)
      : { title: false, artist: false };
    const verdict = judgeGuess(text, answers, had, lexicon);
    if (!verdict) return null;
    // Held back from everyone, so watchers cannot spoil the song for the table either.
    if (!inGame)
      return {
        deliver: false,
        note: "Only players in this game can guess the song. Your message wasn't sent.",
      };
    if (verdict.kind === "near")
      return {
        deliver: false,
        note: "Close, but not quite. Your message wasn't sent.",
      };
    if (verdict.kind === "repeat")
      return {
        deliver: false,
        note: `You already got the ${PART_NAMES[verdict.part]}.`,
      };
    let next: HitsterState = {
      ...state,
      guessed: {
        title: verdict.parts.includes("title")
          ? [...guessed.title, player]
          : guessed.title,
        artist: verdict.parts.includes("artist")
          ? [...guessed.artist, player]
          : guessed.artist,
      },
    };
    const announce = verdict.parts.map(
      (part) => `${name} guessed the ${PART_NAMES[part]} correctly.`,
    );
    // Only the line that completes both parts earns the token, so it comes once per song.
    const credit = creditOf(next.guessed!, player);
    if (credit.title && credit.artist) {
      next = addToken(next, player);
      announce.push(`${name} got both and earns a token.`);
    }
    return { state: next, deliver: false, announce };
  },
};
