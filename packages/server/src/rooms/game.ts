/** Game orchestration and the clocks/recordings derived from running state. */
import { randomInt } from "node:crypto";
import type { ChatOutcome, Track } from "@cardgame/engine";
import { requireGame } from "@cardgame/games";
import { newToken } from "./members";
import {
  isRunning,
  inRunningGame,
  type Room,
  type Member,
  type Refusal,
  type RunningGame,
} from "./model";

/** Starts the turn clock when a new clock period begins (see GameModule.clockKey). */
function syncClock(room: Room, now: number): void {
  const running = room.game;
  if (!running) return;
  const game = requireGame(running.gameId);
  const key =
    running.result || running.resumeAt !== null
      ? ""
      : (game.clockKey?.(running.state) ??
        game.activePlayers(running.state).join(","));
  if (key === running.turnKey) return;
  running.turnKey = key;
  const seconds = key ? (game.turnTimeLimit?.(running.state) ?? null) : null;
  running.turnMs = seconds ? seconds * 1000 : 0;
  running.deadline = seconds ? now + running.turnMs : null;
}

function currentTrack(running: RunningGame): Track | null {
  if (running.result) return null;
  return requireGame(running.gameId).currentTrack?.(running.state) ?? null;
}

function syncGame(room: Room, now: number): void {
  const running = room.game!;
  const game = requireGame(running.gameId);
  running.result = game.result(running.state);
  const pause = running.result ? null : game.pauseMs?.(running.state);
  running.resumeAt = pause && pause > 0 ? now + pause : null;
  syncClock(room, now);
  syncTrack(room);
}

/** Gives the table a fresh, unguessable URL whenever the recording to play changes. */
export function syncTrack(room: Room): void {
  const running = room.game;
  if (!running) return;
  const track = currentTrack(running);
  const key = track
    ? `${track.deezerId ?? ""}|${track.title}|${track.artist}`
    : "";
  if (key === running.trackKey) return;
  running.trackKey = key;
  running.trackNonce = key ? newToken() : null;
}

/** The recording behind a track URL, or null if that URL is not the current one. */
export function trackFor(room: Room, nonce: string): Track | null {
  const running = room.game;
  if (!running || !running.trackNonce || running.trackNonce !== nonce)
    return null;
  return currentTrack(running);
}

/** Plays the default move for anyone whose turn has run out. Returns true if the game changed. */
export function expireTurn(room: Room, now = Date.now()): boolean {
  const running = room.game;
  if (!running || running.result) return false;
  const game = requireGame(running.gameId);
  if (running.resumeAt !== null) {
    if (now < running.resumeAt) return false;
    running.state = game.resume?.(running.state) ?? running.state;
    syncGame(room, now);
    return true;
  }
  if (running.deadline === null || now < running.deadline) return false;
  let changed = false;
  for (const playerId of game.activePlayers(running.state)) {
    const auto = game.autoMove?.(running.state, playerId) ?? null;
    if (auto !== null && apply(room, playerId, auto, now) === null)
      changed = true;
  }
  // Nothing could be played for them: stop the clock rather than fire again every tick.
  if (!changed) running.deadline = null;
  return changed;
}

export function start(
  room: Room,
  member: Member,
  seed = randomInt(2 ** 31),
  now = Date.now(),
): Refusal {
  if (!member.isHost) return "Only the host can start the game.";
  if (isRunning(room)) return "A game is already running.";
  const game = requireGame(room.gameId);
  const players = room.members
    .filter((m) => m.seat !== null)
    .sort((a, b) => a.seat! - b.seat!)
    .map((m) => m.id);
  if (players.length < game.minPlayers)
    return `${game.name} needs at least ${game.minPlayers} players.`;
  if (players.length > game.maxPlayers)
    return `${game.name} allows at most ${game.maxPlayers} players.`;
  const state = game.setup({ players, seed, settings: room.settings });
  room.game = {
    gameId: game.id,
    players,
    state,
    result: null,
    turnKey: "",
    deadline: null,
    resumeAt: null,
    turnMs: 0,
    trackKey: "",
    trackNonce: null,
  };
  syncGame(room, now);
  return null;
}

function apply(
  room: Room,
  playerId: string,
  gameMove: unknown,
  now: number,
): Refusal {
  const running = room.game!;
  if (running.resumeAt !== null) return "The game is paused.";
  const game = requireGame(running.gameId);
  let outcome;
  try {
    outcome = game.applyMove(running.state, playerId, gameMove);
  } catch (err) {
    console.error(`Room ${room.code}:`, err);
    return "That move is not valid.";
  }
  if (!outcome.ok) return outcome.error;
  running.state = outcome.state;
  syncGame(room, now);
  return null;
}

/**
 * Shows a chat line to the running game before it is sent (see
 * GameModule.chat). A changed state is applied like a move. Returns null to
 * send the line as usual. The line itself is never kept or logged.
 */
export function chatInGame(
  room: Room,
  member: Member,
  text: string,
  now = Date.now(),
): ChatOutcome<unknown> | null {
  const running = room.game;
  if (!running || running.result || running.resumeAt !== null) return null;
  const game = requireGame(running.gameId);
  const player = running.players.includes(member.id) ? member.id : null;
  let outcome;
  try {
    outcome = game.chat?.(running.state, player, text, member.name) ?? null;
  } catch (err) {
    // Held back rather than sent: the game may have been about to hide it.
    console.error(`Room ${room.code}:`, err);
    return { deliver: false, note: "That message could not be sent." };
  }
  if (outcome?.state !== undefined) {
    running.state = outcome.state;
    syncGame(room, now);
  }
  return outcome;
}

export function move(
  room: Room,
  member: Member,
  gameMove: unknown,
  now = Date.now(),
): Refusal {
  if (!inRunningGame(room, member)) return "You are not playing in this game.";
  return apply(room, member.id, gameMove, now);
}

/** The host plays a default move for a player who is away. */
export function skip(
  room: Room,
  member: Member,
  playerId: string,
  now = Date.now(),
): Refusal {
  if (!member.isHost) return "Only the host can skip a player.";
  if (!isRunning(room)) return "No game is running.";
  if (room.game!.resumeAt !== null) return "The game is paused.";
  const target = room.members.find((m) => m.id === playerId);
  if (!target || !room.game!.players.includes(playerId))
    return "That player is not in the game.";
  if (target.connected) return "That player is still connected.";
  const game = requireGame(room.game!.gameId);
  const auto = game.autoMove?.(room.game!.state, playerId) ?? null;
  if (auto === null)
    return "There is nothing to skip for that player right now.";
  return apply(room, playerId, auto, now);
}
