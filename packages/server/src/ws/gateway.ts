import type { Server } from "node:http";
import { clientMessageSchema, type ServerMessage } from "@cardgame/protocol";
import { WebSocket, WebSocketServer } from "ws";
import type { Auth } from "../auth";
import { guard } from "../guard";
import * as rooms from "../rooms";
import type { Member, Room } from "../rooms";
import type { RoomRegistry } from "../rooms/registry";
import type { RoomService } from "../rooms/service";

/** Owns WebSocket admission, message parsing and room-specific transport state. */
export class Gateway {
  private readonly wss: WebSocketServer;
  private sockets = new Map<Room, Map<WebSocket, Member>>();
  private readonly unsubscribe: (() => void)[];

  constructor(
    server: Server,
    private readonly registry: RoomRegistry,
    private readonly service: RoomService,
    private readonly auth: Auth,
  ) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      maxPayload: 16 * 1024,
      verifyClient: (_info, done) => {
        void registry.ready.then(
          () => done(true),
          () => done(false, 503),
        );
      },
    });
    this.unsubscribe = [
      service.onChange((room) => this.broadcast(room)),
      service.onKick((room, playerId) => this.kick(room, playerId)),
      service.onChat((room, message) => {
        for (const ws of this.sockets.get(room)?.keys() ?? [])
          this.send(ws, { type: "chat", message });
      }),
      service.onNotice((room, member, text) => {
        for (const [ws, m] of this.sockets.get(room) ?? [])
          if (m === member) this.send(ws, { type: "notice", text });
      }),
      registry.onDelete((room) => {
        this.sockets.delete(room);
      }),
    ];
    this.wss.on("connection", (ws, req) => {
      const code =
        new URL(req.url ?? "/", "http://localhost").searchParams
          .get("room")
          ?.toUpperCase() ?? "";
      const room = this.registry.get(code);
      if (!room) {
        this.send(ws, {
          type: "error",
          message: "This table does not exist any more.",
        });
        return ws.close();
      }
      let member: Member | undefined;
      ws.on("error", (err) => {
        console.error(`Room ${code}:`, err);
      });
      ws.on("message", (raw) =>
        guard(
          code,
          () => {
            let input: unknown;
            try {
              input = JSON.parse(String(raw));
            } catch {
              return this.send(ws, {
                type: "error",
                message: "Invalid message.",
              });
            }
            const parsed = clientMessageSchema.safeParse(input);
            if (!parsed.success)
              return this.send(ws, {
                type: "error",
                message: "Invalid message.",
              });
            const msg = parsed.data;
            if (!member) {
              if (msg.type !== "hello") return;
              const isHost =
                this.auth.emailFor(msg.sessionToken) === room.hostEmail;
              member = this.service.join(room, msg.memberToken, isHost);
              if (!member) return;
              let roomSockets = this.sockets.get(room);
              if (!roomSockets)
                this.sockets.set(room, (roomSockets = new Map()));
              roomSockets.set(ws, member);
              this.send(ws, { type: "welcome", memberToken: member.token });
              return this.service.notify(room);
            }
            if (msg.type === "hello" || !room.members.includes(member)) return;
            const refusal =
              msg.type === "chat"
                ? this.service.chat(room, member, msg.text)
                : this.service.command(room, member, msg);
            if (typeof refusal === "string")
              this.send(ws, { type: "error", message: refusal });
          },
          () => this.service.recover(room),
        ),
      );
      ws.on("close", () =>
        guard(
          code,
          () => {
            const roomSockets = this.sockets.get(room);
            if (!member || !roomSockets?.delete(ws)) return;
            this.service.disconnect(
              room,
              member,
              [...roomSockets.values()].includes(member),
            );
          },
          () => this.service.recover(room),
        ),
      );
    });
  }

  hasConnections(room: Room): boolean {
    return !!this.sockets.get(room)?.size;
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  private broadcast(room: Room): void {
    const views = [...(this.sockets.get(room) ?? [])].map(
      ([ws, member]) => [ws, rooms.viewFor(room, member)] as const,
    );
    for (const [ws, view] of views)
      guard(room.code, () => this.send(ws, { type: "state", room: view }));
  }

  private kick(room: Room, playerId: string): void {
    const roomSockets = this.sockets.get(room);
    for (const [ws, member] of roomSockets ?? []) {
      if (member.id !== playerId) continue;
      this.send(ws, { type: "kicked" });
      roomSockets?.delete(ws);
      ws.close();
    }
  }

  close(): Promise<void> {
    for (const ws of this.wss.clients) ws.terminate();
    return new Promise((resolve) =>
      this.wss.close(() => {
        for (const unsubscribe of this.unsubscribe) unsubscribe();
        resolve();
      }),
    );
  }
}
