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
  type GameModule,
  type PlayerId,
  type TableState,
  type TableView,
} from "@cardgame/engine";

/**
 * Demo game. Each round the table deals one face-down card to every player.
 * Players may peek at their own card at any time and reveal it on their turn.
 * The highest card scores a point. First to the target wins.
 *
 * Settings: an optional turn timer, and a tiebreaker suit for tied high cards.
 */

export const TARGET_SCORE = 5;
export const TURN_SECONDS = 20;

/** "none", or the suit letter that wins a tie. */
export type Tiebreaker = "none" | "H" | "D" | "C" | "S";

/**
 * Who scores this round: the highest rank. If several tie and one of them
 * holds the tiebreaker suit, only that player scores; otherwise all tied score.
 */
export function roundWinners(players: PlayerId[], cards: Record<PlayerId, string>, tiebreaker: Tiebreaker): PlayerId[] {
  const best = Math.max(...players.map((p) => rankValue(cards[p]!)));
  const tied = players.filter((p) => rankValue(cards[p]!) === best);
  const favoured = tied.filter((p) => cards[p]!.endsWith(tiebreaker));
  return tiebreaker !== "none" && favoured.length > 0 ? favoured : tied;
}

export interface RoundSummary {
  round: number;
  cards: Record<PlayerId, string>;
  winners: PlayerId[];
}

export interface DemoState {
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

export type DemoMove = { type: "peek" } | { type: "reveal" };

export interface DemoView {
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

function dealRound(state: DemoState): void {
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

function finishRound(state: DemoState): void {
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

  const champions = state.players.filter((p) => state.scores[p]! >= TARGET_SCORE);
  if (champions.length > 0) {
    state.winners = champions;
    return;
  }
  state.round += 1;
  state.firstPlayer = (state.firstPlayer + 1) % state.players.length;
  dealRound(state);
}

export const demo: GameModule<DemoState, DemoMove, DemoView> = {
  id: "demo",
  name: "Demo",
  minPlayers: 2,
  maxPlayers: 8,
  description: "Not a real game: a tiny round of highest-card-wins that shows the table working.",
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
      description: "When the highest cards tie, the one in this suit takes the point alone.",
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
    const state: DemoState = {
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
    if (!current.players.includes(player)) return { ok: false, error: "You are not in this game." };
    const state = structuredClone(current);
    const card = state.table.zones[slot(player)]!.cards[0]!;

    if (move.type === "peek") {
      state.table = peek(state.table, card.id, player);
      return { ok: true, state };
    }
    if (move.type === "reveal") {
      if (state.players[state.turn] !== player) return { ok: false, error: "It is not your turn." };
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
};
