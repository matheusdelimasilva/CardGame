import { requireGame } from "@cardgame/games";
import type {
  ChatMessage,
  ClientMessage,
  HistoryEntry,
} from "@cardgame/protocol";
import { guard } from "../guard";
import * as rooms from "../rooms";
import type { Store } from "../store";
import type { Member, Refusal, Room } from "./model";
import type { RoomRegistry } from "./registry";

type Command = Exclude<ClientMessage, { type: "hello" } | { type: "chat" }>;

/** Socket-free command boundary: mutation, move validation, history and recovery. */
export class RoomService {
  private listeners = new Set<(room: Room) => void>();
  private kickListeners = new Set<(room: Room, playerId: string) => void>();
  private chatListeners = new Set<(room: Room, message: ChatMessage) => void>();
  private noticeListeners = new Set<
    (room: Room, member: Member, text: string, textPtBR?: string) => void
  >();

  constructor(
    private readonly registry: RoomRegistry,
    private readonly store: Store,
  ) {}

  onChange(listener: (room: Room) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onKick(listener: (room: Room, playerId: string) => void): () => void {
    this.kickListeners.add(listener);
    return () => {
      this.kickListeners.delete(listener);
    };
  }

  onChat(listener: (room: Room, message: ChatMessage) => void): () => void {
    this.chatListeners.add(listener);
    return () => {
      this.chatListeners.delete(listener);
    };
  }

  /** Private lines for one member, e.g. why their chat line was held back. */
  onNotice(
    listener: (
      room: Room,
      member: Member,
      text: string,
      textPtBR?: string,
    ) => void,
  ): () => void {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }

  /**
   * Chat is ephemeral: it goes to the room's listeners only and is never part
   * of the saved state. The running game sees each line first and may hold
   * it back, announce something, or change its state (see GameModule.chat).
   */
  chat(room: Room, member: Member, text: string): Refusal | undefined {
    return guard(
      room.code,
      () => {
        const result = rooms.chat(room, member, text);
        if ("error" in result) return result.error;
        const { message } = result;
        const wasFinished = room.game?.result != null;
        const outcome = rooms.chatInGame(
          room,
          member,
          message.text,
          message.at,
        );
        const lines = [
          ...(outcome?.deliver === false ? [] : [message]),
          ...(outcome?.announce ?? []).map((line) =>
            typeof line === "string"
              ? rooms.systemMessage(line, message.at)
              : rooms.systemMessage(line.text, message.at, line.textPtBR),
          ),
        ];
        for (const line of lines)
          for (const listener of this.chatListeners) listener(room, line);
        if (outcome?.note)
          for (const listener of this.noticeListeners)
            listener(room, member, outcome.note, outcome.notePtBR);
        if (outcome?.state !== undefined) {
          if (!wasFinished && room.game?.result) this.recordHistory(room);
          this.notify(room);
        }
        return null;
      },
      () => this.recover(room),
    );
  }

  /** The caller attaches the connection and welcomes it before notifying the room. */
  join(
    room: Room,
    token: string | undefined,
    isHost: boolean,
  ): Member | undefined {
    return guard(
      room.code,
      () => {
        const member = rooms.join(room, token, isHost);
        member.connected = true;
        return member;
      },
      () => this.recover(room),
    );
  }

  disconnect(room: Room, member: Member, connected: boolean): void {
    guard(
      room.code,
      () => {
        member.connected = connected;
        if (!connected && !member.name && !member.isHost)
          room.members = room.members.filter((m) => m !== member);
        this.notify(room);
      },
      () => this.recover(room),
    );
  }

  command(room: Room, member: Member, command: Command): Refusal | undefined {
    return guard(
      room.code,
      () => {
        if (!room.members.includes(member)) return;
        const wasFinished = room.game?.result != null;
        const refusal = this.dispatch(room, member, command);
        if (refusal !== null) return refusal;
        if (!wasFinished && room.game?.result) this.recordHistory(room);
        this.notify(room);
        return null;
      },
      () => this.recover(room),
    );
  }

  private dispatch(room: Room, member: Member, command: Command): Refusal {
    switch (command.type) {
      case "setName":
        return rooms.setName(room, member, command.name);
      case "sit":
        return rooms.sit(room, member, command.seat);
      case "stand":
        return rooms.stand(room, member);
      case "start":
        return rooms.start(room, member);
      case "move": {
        let move = command.move;
        if (
          room.game &&
          !room.game.result &&
          room.game.players.includes(member.id)
        ) {
          const result = requireGame(room.game.gameId).moveSchema.safeParse(
            move,
          );
          if (!result.success) return "That move is not valid.";
          move = result.data;
        }
        return rooms.move(room, member, move);
      }
      case "skip":
        return rooms.skip(room, member, command.playerId);
      case "endGame":
        return rooms.endGame(room, member);
      case "kick": {
        const refusal = rooms.kick(room, member, command.playerId);
        if (refusal === null)
          for (const listener of this.kickListeners)
            listener(room, command.playerId);
        return refusal;
      }
    }
  }

  expire(room: Room): void {
    guard(
      room.code,
      () => {
        if (
          !room.game ||
          (room.game.deadline === null && room.game.resumeAt === null)
        )
          return;
        const deadline = room.game.deadline;
        const wasFinished = room.game.result !== null;
        if (!rooms.expireTurn(room)) {
          if (room.game.deadline !== deadline) this.registry.persist(room);
          return;
        }
        if (!wasFinished && room.game.result) this.recordHistory(room);
        this.notify(room);
      },
      () => this.recover(room),
    );
  }

  notify(room: Room): void {
    guard(
      room.code,
      () => {
        room.updatedAt = Date.now();
        if (room.game)
          requireGame(room.game.gameId).validateState?.(room.game.state);
        for (const listener of this.listeners) listener(room);
        this.registry.persist(room);
      },
      () => {
        if (room.game) this.recover(room);
      },
    );
  }

  recover(room: Room): void {
    room.game = null;
    this.notify(room);
  }

  private recordHistory(room: Room): void {
    const running = room.game;
    if (!running?.result) return;
    const nameOf = (id: string) =>
      room.members.find((m) => m.id === id)?.name ?? "?";
    const entry: HistoryEntry = {
      roomCode: room.code,
      gameId: running.gameId,
      gameName: requireGame(running.gameId).name,
      players: running.players.map(nameOf),
      winners: running.result.winners.map(nameOf),
      endedAt: new Date().toISOString(),
    };
    const history = this.store.data.history;
    if (!Object.hasOwn(history, room.hostEmail))
      Object.defineProperty(history, room.hostEmail, {
        value: [],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    const list = history[room.hostEmail]!;
    list.unshift(entry);
    list.length = Math.min(list.length, 100);
    this.store.save({ history: [room.hostEmail] });
  }
}
