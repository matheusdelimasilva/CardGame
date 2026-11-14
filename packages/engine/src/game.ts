import type { PlayerId } from "./table";

export type MoveResult<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameResult {
  winners: PlayerId[];
}

/** A switch the host can turn on or off before creating a table. */
export interface ToggleSetting {
  type: "toggle";
  id: string;
  label: string;
  description?: string;
  default: boolean;
}

/** A choice of one option from a list. */
export interface SelectSetting {
  type: "select";
  id: string;
  label: string;
  description?: string;
  options: { value: string; label: string }[];
  default: string;
}

export type SettingDef = ToggleSetting | SelectSetting;
export type SettingValues = Record<string, boolean | string>;

/** Keeps the valid values from untrusted input and fills the rest with defaults. */
export function resolveSettings(defs: readonly SettingDef[], raw: unknown): SettingValues {
  const given = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const values: SettingValues = {};
  for (const def of defs) {
    const value = Object.hasOwn(given, def.id) ? given[def.id] : undefined;
    if (def.type === "toggle") values[def.id] = typeof value === "boolean" ? value : def.default;
    else values[def.id] = def.options.some((o) => o.value === value) ? (value as string) : def.default;
  }
  return values;
}

export interface SetupContext {
  /** Seated players, in table order. */
  players: PlayerId[];
  seed: number;
  /** The host's choices for this table, already validated against the game's settings. */
  settings: SettingValues;
}

/**
 * A game's rules. The server keeps the full state S, passes every move
 * through applyMove, and sends each client only what view returns.
 */
export interface GameModule<S, M, V> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  /** One line shown when the host picks a game. */
  description: string;
  /** Options the host chooses before creating a table. */
  settings: SettingDef[];
  setup(ctx: SetupContext): S;
  /** Must not change the given state. Returns an error for an illegal move. */
  applyMove(state: S, player: PlayerId, move: M): MoveResult<S>;
  /** What one player may see. A null viewer is a spectator. */
  view(state: S, viewer: PlayerId | null): V;
  /** Players the game is waiting on right now. Empty when the game is over. */
  activePlayers(state: S): PlayerId[];
  /** A default move for a player who is away, used when the host skips them. */
  autoMove?(state: S, player: PlayerId): M | null;
  /** Seconds the current turn may take, or null for no limit. When it runs out the server plays autoMove. */
  turnTimeLimit?(state: S): number | null;
  /** null while the game is still running. */
  result(state: S): GameResult | null;
}
