import type { HistoryEntry } from "@cardgame/protocol";
import { useState, type PointerEvent } from "react";
import { inert } from "./inert";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * A paper drawer attached to the bottom edge of the window. A mouse hovering
 * it opens it fully and leaving closes it; a tap or Enter on the tab toggles
 * it, and Escape closes it.
 */
export function PastGames({
  history,
  away,
}: {
  history: HistoryEntry[] | null;
  /** True off the home screen: the drawer drops out of view. */
  away: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = !away && (hover || pinned);
  const isMouse = (e: PointerEvent) => e.pointerType === "mouse";

  return (
    <div className={`drawer-dock${away ? " away" : ""}`} {...inert(away)}>
      <div
        className={`drawer${open ? " open" : ""}`}
        onPointerEnter={(e) => isMouse(e) && setHover(true)}
        onPointerLeave={(e) => {
          if (!isMouse(e)) return;
          setHover(false);
          setPinned(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            setHover(false);
            setPinned(false);
          }
        }}
      >
        <h2 className="drawer-tab-wrap">
          <button
            type="button"
            className="drawer-tab"
            aria-expanded={open}
            aria-controls="past-games"
            onClick={() => {
              // While the mouse is over the drawer, hover already holds it open.
              if (!hover) setPinned((p) => !p);
            }}
          >
            Past games
            <span className="drawer-chev" aria-hidden="true" />
          </button>
        </h2>
        <div
          id="past-games"
          role="region"
          aria-label="Past games; winners circled"
          className="drawer-sheet"
          onClick={() => !open && setPinned(true)}
        >
          {history === null ? (
            <p className="drawer-note">Loading…</p>
          ) : history.length === 0 ? (
            <p className="drawer-note">
              Games you host will show up here once they finish.
            </p>
          ) : (
            <ul className="drawer-grid">
              {history.map((h, i) => (
                <li key={`${h.roomCode}-${h.endedAt}-${i}`}>
                  <div className="drawer-head">
                    <span className="drawer-game">{h.gameName}</span>
                    <span className="drawer-when">{when(h.endedAt)}</span>
                  </div>
                  <div className="drawer-players">
                    {h.players.map((p, j) => {
                      const won = h.winners.includes(p);
                      return (
                        <span key={j} className={won ? "won" : undefined}>
                          {p}
                          {won && <span className="sr-only"> (winner)</span>}
                        </span>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
