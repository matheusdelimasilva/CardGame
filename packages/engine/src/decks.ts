export const SUITS = ["S", "H", "D", "C"] as const;
export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const;

/** The 52 faces of a standard deck, written as rank then suit: "10H", "AS". */
export function standardDeck(): string[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`));
}

/** Rank value of a standard face, from 2 up to 14 for the ace. */
export function rankValue(face: string): number {
  const index = (RANKS as readonly string[]).indexOf(face.slice(0, -1));
  if (index < 0) throw new Error(`Not a standard card: ${face}`);
  return index + 2;
}
