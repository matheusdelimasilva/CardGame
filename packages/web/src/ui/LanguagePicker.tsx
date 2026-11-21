import { useLocale, type Locale } from "../i18n/locale";
import "./language-picker.css";

function Flag({ locale }: { locale: Locale }) {
  if (locale === "pt-BR") {
    return (
      <svg
        className="language-picker-flag"
        viewBox="0 0 27 18"
        aria-hidden="true"
      >
        <rect width="27" height="18" fill="#2d8a4e" />
        <polygon points="13.5,2 24.5,9 13.5,16 2.5,9" fill="#ffd84a" />
        <circle cx="13.5" cy="9" r="4" fill="#24478f" />
        <path
          d="M9.9,8.4 Q13.5,7.2 17.1,9.7"
          fill="none"
          stroke="#fffaf0"
          strokeWidth="1.1"
        />
      </svg>
    );
  }

  return (
    <svg
      className="language-picker-flag"
      viewBox="0 0 27 18"
      aria-hidden="true"
    >
      <rect width="27" height="18" fill="#fffaf0" />
      <rect y="0" width="27" height="2" fill="#d63e31" />
      <rect y="4" width="27" height="2" fill="#d63e31" />
      <rect y="8" width="27" height="2" fill="#d63e31" />
      <rect y="12" width="27" height="2" fill="#d63e31" />
      <rect y="16" width="27" height="2" fill="#d63e31" />
      <rect width="12" height="10" fill="#24478f" />
      <circle cx="2.4" cy="2.4" r="0.85" fill="#fffaf0" />
      <circle cx="6" cy="2.4" r="0.85" fill="#fffaf0" />
      <circle cx="9.6" cy="2.4" r="0.85" fill="#fffaf0" />
      <circle cx="4.2" cy="5" r="0.85" fill="#fffaf0" />
      <circle cx="7.8" cy="5" r="0.85" fill="#fffaf0" />
      <circle cx="2.4" cy="7.6" r="0.85" fill="#fffaf0" />
      <circle cx="6" cy="7.6" r="0.85" fill="#fffaf0" />
      <circle cx="9.6" cy="7.6" r="0.85" fill="#fffaf0" />
    </svg>
  );
}

export function LanguagePicker({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, setLocale, t } = useLocale();

  return (
    <span
      className={[
        "language-picker",
        compact && "language-picker-compact",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Flag locale={locale} />
      <select
        className="language-picker-select"
        aria-label={t("Language", "Idioma")}
        value={locale}
        onChange={(event) =>
          setLocale(event.target.value === "pt-BR" ? "pt-BR" : "en")
        }
      >
        <option value="en" lang="en" aria-label="English">
          🇺🇸
        </option>
        <option value="pt-BR" lang="pt-BR" aria-label="Português (Brasil)">
          🇧🇷
        </option>
      </select>
    </span>
  );
}
