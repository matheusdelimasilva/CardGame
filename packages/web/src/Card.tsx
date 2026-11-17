const SUITS: Record<string, { glyph: string; color: string }> = {
  S: { glyph: "♠︎", color: "ink" },
  H: { glyph: "♥︎", color: "red" },
  D: { glyph: "♦︎", color: "red" },
  C: { glyph: "♣︎", color: "blue" },
};

/** "KH" -> "K♥". Faces that are not standard cards are returned unchanged. */
export function faceLabel(face: string): string {
  const m = /^(10|[2-9JQKA])([SHDC])$/.exec(face);
  return m ? `${m[1]}${SUITS[m[2]!]!.glyph}` : face;
}

interface Props {
  /** null draws the back of the card. */
  face: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Card({ face, size = "md", className = "" }: Props) {
  if (face === null)
    return (
      <span
        className={`card back ${size} ${className}`}
        role="img"
        aria-label="Face-down card"
      />
    );
  const m = /^(10|[2-9JQKA])([SHDC])$/.exec(face);
  if (!m) {
    return (
      <span className={`card face text ${size} ${className}`}>
        <span className="card-text">{face}</span>
      </span>
    );
  }
  const suit = SUITS[m[2]!]!;
  return (
    <span
      className={`card face ${suit.color} ${size} ${className}`}
      role="img"
      aria-label={faceLabel(face)}
    >
      <span className="card-rank">{m[1]}</span>
      <span className="card-suit">{suit.glyph}</span>
      {size === "lg" && <span className="card-rank flip">{m[1]}</span>}
    </span>
  );
}
