import type { DemoView } from "@cardgame/games";
import type { GameView } from "@cardgame/protocol";
import { Card, faceLabel } from "../Card";
import type { GameProps, GameUI } from "./types";

const viewOf = (game: GameView) => game.view as DemoView;
const cardOf = (game: GameView, playerId: string) => viewOf(game).table.zones[`slot:${playerId}`]?.cards[0] ?? null;

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export const demoUI: GameUI = {
  Center({ game }) {
    const view = viewOf(game);
    const deck = view.table.zones.deck!.cards;
    const discard = view.table.zones.discard!.cards;
    return (
      <div className="center-game">
        <div className="piles">
          <div className="pile">
            {deck.length ? <Card face={null} size="md" /> : <span className="card md ghost" />}
            <span className="pile-label">deck {deck.length}</span>
          </div>
          <div className="pile">
            {discard.length ? <Card face={discard.at(-1)!.face} size="md" /> : <span className="card md ghost" />}
            <span className="pile-label">discard {discard.length}</span>
          </div>
        </div>
        <div className="center-note">
          round {view.round} · first to {view.target}
        </div>
      </div>
    );
  },

  SeatCards({ game, playerId }) {
    const card = cardOf(game, playerId);
    return card ? <Card face={card.faceUp ? card.face : null} size="sm" /> : null;
  },

  seatTag(game, playerId) {
    return `★ ${viewOf(game).scores[playerId] ?? 0}`;
  },

  Hand({ game, you, move }) {
    const card = you ? cardOf(game, you) : null;
    if (!card) return null;
    const peeked = card.face !== null && !card.faceUp;
    return (
      <div className="hand">
        <button
          className="hand-card"
          onClick={() => card.face === null && move({ type: "peek" })}
          disabled={card.face !== null}
          aria-label={card.face === null ? "Peek at your card" : undefined}
        >
          <Card face={card.face} size="lg" className={peeked ? "private" : ""} />
        </button>
        <span className="hand-note">
          {card.face === null ? "tap the card to peek" : peeked ? "only you can see this" : "revealed to the table"}
        </span>
      </div>
    );
  },

  Actions({ game, you, nameOf, move }) {
    const view = viewOf(game);
    if (!you || !view.currentPlayer) return null;
    const card = cardOf(game, you);
    const myTurn = view.currentPlayer === you;
    const revealed = card?.faceUp ?? false;
    return (
      <div className="actions">
        <p className="actions-status">
          {myTurn
            ? "Reveal your card to the table."
            : revealed
              ? `Your card is out. Waiting for ${nameOf(view.currentPlayer)}.`
              : `${nameOf(view.currentPlayer)} reveals first. You can peek meanwhile.`}
        </p>
        <div className="actions-buttons">
          <button className="btn blue" disabled={!card || card.face !== null} onClick={() => move({ type: "peek" })}>
            Peek
          </button>
          <button className="btn gold" disabled={!myTurn} onClick={() => move({ type: "reveal" })}>
            Reveal
          </button>
        </div>
      </div>
    );
  },

  announcement(game, nameOf) {
    const last = viewOf(game).lastRound;
    if (!last) return null;
    const winners = last.winners.map(nameOf);
    return {
      key: `round-${last.round}`,
      title: winners.length > 1 ? "Tie!" : `${winners[0]} wins`,
      detail:
        (winners.length > 1 ? `${list(winners)} each score. ` : "") +
        game.players.map((p) => `${nameOf(p)} ${faceLabel(last.cards[p] ?? "?")}`).join("  ·  "),
    };
  },
};
