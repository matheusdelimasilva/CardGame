import type { GameInfo, SettingDef, SettingValues } from "@cardgame/protocol";

/**
 * Choices with this many options or fewer show as a row of buttons, so every
 * option is visible; longer lists fall back to a dropdown.
 */
const MAX_BUTTON_OPTIONS = 4;

export function SettingsSheet({
  game,
  values,
  onChange,
  onCreate,
  busy,
  error,
}: {
  game: GameInfo | null;
  values: SettingValues;
  onChange: (id: string, value: boolean | string) => void;
  onCreate: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <>
      <div className="sheet-tape gold" aria-hidden="true" />
      <h2 className="sheet-title settings-title">
        {game ? `${game.name} settings` : "Settings"}
      </h2>
      <p className="sheet-sub">
        These apply to every game played at this table.
      </p>
      {game?.settings.length === 0 && (
        <p className="sheet-sub">This game has nothing to set up.</p>
      )}
      {game?.settings.map((def) => (
        <SettingRow
          key={def.id}
          def={def}
          value={values[def.id] ?? def.default}
          onChange={(v) => onChange(def.id, v)}
        />
      ))}
      <button
        type="button"
        className="pbtn gold big create"
        onClick={onCreate}
        disabled={busy || !game}
      >
        Create table
      </button>
      {error && (
        <p className="scribble red" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function SettingRow({
  def,
  value,
  onChange,
}: {
  def: SettingDef;
  value: boolean | string;
  onChange: (v: boolean | string) => void;
}) {
  const id = `setting-${def.id}`;
  const text = (
    <>
      <h3 className="setting-title" id={`${id}-label`}>
        {def.type === "select" && def.options.length > MAX_BUTTON_OPTIONS ? (
          <label htmlFor={id}>{def.label}</label>
        ) : (
          def.label
        )}
      </h3>
      {def.description && <p className="setting-desc">{def.description}</p>}
    </>
  );

  if (def.type === "toggle") {
    const on = value === true;
    return (
      <div className="setting-row toggle">
        <div className="setting-text">{text}</div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-label`}
          className={`pswitch${on ? " on" : ""}`}
          onClick={() => onChange(!on)}
        >
          <span className="pswitch-knob" />
          <span className="pswitch-text">{on ? "ON" : "OFF"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="setting-row">
      {text}
      {def.options.length > MAX_BUTTON_OPTIONS ? (
        <select
          id={id}
          className="pinput pselect"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div
          className="setting-opts"
          role="group"
          aria-labelledby={`${id}-label`}
        >
          {def.options.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={value === o.value}
              className={`popt${value === o.value ? " on" : ""}`}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
