import { SEAT_COUNT, type RoomView } from "@cardgame/protocol";
import { requireGame } from "@cardgame/games";
import { gameInfo } from "./members";
import type { Room, Member } from "./model";

/** Everything one member is allowed to know about the room. */
export function viewFor(
  room: Room,
  member: Member,
  now = Date.now(),
): RoomView {
  const seats: RoomView["seats"] = Array.from(
    { length: SEAT_COUNT },
    () => null,
  );
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
    const game = requireGame(room.game.gameId);
    const viewer = room.game.players.includes(member.id) ? member.id : null;
    gameView = {
      gameId: room.game.gameId,
      players: room.game.players,
      active: game.activePlayers(room.game.state),
      view: game.view(room.game.state, viewer),
      result: room.game.result,
      pause:
        room.game.resumeAt === null
          ? null
          : {
              remainingMs: Math.max(0, room.game.resumeAt - now),
            },
      track: room.game.trackNonce
        ? { url: `/api/rooms/${room.code}/track/${room.game.trackNonce}` }
        : null,
      timer:
        room.game.deadline === null
          ? null
          : {
              remainingMs: Math.max(0, room.game.deadline - now),
              totalMs: room.game.turnMs,
            },
    };
  }
  return {
    code: room.code,
    gameInfo: gameInfo(room.gameId),
    settings: room.settings,
    you: {
      id: member.id,
      name: member.name,
      seat: member.seat,
      isHost: member.isHost,
    },
    seats,
    spectators: room.members
      .filter((m) => m.seat === null && m.name)
      .map((m) => ({ id: m.id, name: m.name, connected: m.connected })),
    game: gameView,
  };
}
