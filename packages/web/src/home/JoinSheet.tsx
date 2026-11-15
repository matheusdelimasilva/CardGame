import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import { navigate } from "../App";

/** The contents of the "Join a table" paper sheet. */
export function JoinSheet() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c || found) return;
    try {
      if ((await api.roomExists(c)).exists) {
        // A short beat so the "found" note lands before the table opens.
        setFound(true);
        timer.current = setTimeout(() => navigate(`/t/${c}`), 450);
      } else setError("No table with that code.");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <h2 className="sheet-title">Join a table</h2>
      <p className="sheet-text">
        Got a link from a friend? Open it, or type the table code here.
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
          aria-label="Table code"
        />
        <button className="pbtn blue wide">Join</button>
      </form>
      {error && (
        <p className="scribble red" role="alert">
          {error}
        </p>
      )}
      {found && (
        <p className="scribble green" role="status">
          Table found. Taking a seat…
        </p>
      )}
    </>
  );
}
