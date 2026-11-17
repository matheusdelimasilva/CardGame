import { z } from "zod";
import {
  FACE_DOWN,
  FACE_UP,
  addCards,
  addZone,
  createTable,
  deal,
  moveAll,
  peek,
  rankValue,
  reveal,
  shuffle,
  standardDeck,
  viewTable,
  defineGame,
  type AnyGame,
  type PlayerId,
  type TableState,
  type TableView,
} from "@cardgame/engine";

/**
 * Test-only fixture game. Hitster uses none of the engine features the server
 * must still support, so this exercises them: hidden hands (peek and reveal),
 * a single active player per turn, an optional turn timer with an autoMove on
 * expiry, no audio, and toggle and select settings.
 *
 * Each round deals one face-down card to every player. The highest card
 * scores a point; the first to the target wins.
 */

const TARGET_SCORE = 5;
const TURN_SECONDS = 20;

/** "none", or the suit letter that wins a tie. */
type Tiebreaker = "none" | "H" | "D" | "C" | "S";

/**
 * Who scores this round: the highest rank. If several tie and one of them
 * holds the tiebreaker suit, only that player scores; otherwise all tied score.
 */
function roundWinners(
  players: PlayerId[],
  cards: Record<PlayerId, string>,
  tiebreaker: Tiebreaker,
): PlayerId[] {
  const best = Math.max(...players.map((p) => rankValue(cards[p]!)));
  const tied = players.filter((p) => rankValue(cards[p]!) === best);
  const favoured = tied.filter((p) => cards[p]!.endsWith(tiebreaker));
  return tiebreaker !== "none" && favoured.length > 0 ? favoured : tied;
}

interface RoundSummary {
  round: number;
  cards: Record<PlayerId, string>;
  winners: PlayerId[];
}

export interface FixtureState {
  table: TableState;
  players: PlayerId[];
  scores: Record<PlayerId, number>;
  round: number;
  /** Index into players of whoever reveals next. */
  turn: number;
  /** Index into players of whoever started this round. */
  firstPlayer: number;
  revealed: number;
  lastRound: RoundSummary | null;
  winners: PlayerId[] | null;
  turnTimer: boolean;
  tiebreaker: Tiebreaker;
}

export type FixtureMove = { type: "peek" } | { type: "reveal" };

export interface FixtureView {
  table: TableView;
  players: PlayerId[];
  scores: Record<PlayerId, number>;
  round: number;
  currentPlayer: PlayerId | null;
  target: number;
  lastRound: RoundSummary | null;
  winners: PlayerId[] | null;
}

const slot = (player: PlayerId) => `slot:${player}`;

function dealRound(state: FixtureState): void {
  let table = state.table;
  if (table.zones.deck!.cards.length < state.players.length) {
    table = shuffle(moveAll(table, "discard", "deck"), "deck");
  }
  for (const player of state.players) {
    table = deal(table, "deck", slot(player), FACE_DOWN).table;
  }
  state.table = table;
  state.revealed = 0;
  state.turn = state.firstPlayer;
}

function finishRound(state: FixtureState): void {
  const cards: Record<PlayerId, string> = {};
  for (const player of state.players) {
    cards[player] = state.table.zones[slot(player)]!.cards[0]!.face;
  }
  const winners = roundWinners(state.players, cards, state.tiebreaker);
  for (const winner of winners) state.scores[winner]! += 1;
  state.lastRound = { round: state.round, cards, winners };

  for (const player of state.players) {
    state.table = moveAll(state.table, slot(player), "discard", FACE_UP);
  }

  const champions = state.players.filter(
    (p) => state.scores[p]! >= TARGET_SCORE,
  );
  if (champions.length > 0) {
    state.winners = champions;
    return;
  }
  state.round += 1;
  state.firstPlayer = (state.firstPlayer + 1) % state.players.length;
  dealRound(state);
}

export const fixture = defineGame<FixtureState, FixtureMove, FixtureView>({
  id: "fixture",
  moveSchema: z.discriminatedUnion("type", [
    z.object({ type: z.literal("peek") }),
    z.object({ type: z.literal("reveal") }),
  ]),
  name: "Fixture",
  minPlayers: 2,
  maxPlayers: 8,
  description: "Test fixture.",
  settings: [
    {
      type: "toggle",
      id: "turnTimer",
      label: "Turn timer",
      description: `Each turn lasts ${TURN_SECONDS} seconds. When time runs out, the card is revealed for the player.`,
      default: false,
    },
    {
      type: "select",
      id: "tiebreaker",
      label: "Tiebreaker suit",
      description:
        "When the highest cards tie, the one in this suit takes the point alone.",
      options: [
        { value: "none", label: "None: tied players all score" },
        { value: "H", label: "Hearts" },
        { value: "D", label: "Diamonds" },
        { value: "C", label: "Clubs" },
        { value: "S", label: "Spades" },
      ],
      default: "none",
    },
  ],

  setup({ players, seed, settings }) {
    let table = addZone(addZone(createTable(seed), "deck"), "discard");
    for (const player of players) table = addZone(table, slot(player), player);
    table = shuffle(addCards(table, "deck", standardDeck()), "deck");
    const state: FixtureState = {
      table,
      players: [...players],
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      round: 1,
      turn: 0,
      firstPlayer: 0,
      revealed: 0,
      lastRound: null,
      winners: null,
      turnTimer: settings.turnTimer === true,
      tiebreaker: settings.tiebreaker as Tiebreaker,
    };
    dealRound(state);
    return state;
  },

  applyMove(current, player, move) {
    if (current.winners) return { ok: false, error: "The game is over." };
    if (!current.players.includes(player))
      return { ok: false, error: "You are not in this game." };
    const state = structuredClone(current);
    const card = state.table.zones[slot(player)]!.cards[0]!;

    if (move.type === "peek") {
      state.table = peek(state.table, card.id, player);
      return { ok: true, state };
    }
    if (move.type === "reveal") {
      if (state.players[state.turn] !== player)
        return { ok: false, error: "It is not your turn." };
      state.table = reveal(state.table, card.id);
      state.revealed += 1;
      if (state.revealed === state.players.length) finishRound(state);
      else state.turn = (state.turn + 1) % state.players.length;
      return { ok: true, state };
    }
    return { ok: false, error: "Unknown move." };
  },

  view(state, viewer) {
    return {
      table: viewTable(state.table, viewer),
      players: state.players,
      scores: state.scores,
      round: state.round,
      currentPlayer: state.winners ? null : state.players[state.turn]!,
      target: TARGET_SCORE,
      lastRound: state.lastRound,
      winners: state.winners,
    };
  },

  activePlayers(state) {
    return state.winners ? [] : [state.players[state.turn]!];
  },

  autoMove(state, player) {
    return state.players[state.turn] === player ? { type: "reveal" } : null;
  },

  turnTimeLimit(state) {
    return state.turnTimer && !state.winners ? TURN_SECONDS : null;
  },

  result(state) {
    return state.winners ? { winners: state.winners } : null;
  },
});

/**
 * Makes the fixture resolvable by id. Tests mount it with
 * `vi.mock("@cardgame/games", async (original) => withFixture(await original()))`,
 * so production code gets no test-only registration. The fixture is left out
 * of `games` on purpose: that is the public catalogue, and it stays Hitster only.
 */
export function withFixture<
  T extends {
    getGame: (id: string) => AnyGame | null;
    requireGame: (id: string) => AnyGame;
  },
>(real: T): T {
  const getGame = (id: string) =>
    id === fixture.id ? fixture : real.getGame(id);
  const requireGame = (id: string) => {
    const game = getGame(id);
    if (!game) throw new Error(`Unknown game ${id}`);
    return game;
  };
  return { ...real, getGame, requireGame };
}
