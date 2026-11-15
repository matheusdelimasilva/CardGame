import type { HistoryEntry } from "@cardgame/protocol";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { navigate } from "./App";
import { KEYS, storage } from "./storage";

export function Home() {
  const [email, setEmail] = useState<string | null>(
    storage.get(KEYS.session) ? storage.get(KEYS.email) : null,
  );
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  // A stored session may have expired on the server.
  useEffect(() => {
    if (!email) return;
    api.me().catch(() => {
      storage.set(KEYS.session, null);
      setEmail(null);
    });
  }, [email]);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    try {
      if ((await api.roomExists(code)).exists) navigate(`/t/${code}`);
      else setJoinError("No table with that code.");
    } catch (err) {
      setJoinError((err as Error).message);
    }
  };

  return (
    <main className="home">
      <header className="home-title">
        <div className="logo-cards" aria-hidden="true">
          <span className="card back" />
          <span className="card back" />
          <span className="card back" />
        </div>
        <h1>CardGame</h1>
        <p>Card games with friends. One link, no sign-up to join.</p>
      </header>

      {email ? (
        <HostPanel email={email} onSignOut={() => setEmail(null)} />
      ) : (
        <SignIn onSignedIn={setEmail} />
      )}

      <section className="panel">
        <h2>Join a table</h2>
        <p className="muted">
          Got a link from a friend? Open it, or type the table code here.
        </p>
        <form className="row" onSubmit={join}>
          <input
            className="input code-input"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value);
              setJoinError(null);
            }}
            placeholder="ABC234"
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Table code"
          />
          <button className="btn blue" disabled={!joinCode.trim()}>
            Join
          </button>
        </form>
        {joinError && <p className="form-error">{joinError}</p>}
      </section>
    </main>
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
    void run(async () => {
      const result = await api.verify(sentTo!, code);
      storage.set(KEYS.session, result.token);
      storage.set(KEYS.email, result.email);
      onSignedIn(result.email);
    });
  };

  return (
    <section className="panel">
      <h2>Host a table</h2>
      {!sentTo ? (
        <form onSubmit={request}>
          <p className="muted">
            Enter your email and we will send you a sign-in code. Only the host
            needs one.
          </p>
          <div className="row">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-label="Email"
              required
            />
            <button className="btn gold" disabled={busy || !email.trim()}>
              Send code
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="muted">
            We sent a 6-digit code to <b>{sentTo}</b>.
          </p>
          {devCode && (
            <p className="dev-note">
              Development mode, no email was sent. Your code is <b>{devCode}</b>
              .
            </p>
          )}
          <div className="row">
            <input
              className="input code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-label="Sign-in code"
              autoFocus
            />
            <button className="btn gold" disabled={busy || code.length !== 6}>
              Sign in
            </button>
          </div>
          <button
            type="button"
            className="link"
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
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function HostPanel({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  useEffect(() => {
    api
      .history()
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]));
  }, []);

  const signOut = () => {
    void api.signOut().catch(() => {});
    storage.set(KEYS.session, null);
    onSignOut();
  };

  return (
    <>
      <section className="panel">
        <h2>Host a table</h2>
        <p className="muted">
          Signed in as <b>{email}</b>.{" "}
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </p>
        <button className="btn gold big" onClick={() => navigate("/new")}>
          New table
        </button>
      </section>

      <section className="panel">
        <h2>Past games</h2>
        {history === null ? (
          <p className="muted">Loading...</p>
        ) : history.length === 0 ? (
          <p className="muted">
            Games you host will show up here once they finish.
          </p>
        ) : (
          <ul className="history">
            {history.map((h, i) => (
              <li key={i}>
                <span className="history-game">{h.gameName}</span>
                <span className="history-when">
                  {new Date(h.endedAt).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <span className="history-players">
                  {h.players.map((p, j) => (
                    <span
                      key={j}
                      className={h.winners.includes(p) ? "winner" : ""}
                    >
                      {h.winners.includes(p) ? "★ " : ""}
                      {p}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
