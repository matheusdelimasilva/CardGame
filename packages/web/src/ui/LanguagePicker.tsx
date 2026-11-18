import { useLocale } from "../i18n/locale";
import "./language-picker.css";

export function LanguagePicker({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, setLocale, t } = useLocale();

  return (
    <select
      className={[
        "language-picker",
        compact && "language-picker-compact",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("Language", "Idioma")}
      value={locale}
      onChange={(event) =>
        setLocale(event.target.value === "pt-BR" ? "pt-BR" : "en")
      }
    >
      <option value="en" lang="en" aria-label="English">
        {compact ? "EN" : "English"}
      </option>
      <option value="pt-BR" lang="pt-BR" aria-label="Português (Brasil)">
        {compact ? "PT-BR" : "Português (Brasil)"}
      </option>
    </select>
  );
}
