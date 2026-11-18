import { useLocale } from "../i18n/locale";
import type { CSSProperties, ReactNode } from "react";
import { LanguagePicker } from "./LanguagePicker";
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
  withLanguage = true,
}: {
  code: string;
  gameName: string;
  /** Names of the people watching; omit to leave the line out. */
  watchers?: readonly string[];
  onLeave: () => void;
  actions: ReactNode;
  className?: string;
  withLanguage?: boolean;
}) {
  const { t } = useLocale();
  return (
    <header className={`tl-header${className ? ` ${className}` : ""}`}>
      <div className="tl-table-info">
        <button
          className="tl-button tl-back"
          aria-label={t("Leave table", "Sair da mesa")}
          onClick={onLeave}
        >
          ←
        </button>
        <div className="tl-table-meta">
          <div
            className="tl-code"
            style={{ "--code-length": code.length } as CSSProperties}
          >
            <span>{t("TABLE", "MESA")}</span> <strong>{code}</strong>
          </div>
          {watchers && (
            <div className="tl-watchers">
              {/* Three text nodes, as the lobby always had: a single node measures a hair differently. */}
              {t("Watching:", "Assistindo:")}{" "}
              {watchers.join(", ") || t("Nobody yet", "Ninguém ainda")}
            </div>
          )}
        </div>
      </div>
      <div
        className="tl-marquee"
        aria-label={t(`Now playing ${gameName}`, `Jogando ${gameName}`)}
      >
        <div className="tl-marquee-border" />
        <div className="tl-now-playing">{t("NOW PLAYING", "JOGO DA MESA")}</div>
        <div className="tl-game-title">{gameName.toUpperCase()}</div>
        <div className="tl-scan" aria-hidden="true" />
        <div className="tl-roll" aria-hidden="true" />
      </div>
      <div className="tl-header-actions">
        {actions}
        {withLanguage && <LanguagePicker compact />}
      </div>
    </header>
  );
}
