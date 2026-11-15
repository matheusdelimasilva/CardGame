import { useState, type FormEvent } from "react";
import { api } from "../api";
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
  return (
    <>
      <h2 className="sheet-title">Host a table</h2>
      {email ? (
        <div>
          <p className="sheet-text">
            Signed in as <b>{email}</b>.{" "}
            <button
              type="button"
              className="paper-link"
              onClick={() => {
                void api.signOut().catch(() => {});
                storage.set(KEYS.session, null);
                onSignedOut();
              }}
            >
              Sign out
            </button>
          </p>
          <button type="button" className="pbtn gold big" onClick={onNewTable}>
            New table
          </button>
        </div>
      ) : (
        <SignIn onSignedIn={onSignedIn} />
      )}
    </>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const request = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await api.requestCode(email);
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
        <form onSubmit={request}>
          <p className="sheet-text">
            Enter your email and we will send you a sign-in code. Only the host
            needs one.
          </p>
          <div className="sheet-row">
            <input
              className="pinput grow"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-label="Email"
              required
            />
            <button className="pbtn gold" disabled={busy}>
              Send code
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="sheet-text">
            We sent a 6-digit code to <b>{sentTo}</b>.
          </p>
          {devCode && (
            <p className="sheet-dev">
              Development mode, no email was sent. Your code is <b>{devCode}</b>
              .
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
              aria-label="Sign-in code"
              autoFocus
            />
            <button className="pbtn gold" disabled={busy}>
              Sign in
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
            Use a different email
          </button>
        </form>
      )}
      {error && (
        <p className="scribble red" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
