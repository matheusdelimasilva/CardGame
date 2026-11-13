import type { Card, CardId, PlayerId, TableState, ZoneId } from "./table";

export interface CardView {
  id: CardId;
  /** null when this viewer may not see the card. */
  face: string | null;
  /** True when the card is face up for the whole table, not just for this viewer. */
  faceUp: boolean;
}

export interface ZoneView {
  id: ZoneId;
  owner: PlayerId | null;
  cards: CardView[];
}

export interface TableView {
  zones: Record<ZoneId, ZoneView>;
}

/** A null viewer is a spectator: they see only what is face up for everyone. */
export function canSee(card: Card, viewer: PlayerId | null): boolean {
  if (card.visibleTo === "all") return true;
  return viewer !== null && card.visibleTo.includes(viewer);
}

/** The only shape of the table that may be sent to a client. */
export function viewTable(t: TableState, viewer: PlayerId | null): TableView {
  const zones: Record<ZoneId, ZoneView> = {};
  for (const zone of Object.values(t.zones)) {
    zones[zone.id] = {
      id: zone.id,
      owner: zone.owner,
      cards: zone.cards.map((card) => ({
        id: card.id,
        face: canSee(card, viewer) ? card.face : null,
        faceUp: card.visibleTo === "all",
      })),
    };
  }
  return { zones };
}
