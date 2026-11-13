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
 * The highest card scores a point (ties all score). First to the target wins.
 */

export const TARGET_SCORE = 5;

export interface RoundSummary {
  round: number;
  cards: Record<PlayerId, string>;
  winners: PlayerId[];
}

export interface HighCardState {
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
}

export type HighCardMove = { type: "peek" } | { type: "reveal" };

export interface HighCardView {
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

function dealRound(state: HighCardState): void {
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

function finishRound(state: HighCardState): void {
  const cards: Record<PlayerId, string> = {};
  for (const player of state.players) {
    cards[player] = state.table.zones[slot(player)]!.cards[0]!.face;
  }
  const best = Math.max(...Object.values(cards).map(rankValue));
  const winners = state.players.filter((p) => rankValue(cards[p]!) === best);
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

export const highCard: GameModule<HighCardState, HighCardMove, HighCardView> = {
  id: "high-card",
  name: "High Card",
  minPlayers: 2,
  maxPlayers: 8,

  setup({ players, seed }) {
    let table = addZone(addZone(createTable(seed), "deck"), "discard");
    for (const player of players) table = addZone(table, slot(player), player);
    table = shuffle(addCards(table, "deck", standardDeck()), "deck");
    const state: HighCardState = {
      table,
      players: [...players],
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      round: 1,
      turn: 0,
      firstPlayer: 0,
      revealed: 0,
      lastRound: null,
      winners: null,
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

  result(state) {
    return state.winners ? { winners: state.winners } : null;
  },
};
