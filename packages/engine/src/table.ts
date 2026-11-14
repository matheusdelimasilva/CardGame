import { nextRandom } from "./rng";

export type PlayerId = string;
export type ZoneId = string;
export type CardId = string;

/** Who may see a card's face: everyone, or only the listed players (empty list = nobody). */
export type Visibility = "all" | PlayerId[];

export const FACE_UP: Visibility = "all";
export const FACE_DOWN: Visibility = [];

export interface Card {
  /** Opaque id. It never encodes the face, so it is safe to send to every client. */
  id: CardId;
  face: string;
  visibleTo: Visibility;
}

export interface Zone {
  id: ZoneId;
  owner: PlayerId | null;
  /** Ordered bottom to top: the last card is the top of the pile. */
  cards: Card[];
}

export interface TableState {
  zones: Record<ZoneId, Zone>;
  nextCardId: number;
  rng: number;
}

export class EngineError extends Error {}

const clone = (t: TableState): TableState => structuredClone(t);

function zoneOf(t: TableState, id: ZoneId): Zone {
  const zone = t.zones[id];
  if (!zone) throw new EngineError(`Unknown zone: ${id}`);
  return zone;
}

export function createTable(seed: number): TableState {
  return { zones: {}, nextCardId: 1, rng: seed | 0 };
}

export function addZone(t: TableState, id: ZoneId, owner: PlayerId | null = null): TableState {
  if (t.zones[id]) throw new EngineError(`Zone already exists: ${id}`);
  const next = clone(t);
  next.zones[id] = { id, owner, cards: [] };
  return next;
}

/** Creates new cards on top of a zone, in the order given. */
export function addCards(
  t: TableState,
  zoneId: ZoneId,
  faces: readonly string[],
  visibleTo: Visibility = FACE_DOWN,
): TableState {
  const next = clone(t);
  const zone = zoneOf(next, zoneId);
  for (const face of faces) {
    zone.cards.push({ id: `c${next.nextCardId++}`, face, visibleTo: structuredClone(visibleTo) });
  }
  return next;
}

/**
 * Shuffles a zone and turns every card face down. Cards get fresh ids, so a
 * client that saw a card earlier cannot follow it through the shuffle.
 */
export function shuffle(t: TableState, zoneId: ZoneId): TableState {
  const next = clone(t);
  const cards = zoneOf(next, zoneId).cards;
  for (let i = cards.length - 1; i > 0; i--) {
    const r = nextRandom(next.rng);
    next.rng = r.state;
    const j = Math.floor(r.value * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  for (const card of cards) {
    card.id = `c${next.nextCardId++}`;
    card.visibleTo = [];
  }
  return next;
}

export function findCard(t: TableState, cardId: CardId): { zone: Zone; index: number; card: Card } {
  for (const zone of Object.values(t.zones)) {
    const index = zone.cards.findIndex((c) => c.id === cardId);
    if (index >= 0) return { zone, index, card: zone.cards[index]! };
  }
  throw new EngineError(`Unknown card: ${cardId}`);
}

export interface MoveOptions {
  /** New visibility. Omit to keep the card's current visibility. */
  visibleTo?: Visibility;
  /** Put the card under the pile instead of on top. */
  toBottom?: boolean;
  /** Insert at this position, counted from the bottom (0 = first). Wins over toBottom. */
  index?: number;
}

export function moveCard(t: TableState, cardId: CardId, to: ZoneId, opts: MoveOptions = {}): TableState {
  const next = clone(t);
  const { zone, index, card } = findCard(next, cardId);
  const target = zoneOf(next, to);
  zone.cards.splice(index, 1);
  if (opts.visibleTo !== undefined) card.visibleTo = structuredClone(opts.visibleTo);
  if (opts.index !== undefined) {
    if (!Number.isInteger(opts.index) || opts.index < 0 || opts.index > target.cards.length) {
      throw new EngineError(`Position ${opts.index} is outside zone ${to}`);
    }
    target.cards.splice(opts.index, 0, card);
  } else if (opts.toBottom) target.cards.unshift(card);
  else target.cards.push(card);
  return next;
}

/** Moves every card of one zone onto another, keeping their order. */
export function moveAll(t: TableState, from: ZoneId, to: ZoneId, visibleTo?: Visibility): TableState {
  const next = clone(t);
  const source = zoneOf(next, from);
  const target = zoneOf(next, to);
  for (const card of source.cards) {
    if (visibleTo !== undefined) card.visibleTo = structuredClone(visibleTo);
    target.cards.push(card);
  }
  source.cards = [];
  return next;
}

/** The table deals the top card of a zone to another zone, with the given visibility. */
export function deal(
  t: TableState,
  from: ZoneId,
  to: ZoneId,
  visibleTo: Visibility,
): { table: TableState; cardId: CardId } {
  const top = zoneOf(t, from).cards.at(-1);
  if (!top) throw new EngineError(`Zone is empty: ${from}`);
  return { table: moveCard(t, top.id, to, { visibleTo }), cardId: top.id };
}

export function setVisibility(t: TableState, cardId: CardId, visibleTo: Visibility): TableState {
  const next = clone(t);
  findCard(next, cardId).card.visibleTo = structuredClone(visibleTo);
  return next;
}

/** Turns a card face up for everyone. */
export function reveal(t: TableState, cardId: CardId): TableState {
  return setVisibility(t, cardId, FACE_UP);
}

/** Lets one more player see a card without showing it to the others. */
export function peek(t: TableState, cardId: CardId, player: PlayerId): TableState {
  const { card } = findCard(t, cardId);
  if (card.visibleTo === "all" || card.visibleTo.includes(player)) return t;
  return setVisibility(t, cardId, [...card.visibleTo, player]);
}
