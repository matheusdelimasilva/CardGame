import type { PlayerId } from "./table";

export type MoveResult<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameResult {
  winners: PlayerId[];
}

export interface SetupContext {
  /** Seated players, in table order. */
  players: PlayerId[];
  seed: number;
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
  setup(ctx: SetupContext): S;
  /** Must not change the given state. Returns an error for an illegal move. */
  applyMove(state: S, player: PlayerId, move: M): MoveResult<S>;
  /** What one player may see. A null viewer is a spectator. */
  view(state: S, viewer: PlayerId | null): V;
  /** null while the game is still running. */
  result(state: S): GameResult | null;
}
