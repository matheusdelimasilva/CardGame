import { getGame, requireGame } from "@cardgame/games";
import { guard } from "../guard";
import * as rooms from "../rooms";
import type { Store } from "../store";
import type { Room } from "./model";

const ROOM_IDLE_MS = 12 * 60 * 60 * 1000;

/** Owns persisted room identity, startup validation and idle-room eviction. */
export class RoomRegistry {
  private roomsByCode = new Map<string, Room>();
  private deleted = new Set<(room: Room) => void>();
  loaded = false;
  readonly ready: Promise<void>;

  constructor(private readonly store: Store) {
    this.ready = store.ready.then(() => this.restore());
  }

  get(code: string): Room | undefined {
    return this.roomsByCode.get(code);
  }
  values(): IterableIterator<Room> {
    return this.roomsByCode.values();
  }

  create(hostEmail: string, gameId: string, settings: unknown): Room {
    let code = rooms.newRoomCode();
    while (this.roomsByCode.has(code)) code = rooms.newRoomCode();
    const room = rooms.createRoom(code, hostEmail, gameId, settings);
    this.roomsByCode.set(code, room);
    this.persist(room);
    return room;
  }

  delete(code: string): void {
    const room = this.get(code);
    if (!room) return;
    this.roomsByCode.delete(code);
    this.store.data.rooms = [...this.values()];
    this.store.save({ rooms: [code] });
    for (const listener of this.deleted) listener(room);
  }

  onDelete(listener: (room: Room) => void): () => void {
    this.deleted.add(listener);
    return () => {
      this.deleted.delete(listener);
    };
  }

  persist(room: Room): void {
    this.store.data.rooms = [...this.values()];
    this.store.save({ rooms: [room.code] });
  }

  private restore(): void {
    for (const room of this.store.data.rooms) {
      if (!getGame(room.gameId)) {
        console.error(`Room ${room.code}: unknown game ${room.gameId}`);
        this.store.save({ rooms: [room.code] });
        continue;
      }
      const gameBefore = room.game;
      const trackKey = room.game?.trackKey;
      const trackNonce = room.game?.trackNonce;
      const connected = room.members.some((member) => member.connected);
      guard(
        room.code,
        () => {
          if (!room.game) return;
          const game = requireGame(room.game.gameId);
          rooms.syncTrack(room);
          game.validateState?.(room.game.state);
          game.activePlayers(room.game.state);
          game.view(room.game.state, null);
        },
        () => {
          room.game = null;
        },
      );
      for (const member of room.members) member.connected = false;
      this.roomsByCode.set(room.code, room);
      if (
        connected ||
        room.game !== gameBefore ||
        room.game?.trackKey !== trackKey ||
        room.game?.trackNonce !== trackNonce
      )
        this.store.save({ rooms: [room.code] });
    }
    this.loaded = true;
    this.store.data.rooms = [...this.values()];
  }

  startIdleSweep(
    active: (room: Room) => boolean,
    recover: (room: Room) => void,
  ): () => void {
    const timer = setInterval(
      () =>
        guard("idle sweep", () => {
          if (!this.loaded) return;
          const cutoff = Date.now() - ROOM_IDLE_MS;
          for (const room of this.values()) {
            guard(
              room.code,
              () => {
                if (room.updatedAt < cutoff && !active(room))
                  this.delete(room.code);
              },
              () => recover(room),
            );
          }
        }),
      60 * 60 * 1000,
    );
    timer.unref();
    return () => clearInterval(timer);
  }
}
