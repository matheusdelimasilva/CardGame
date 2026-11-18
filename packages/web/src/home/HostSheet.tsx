import { useId, useState, type FormEvent } from "react";
import { api, formatApiError } from "../api";
import { useLocale } from "../i18n/locale";
import { KEYS, storage } from "../storage";

/** The contents of the "Host a table" paper sheet: sign in, then New table. */
export function HostSheet({
  email,
  onSignedIn,
  onSignedOut,
  onNewTable,
}: {
  email: string | null;
  onSignedIn: (email: string) => void;
  onSignedOut: () => void;
  onNewTable: () => void;
}) {
  const { t } = useLocale();
  return (
    <>
      <h2 className="sheet-title">{t("Host a table", "Criar uma mesa")}</h2>
      {email ? (
        <div>
          <p className="sheet-text">
            {t("Signed in as", "Você entrou como")} <b>{email}</b>.{" "}
            <button
              type="button"
              className="paper-link"
              onClick={() => {
                void api.signOut().catch(() => {});
                storage.set(KEYS.session, null);
                onSignedOut();
              }}
            >
              {t("Sign out", "Sair")}
            </button>
          </p>
          <button type="button" className="pbtn gold big" onClick={onNewTable}>
            {t("New table", "Nova mesa")}
          </button>
        </div>
      ) : (
        <SignIn onSignedIn={onSignedIn} />
      )}
    </>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const { locale, t } = useLocale();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<{ cause: unknown } | null>(null);
  const errorId = useId();
  const [invalidEmail, setInvalidEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError({ cause });
    } finally {
      setBusy(false);
    }
  };

  const request = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(
      "email",
    ) as HTMLInputElement;
    if (!input.validity.valid) {
      setInvalidEmail(true);
      setError(null);
      input.focus();
      return;
    }
    setInvalidEmail(false);
    void run(async () => {
      const result = await api.requestCode(email, locale);
      setDevCode(result.devCode ?? null);
      setSentTo(email.trim());
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    void run(async () => {
      const result = await api.verify(sentTo!, code);
      storage.set(KEYS.session, result.token);
      storage.set(KEYS.email, result.email);
      onSignedIn(result.email);
    });
  };

  return (
    <>
      {!sentTo ? (
        <form onSubmit={request} noValidate>
          <p className="sheet-text">
            {t(
              "Enter your email and we will send you a sign-in code. Only the host needs one.",
              "Informe seu e-mail para receber um código de acesso. Só quem cria a mesa precisa do código.",
            )}
          </p>
          <div className="sheet-row">
            <input
              className="pinput grow"
              type="email"
              name="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setInvalidEmail(false);
              }}
              aria-invalid={invalidEmail}
              aria-describedby={invalidEmail ? errorId : undefined}
              placeholder={t("you@example.com", "voce@exemplo.com")}
              autoComplete="email"
              aria-label={t("Email", "E-mail")}
              required
            />
            <button className="pbtn gold" disabled={busy}>
              {t("Send code", "Enviar código")}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="sheet-text">
            {t(
              "We sent a 6-digit code to",
              "Enviamos um código de 6 dígitos para",
            )}{" "}
            <b>{sentTo}</b>.
          </p>
          {devCode && (
            <p className="sheet-dev">
              {t(
                "Development mode, no email was sent. Your code is",
                "Em modo de desenvolvimento, o e-mail não é enviado. Seu código é",
              )}{" "}
              <b>{devCode}</b>.
            </p>
          )}
          <div className="sheet-row">
            <input
              className="pinput spaced code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-label={t("Sign-in code", "Código de acesso")}
              autoFocus
            />
            <button className="pbtn gold" disabled={busy}>
              {t("Sign in", "Entrar")}
            </button>
          </div>
          <button
            type="button"
            className="paper-link small"
            onClick={() => {
              setSentTo(null);
              setCode("");
              setError(null);
            }}
          >
            {t("Use a different email", "Usar outro e-mail")}
          </button>
        </form>
      )}
      {(error || invalidEmail) && (
        <p className="scribble red" role="alert" id={errorId}>
          {error
            ? formatApiError(
                error.cause,
                locale,
                t("Could not sign in.", "Não foi possível entrar."),
              )
            : t(
                "Enter a valid email address.",
                "Informe um endereço de e-mail válido.",
              )}
        </p>
      )}
    </>
  );
}
