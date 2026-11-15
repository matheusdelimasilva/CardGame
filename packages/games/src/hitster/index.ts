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
import { SONGS, songKey, songOf, songForView, type Song } from "./songs";

export { SONGS, songKey, songOf, type Song } from "./songs";

/** Songs dealt into one game, drawn at random from the full list. Keeps saved games small. */
export const DECK_SIZE = 300;

/**
 * Hitster. Every player builds a timeline of songs in order of release year.
 * On your turn the table draws a song for you; you hear it and choose where
 * it goes in your timeline. Right: the card stays. Wrong: it is discarded.
 * The first player whose timeline reaches the target wins.
 *
 * A card's face is the song's key (see songKey). Zones:
 *   deck, discard      shared piles
 *   current            the song being placed; its year is hidden from everyone
 *   timeline:<player>  that player's cards, oldest first, face up
 */

export interface HitsterState {
  table: TableState;
  players: PlayerId[];
  /** Index into players of whoever is placing a song. */
  turn: number;
  /** Counts turns from 1, so clients can tell one turn from the next. */
  turnNumber: number;
  cardsToWin: number;
  /** Whether the title and artist of the current song are shown. */
  showSongInfo: boolean;
  lastTurn: TurnSummary | null;
  winners: PlayerId[] | null;
}

export interface TurnSummary {
  turnNumber: number;
  player: PlayerId;
  song: RevealedSong;
  outcome: "correct" | "wrong" | "passed";
}

export type HitsterMove =
  /** Put the current song at this position in your timeline (0 = before your oldest card). */
  | { type: "place"; index: number }
  /** Give up the current song. Used when the host plays an absent player's turn. */
  | { type: "pass" };

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
function sampleSongs(seed: number, count: number): Song[] {
  const playable = SONGS.filter((s) => s.deezerId !== null);
  const pool = playable.length >= count ? playable : [...SONGS];
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
  turnNumber: number;
  deckCount: number;
  discardCount: number;
  cardsToWin: number;
  lastTurn: TurnSummary | null;
  winners: PlayerId[] | null;
}

const timeline = (player: PlayerId) => `timeline:${player}`;

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
  state.table.zones[timeline(player)]!.cards.map((c) => songOf(c.face).year);

/** Draws the next song for the player whose turn it is, or ends the game if no songs are left. */
function drawSong(state: HitsterState): void {
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

export const hitster: GameModule<HitsterState, HitsterMove, HitsterView> = {
  id: "hitster",
  name: "Hitster",
  minPlayers: 2,
  maxPlayers: 8,
  description:
    "Hear a song and place it in your timeline by release year. First to fill their timeline wins.",
  settings: [
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
      id: "showSongInfo",
      label: "Show title and artist",
      description:
        "Shows the song's name while it plays. Much easier; meant for playing without sound.",
      default: false,
    },
  ],

  setup({ players, seed, settings }) {
    let table = createTable(seed);
    for (const zone of ["deck", "discard", "current"])
      table = addZone(table, zone);
    for (const player of players)
      table = addZone(table, timeline(player), player);
    table = shuffle(
      addCards(table, "deck", sampleSongs(seed, DECK_SIZE).map(songKey)),
      "deck",
    );
    for (const player of players)
      table = deal(table, "deck", timeline(player), FACE_UP).table;

    const state: HitsterState = {
      table,
      players: [...players],
      turn: 0,
      turnNumber: 1,
      cardsToWin: Number(settings.cardsToWin),
      showSongInfo: settings.showSongInfo === true,
      lastTurn: null,
      winners: null,
    };
    drawSong(state);
    return state;
  },

  applyMove(current, player, move) {
    if (current.winners) return { ok: false, error: "The game is over." };
    if (current.players[current.turn] !== player)
      return { ok: false, error: "It is not your turn." };
    const state = structuredClone(current);
    const card = state.table.zones.current!.cards[0]!;
    const { title, artist, year } = songOf(card.face);
    const song: RevealedSong = { title, artist, year };
    let outcome: TurnSummary["outcome"];

    if (move.type === "place") {
      const years = yearsOf(state, player);
      if (
        !Number.isInteger(move.index) ||
        move.index < 0 ||
        move.index > years.length
      ) {
        return { ok: false, error: "That is not a spot in your timeline." };
      }
      outcome = fitsAt(years, move.index, song.year) ? "correct" : "wrong";
    } else if (move.type === "pass") {
      outcome = "passed";
    } else {
      return { ok: false, error: "Unknown move." };
    }

    state.table =
      outcome === "correct"
        ? moveCard(state.table, card.id, timeline(player), {
            index: (move as { index: number }).index,
            visibleTo: FACE_UP,
          })
        : moveCard(state.table, card.id, "discard", { visibleTo: FACE_UP });
    state.lastTurn = { turnNumber: state.turnNumber, player, song, outcome };

    if (state.table.zones[timeline(player)]!.cards.length >= state.cardsToWin) {
      state.winners = [player];
      return { ok: true, state };
    }
    state.turn = (state.turn + 1) % state.players.length;
    state.turnNumber += 1;
    drawSong(state);
    return { ok: true, state };
  },

  validateState(state) {
    for (const zone of Object.values(state.table.zones)) {
      for (const card of zone.cards) songOf(card.face);
    }
  },

  view(state) {
    // Built field by field rather than from the raw table, so the current song's year cannot slip out.
    const card = state.winners
      ? undefined
      : state.table.zones.current!.cards[0];
    const song = card ? songForView(card.face) : null;
    return {
      players: state.players,
      timelines: Object.fromEntries(
        state.players.map((p) => [
          p,
          state.table.zones[timeline(p)]!.cards.map((c) => {
            const { title, artist, year } = songForView(c.face);
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
      turnNumber: state.turnNumber,
      deckCount: state.table.zones.deck!.cards.length,
      discardCount: state.table.zones.discard!.cards.length,
      cardsToWin: state.cardsToWin,
      lastTurn: state.lastTurn,
      winners: state.winners,
    };
  },

  activePlayers(state) {
    return state.winners ? [] : [state.players[state.turn]!];
  },

  autoMove(state, player) {
    return state.players[state.turn] === player ? { type: "pass" } : null;
  },

  currentTrack(state) {
    const card = state.winners
      ? undefined
      : state.table.zones.current!.cards[0];
    if (!card) return null;
    const { title, artist, deezerId } = songOf(card.face);
    return { title, artist, deezerId };
  },

  result(state) {
    return state.winners ? { winners: state.winners } : null;
  },
};
