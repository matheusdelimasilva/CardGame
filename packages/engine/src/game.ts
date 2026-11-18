import type { PlayerId } from "./table";
import type { z } from "zod";

export type MoveResult<S> =
  { ok: true; state: S } | { ok: false; error: string };

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
export function resolveSettings(
  defs: readonly SettingDef[],
  raw: unknown,
): SettingValues {
  const given =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const values: SettingValues = {};
  for (const def of defs) {
    const value = Object.hasOwn(given, def.id) ? given[def.id] : undefined;
    if (def.type === "toggle")
      values[def.id] = typeof value === "boolean" ? value : def.default;
    else
      values[def.id] = def.options.some((o) => o.value === value)
        ? (value as string)
        : def.default;
  }
  return values;
}

/**
 * A recording the whole table should hear right now. It stays on the server:
 * clients are only given an opaque URL that plays it.
 */
export interface Track {
  title: string;
  artist: string;
  /** Deezer track id, or null to look the song up by title and artist. */
  deezerId: number | null;
}

/**
 * What a game decides about one chat line (see GameModule.chat). Chat is
 * never saved, so neither the line nor these texts are kept anywhere.
 */
export interface ChatOutcome<S> {
  /** The game after this line, when it changed anything. Like a move, it must be a new object. */
  state?: S;
  /** Whether the line goes out to the room as typed. */
  deliver: boolean;
  /** Lines from the table, not a person, that everyone in the room sees after the line (if delivered). */
  announce?: string[];
  /** Told only to the sender, e.g. why their line was not sent. */
  note?: string;
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
  /** Validates the untrusted move payload before it reaches the rules. */
  moveSchema: z.ZodType<M>;
  setup(ctx: SetupContext): S;
  /** Throws if a saved state can no longer be played with the current game data. */
  validateState?(state: S): void;
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
  /**
   * Names the current clock period. The server restarts the turn clock only
   * when this changes, so a game can keep one deadline while the players it
   * waits on come and go. Defaults to the active players, so the clock
   * restarts whenever they change.
   */
  clockKey?(state: S): string;
  /** The recording to play for everyone at this point in the game, if any. */
  currentTrack?(state: S): Track | null;
  /** Milliseconds to hold this state before resuming, or null for no pause. */
  pauseMs?(state: S): number | null;
  /** Advances a held state without mutating it. */
  resume?(state: S): S;
  /** null while the game is still running. */
  result(state: S): GameResult | null;
  /**
   * Looks at a chat line before it is sent, e.g. to judge it as a guess.
   * `player` is the sender when they play in this game, else null;
   * `name` is how the room knows them. Returns null to send the line as
   * usual. Called only while the game runs and is not paused; the line has
   * already passed the room's length and rate limits.
   */
  chat?(
    state: S,
    player: PlayerId | null,
    text: string,
    name: string,
  ): ChatOutcome<S> | null;
}

/** Runtime game interface after the registry has hidden its state, move and view types. */
export type AnyGame = GameModule<unknown, unknown, unknown>;

/** Erases types only at the dispatch boundary; callers validate moves with moveSchema. */
export function defineGame<S, M, V>(module: GameModule<S, M, V>): AnyGame {
  return {
    ...module,
    applyMove: (state, player, move) =>
      module.applyMove(state as S, player, move as M),
    validateState: (state) => module.validateState?.(state as S),
    view: (state, viewer) => module.view(state as S, viewer),
    activePlayers: (state) => module.activePlayers(state as S),
    autoMove: (state, player) => module.autoMove?.(state as S, player) ?? null,
    turnTimeLimit: (state) => module.turnTimeLimit?.(state as S) ?? null,
    // Left undefined when the game has none, so the server applies the default.
    clockKey: module.clockKey && ((state) => module.clockKey!(state as S)),
    currentTrack: (state) => module.currentTrack?.(state as S) ?? null,
    pauseMs: (state) => module.pauseMs?.(state as S) ?? null,
    resume: (state) => (module.resume ? module.resume(state as S) : state),
    result: (state) => module.result(state as S),
    chat: (state, player, text, name) =>
      module.chat?.(state as S, player, text, name) ?? null,
  };
}
