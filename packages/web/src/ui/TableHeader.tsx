import type { ReactNode } from "react";
import "./table-ui.css";

/**
 * The top of a table screen, shared by the lobby and the game: the way out
 * and the table code on the left, the game's name on a marquee in the
 * centre, and the screen's own buttons on the right.
 */
export function TableHeader({
  code,
  gameName,
  watchers,
  onLeave,
  actions,
  className,
}: {
  code: string;
  gameName: string;
  /** Names of the people watching; omit to leave the line out. */
  watchers?: readonly string[];
  onLeave: () => void;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <header className={`tl-header${className ? ` ${className}` : ""}`}>
      <div className="tl-table-info">
        <button
          className="tl-button tl-back"
          aria-label="Leave table"
          onClick={onLeave}
        >
          ←
        </button>
        <div className="tl-table-meta">
          <div className="tl-code">
            <span>TABLE</span> <strong>{code}</strong>
          </div>
          {watchers && (
            <div className="tl-watchers">
              {/* Three text nodes, as the lobby always had: a single node measures a hair differently. */}
              {"Watching:"} {watchers.join(", ") || "Nobody yet"}
            </div>
          )}
        </div>
      </div>
      <div className="tl-marquee" aria-label={`Now playing ${gameName}`}>
        <div className="tl-marquee-border" />
        <div className="tl-now-playing">NOW PLAYING</div>
        <div className="tl-game-title">{gameName.toUpperCase()}</div>
        <div className="tl-scan" aria-hidden="true" />
        <div className="tl-roll" aria-hidden="true" />
      </div>
      <div className="tl-header-actions">{actions}</div>
    </header>
  );
}
