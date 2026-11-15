import { randomBytes, randomInt } from "node:crypto";
import { resolveSettings } from "@cardgame/engine";
import { requireGame } from "@cardgame/games";
import { MAX_NAME_LENGTH, SEAT_COUNT, type GameInfo } from "@cardgame/protocol";
import { inRunningGame, type Room, type Member, type Refusal } from "./model";

/** Lobby metadata, member identity and seating rules. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const newId = () => randomBytes(6).toString("hex");
export const newToken = () => randomBytes(24).toString("hex");

export function gameInfo(gameId: string): GameInfo {
  const { id, name, minPlayers, maxPlayers, description, settings } =
    requireGame(gameId);
  return { id, name, minPlayers, maxPlayers, description, settings };
}

/** The game must exist. Settings are checked against the game; anything invalid falls back to its default. */
export function createRoom(
  code: string,
  hostEmail: string,
  gameId: string,
  settings: unknown = {},
): Room {
  return {
    code,
    hostEmail,
    gameId,
    settings: resolveSettings(requireGame(gameId).settings, settings),
    members: [],
    game: null,
    updatedAt: Date.now(),
  };
}

/** Finds the member behind a token, or adds a new one. */
export function join(
  room: Room,
  token: string | undefined,
  isHost: boolean,
): Member {
  let member = token ? room.members.find((m) => m.token === token) : undefined;
  if (!member) {
    member = {
      id: newId(),
      token: newToken(),
      name: "",
      connected: false,
      isHost: false,
      seat: null,
    };
    room.members.push(member);
  }
  if (isHost) member.isHost = true;
  return member;
}

export function setName(room: Room, member: Member, raw: string): Refusal {
  const name = String(raw)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  if (!name) return "Please enter a name.";
  member.name = name;
  return null;
}

export function sit(room: Room, member: Member, seat: number): Refusal {
  if (!member.name) return "Choose a name first.";
  if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT)
    return "That seat does not exist.";
  if (inRunningGame(room, member))
    return "You cannot change seats during a game.";
  if (room.members.some((m) => m.seat === seat && m !== member))
    return "That seat is taken.";
  member.seat = seat;
  return null;
}

export function stand(room: Room, member: Member): Refusal {
  if (inRunningGame(room, member))
    return "You cannot leave your seat during a game.";
  member.seat = null;
  return null;
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
