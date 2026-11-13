import { randomBytes, randomInt } from "node:crypto";
import type { GameResult } from "@cardgame/engine";
import { defaultGameId, games } from "@cardgame/games";
import { MAX_NAME_LENGTH, SEAT_COUNT, type RoomView } from "@cardgame/protocol";

export interface Member {
  id: string;
  /** Secret kept in the member's browser; it is how they get their seat back. */
  token: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  seat: number | null;
}

export interface RunningGame {
  gameId: string;
  players: string[];
  state: unknown;
  result: GameResult | null;
}

export interface Room {
  code: string;
  hostEmail: string;
  gameId: string;
  members: Member[];
  game: RunningGame | null;
  updatedAt: number;
}

/** null means the action was applied; a string is the reason it was refused. */
export type Refusal = string | null;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const newId = () => randomBytes(6).toString("hex");
const newToken = () => randomBytes(24).toString("hex");

export function createRoom(code: string, hostEmail: string): Room {
  return { code, hostEmail, gameId: defaultGameId, members: [], game: null, updatedAt: Date.now() };
}

const isRunning = (room: Room) => room.game !== null && room.game.result === null;
const inRunningGame = (room: Room, m: Member) => isRunning(room) && room.game!.players.includes(m.id);

/** Finds the member behind a token, or adds a new one. */
export function join(room: Room, token: string | undefined, isHost: boolean): Member {
  let member = token ? room.members.find((m) => m.token === token) : undefined;
  if (!member) {
    member = { id: newId(), token: newToken(), name: "", connected: false, isHost: false, seat: null };
    room.members.push(member);
  }
  if (isHost) member.isHost = true;
  return member;
}

export function setName(room: Room, member: Member, raw: string): Refusal {
  const name = String(raw).replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return "Please enter a name.";
  member.name = name;
  return null;
}

export function sit(room: Room, member: Member, seat: number): Refusal {
  if (!member.name) return "Choose a name first.";
  if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT) return "That seat does not exist.";
  if (inRunningGame(room, member)) return "You cannot change seats during a game.";
  if (room.members.some((m) => m.seat === seat && m !== member)) return "That seat is taken.";
  member.seat = seat;
  return null;
}

export function stand(room: Room, member: Member): Refusal {
  if (inRunningGame(room, member)) return "You cannot leave your seat during a game.";
  member.seat = null;
  return null;
}

export function setGame(room: Room, member: Member, gameId: string): Refusal {
  if (!member.isHost) return "Only the host can choose the game.";
  if (isRunning(room)) return "Finish the current game first.";
  if (!games[gameId]) return "Unknown game.";
  room.gameId = gameId;
  return null;
}

export function start(room: Room, member: Member, seed = randomInt(2 ** 31)): Refusal {
  if (!member.isHost) return "Only the host can start the game.";
  if (isRunning(room)) return "A game is already running.";
  const game = games[room.gameId]!;
  const players = room.members
    .filter((m) => m.seat !== null)
    .sort((a, b) => a.seat! - b.seat!)
    .map((m) => m.id);
  if (players.length < game.minPlayers) return `${game.name} needs at least ${game.minPlayers} players.`;
  if (players.length > game.maxPlayers) return `${game.name} allows at most ${game.maxPlayers} players.`;
  room.game = { gameId: game.id, players, state: game.setup({ players, seed }), result: null };
  return null;
}

function apply(room: Room, playerId: string, gameMove: unknown): Refusal {
  const running = room.game!;
  const game = games[running.gameId]!;
  let outcome;
  try {
    outcome = game.applyMove(running.state, playerId, gameMove);
  } catch {
    return "That move is not valid.";
  }
  if (!outcome.ok) return outcome.error;
  running.state = outcome.state;
  running.result = game.result(outcome.state);
  return null;
}

export function move(room: Room, member: Member, gameMove: unknown): Refusal {
  if (!inRunningGame(room, member)) return "You are not playing in this game.";
  return apply(room, member.id, gameMove);
}

/** The host plays a default move for a player who is away. */
export function skip(room: Room, member: Member, playerId: string): Refusal {
  if (!member.isHost) return "Only the host can skip a player.";
  if (!isRunning(room)) return "No game is running.";
  const target = room.members.find((m) => m.id === playerId);
  if (!target || !room.game!.players.includes(playerId)) return "That player is not in the game.";
  if (target.connected) return "That player is still connected.";
  const game = games[room.game!.gameId]!;
  const auto = game.autoMove?.(room.game!.state, playerId) ?? null;
  if (auto === null) return "There is nothing to skip for that player right now.";
  return apply(room, playerId, auto);
}

/** Removes a player from the room. A running game they were in is ended. */
export function kick(room: Room, member: Member, playerId: string): Refusal {
  if (!member.isHost) return "Only the host can remove a player.";
  const target = room.members.find((m) => m.id === playerId);
  if (!target) return "That player is not here.";
  if (target.isHost) return "The host cannot be removed.";
  if (inRunningGame(room, target)) room.game = null;
  room.members = room.members.filter((m) => m !== target);
  return null;
}

export function endGame(room: Room, member: Member): Refusal {
  if (!member.isHost) return "Only the host can end the game.";
  room.game = null;
  return null;
}

/** Everything one member is allowed to know about the room. */
export function viewFor(room: Room, member: Member): RoomView {
  const seats: RoomView["seats"] = Array.from({ length: SEAT_COUNT }, () => null);
  for (const m of room.members) {
    if (m.seat === null) continue;
    seats[m.seat] = {
      id: m.id,
      name: m.name,
      connected: m.connected,
      isHost: m.isHost,
      inGame: room.game?.players.includes(m.id) ?? false,
    };
  }
  let gameView: RoomView["game"] = null;
  if (room.game) {
    const game = games[room.game.gameId]!;
    const viewer = room.game.players.includes(member.id) ? member.id : null;
    gameView = {
      gameId: room.game.gameId,
      players: room.game.players,
      active: game.activePlayers(room.game.state),
      view: game.view(room.game.state, viewer),
      result: room.game.result,
    };
  }
  return {
    code: room.code,
    gameId: room.gameId,
    games: Object.values(games).map(({ id, name, minPlayers, maxPlayers }) => ({ id, name, minPlayers, maxPlayers })),
    you: { id: member.id, name: member.name, seat: member.seat, isHost: member.isHost },
    seats,
    spectators: room.members
      .filter((m) => m.seat === null && m.name)
      .map((m) => ({ id: m.id, name: m.name, connected: m.connected })),
    game: gameView,
  };
}
