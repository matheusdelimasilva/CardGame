import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, formatApiError } from "../api";
import { navigate } from "../App";
import { useLocale } from "../i18n/locale";

/** The contents of the "Join a table" paper sheet. */
export function JoinSheet() {
  const { locale, t } = useLocale();
  const [code, setCode] = useState("");
  const [error, setError] = useState<{ cause: unknown } | "notFound" | null>(
    null,
  );
  const [found, setFound] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c || found) return;
    setError(null);
    try {
      if ((await api.roomExists(c)).exists) {
        // A short beat so the "found" note lands before the table opens.
        setFound(true);
        timer.current = setTimeout(() => navigate(`/t/${c}`), 450);
      } else setError("notFound");
    } catch (cause) {
      setError({ cause });
    }
  };

  return (
    <>
      <h2 className="sheet-title">{t("Join a table", "Entrar em uma mesa")}</h2>
      <p className="sheet-text">
        {t(
          "Got a link from a friend? Open it, or type the table code here.",
          "Recebeu um link de um amigo? Abra o link ou digite o código da mesa aqui.",
        )}
      </p>
      <form className="sheet-row" onSubmit={join}>
        <input
          className="pinput spaced code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="ABC234"
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          aria-label={t("Table code", "Código da mesa")}
        />
        <button className="pbtn blue wide">{t("Join", "Entrar")}</button>
      </form>
      {error && (
        <p className="scribble red" role="alert">
          {error === "notFound"
            ? t("No table with that code.", "Nenhuma mesa com esse código.")
            : formatApiError(
                error.cause,
                locale,
                t(
                  "Could not find the table.",
                  "Não foi possível localizar a mesa.",
                ),
              )}
        </p>
      )}
      {found && (
        <p className="scribble green" role="status">
          {t(
            "Table found. Taking a seat…",
            "Mesa encontrada. Preparando seu lugar…",
          )}
        </p>
      )}
    </>
  );
}
