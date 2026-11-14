import type { GameInfo, SettingDef, SettingValues } from "@cardgame/protocol";
import { useEffect, useState } from "react";
import { api } from "./api";
import { navigate } from "./App";
import { KEYS, storage } from "./storage";

const defaultsOf = (game: GameInfo): SettingValues => Object.fromEntries(game.settings.map((s) => [s.id, s.default]));

/** Host flow: pick a game, choose its settings, then create the table. */
export function NewTable() {
  const [games, setGames] = useState<GameInfo[] | null>(null);
  const [game, setGame] = useState<GameInfo | null>(null);
  const [values, setValues] = useState<SettingValues>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!storage.get(KEYS.session)) return navigate("/");
    api
      .games()
      .then((r) => setGames(r.games))
      .catch((err: Error) => setError(err.message));
  }, []);

  const pick = (g: GameInfo) => {
    setGame(g);
    setValues(defaultsOf(g));
    setError(null);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      navigate(`/t/${(await api.createRoom(game!.id, values)).code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="home">
      <header className="steps">
        <button className="link" onClick={() => (game ? setGame(null) : navigate("/"))}>
          ‹ Back
        </button>
        <span className="muted">step {game ? 2 : 1} of 2</span>
      </header>

      {!game ? (
        <section className="panel">
          <h2>Pick a game</h2>
          {games === null && !error && <p className="muted">Loading...</p>}
          <div className="game-list">
            {games?.map((g) => (
              <button key={g.id} className="game-card" onClick={() => pick(g)}>
                <span className="game-name">{g.name}</span>
                <span className="game-players">
                  {g.minPlayers} to {g.maxPlayers} players
                </span>
                <span className="game-desc">{g.description}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2>{game.name} settings</h2>
          <p className="muted">These apply to every game played at this table.</p>
          {game.settings.length === 0 && <p className="muted">This game has nothing to set up.</p>}
          <div className="settings">
            {game.settings.map((def) => (
              <SettingRow
                key={def.id}
                def={def}
                value={values[def.id]!}
                onChange={(value) => setValues((v) => ({ ...v, [def.id]: value }))}
              />
            ))}
          </div>
          <button className="btn gold big" onClick={create} disabled={busy}>
            Create table
          </button>
        </section>
      )}
      {error && <p className="form-error">{error}</p>}
    </main>
  );
}

function SettingRow({ def, value, onChange }: { def: SettingDef; value: boolean | string; onChange: (v: boolean | string) => void }) {
  const id = `setting-${def.id}`;
  return (
    <div className={`setting ${def.type}`}>
      <div className="setting-text">
        <label className="setting-label" htmlFor={id}>
          {def.label}
        </label>
        {def.description && <span className="setting-desc">{def.description}</span>}
      </div>
      {def.type === "toggle" ? (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={value === true}
          className={`switch${value === true ? " on" : ""}`}
          onClick={() => onChange(value !== true)}
        >
          <span className="switch-knob" />
          <span className="switch-text">{value === true ? "on" : "off"}</span>
        </button>
      ) : (
        <select id={id} className="input select" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** One short line per setting, for showing a table's settings in the lobby. */
export function describeSettings(game: GameInfo, values: SettingValues): string[] {
  return game.settings.map((def) => {
    const value = values[def.id] ?? def.default;
    if (def.type === "toggle") return `${def.label}: ${value === true ? "on" : "off"}`;
    const label = def.options.find((o) => o.value === value)?.label ?? String(value);
    return `${def.label}: ${label.split(":")[0]}`;
  });
}
