import type { SeatView } from "@cardgame/protocol";
import type { ReactNode } from "react";

const ANIMALS = ["🐼", "🐻", "🐰", "🐸", "🐱", "🐷", "🦊", "🐵"];
// Gold is reserved for "it is this player's turn", so it is not a seat colour.
const COLORS = ["#ef4a3c", "#3b8cf0", "#b57af2", "#f0913b", "#35c2ae", "#f277ad", "#8fd14f", "#c9c2ad"];

export function Avatar({ seat, size = "md" }: { seat: number; size?: "md" | "lg" }) {
  return (
    <span className={`avatar ${size}`} style={{ background: COLORS[seat % COLORS.length] }} aria-hidden="true">
      {ANIMALS[seat % ANIMALS.length]}
    </span>
  );
}

interface Props {
  seat: number;
  player: SeatView;
  active: boolean;
  tag: string | null;
  cards?: ReactNode;
  onClick?: () => void;
}

export function Seat({ seat, player, active, tag, cards, onClick }: Props) {
  const body = (
    <>
      {active && <span className="seat-arrow" aria-hidden="true" />}
      <span className="seat-top">
        <Avatar seat={seat} />
        {cards && <span className="seat-cards">{cards}</span>}
      </span>
      <span className="nametag">
        {player.isHost && (
          <span className="host-mark" title="Host">
            ♛
          </span>
        )}
        {player.name}
      </span>
      <span className="seat-tags">
        {tag && <span className="tag">{tag}</span>}
        {!player.connected && <span className="tag red">away</span>}
      </span>
    </>
  );
  const className = `seat${active ? " active" : ""}${player.connected ? "" : " away"}`;
  return onClick ? (
    <button className={className} onClick={onClick} aria-label={`${player.name}, player options`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function OpenSeat({ onSit }: { onSit?: () => void }) {
  return (
    <button className="seat open" onClick={onSit} disabled={!onSit}>
      <span className="avatar md empty">+</span>
      <span className="nametag ghost">{onSit ? "sit here" : "open"}</span>
    </button>
  );
}
