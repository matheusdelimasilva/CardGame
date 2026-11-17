/** How a seat looks at the table: one animal and one chip colour per seat, shared by the lobby and the game screen. */

export const ANIMALS = ["🐼", "🐻", "🐰", "🐸", "🐱", "🐷", "🦊", "🐵"];

/** Chip colour and the darker edge under it, cycled by seat. */
export const CHIPS = [
  ["#ffd84a", "#c9a52e"],
  ["#ef4a3c", "#b8362b"],
  ["#3b8cf0", "#2a69b8"],
  ["#d8d2bf", "#a8a28f"],
] as const;

/** Your own seat is always gold, so you can find yourself at a glance. */
export const MY_CHIP = "#ffd84a";
export const MY_CHIP_EDGE = "#c9a52e";

export interface SeatLook {
  animal: string;
  chip: string;
  chipEdge: string;
}

/** Someone without a seat (a spectator, or a player who stood up mid-game). */
export const UNSEATED_LOOK: SeatLook = {
  animal: "🃏",
  chip: "#d8d2bf",
  chipEdge: "#a8a28f",
};

/** The look of `seat`; `mine` is whether the viewer sits there. */
export function seatLook(seat: number | null, mine = false): SeatLook {
  if (seat === null) return UNSEATED_LOOK;
  const [chip, chipEdge] = CHIPS[seat % CHIPS.length]!;
  return {
    animal: ANIMALS[seat % ANIMALS.length]!,
    chip: mine ? MY_CHIP : chip,
    chipEdge: mine ? MY_CHIP_EDGE : chipEdge,
  };
}
