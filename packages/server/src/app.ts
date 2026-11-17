import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join as joinPath, normalize } from "node:path";
import { games } from "@cardgame/games";
import type { ClientMessage, HistoryEntry, ServerMessage } from "@cardgame/protocol";
import { WebSocket, WebSocketServer } from "ws";
import { Auth, normalizeEmail, type SendEmail } from "./auth";
import { Deezer } from "./deezer";
import * as rooms from "./rooms";
import type { Member, Room } from "./rooms";
import { Store } from "./store";

export interface AppOptions {
  /** JSON file for sessions, history and room snapshots. null keeps everything in memory. */
  dataFile: string | null;
  /** null returns sign-in codes in the API response, for local development. */
  sendEmail: SendEmail | null;
  /** Built web client to serve, if any. */
  staticDir?: string;
}

const ROOM_IDLE_MS = 12 * 60 * 60 * 1000;
const MAX_HISTORY = 100;
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

export function createApp(options: AppOptions): { server: Server; close: () => void } {
  const store = new Store(options.dataFile);
  const auth = new Auth(store, options.sendEmail);
  const deezer = new Deezer();
  const roomsByCode = new Map<string, Room>();
  const sockets = new Map<Room, Map<WebSocket, Member>>();

  // Rooms restored from a snapshot start with everybody disconnected.
  for (const room of store.data.rooms) {
    if (!games[room.gameId]) continue; // saved by an older version with a game that no longer exists
    room.settings ??= {};
    if (room.game && !games[room.game.gameId]) room.game = null;
    for (const m of room.members) m.connected = false;
    roomsByCode.set(room.code, room);
  }

  const persist = () => {
    store.data.rooms = [...roomsByCode.values()];
    store.save();
  };

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  const broadcast = (room: Room) => {
    room.updatedAt = Date.now();
    for (const [ws, member] of sockets.get(room) ?? []) {
      send(ws, { type: "state", room: rooms.viewFor(room, member) });
    }
    persist();
  };

  const recordHistory = (room: Room) => {
    const running = room.game!;
    const nameOf = (id: string) => room.members.find((m) => m.id === id)?.name ?? "?";
    const entry: HistoryEntry = {
      roomCode: room.code,
      gameId: running.gameId,
      gameName: games[running.gameId]!.name,
      players: running.players.map(nameOf),
      winners: running.result!.winners.map(nameOf),
      endedAt: new Date().toISOString(),
    };
    const list = (store.data.history[room.hostEmail] ??= []);
    list.unshift(entry);
    list.length = Math.min(list.length, MAX_HISTORY);
  };

  // ---- HTTP ----

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 10_000) req.destroy();
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(raw || "{}");
          resolve(parsed && typeof parsed === "object" ? parsed : {});
        } catch {
          resolve({});
        }
      });
      req.on("error", () => resolve({}));
    });

  const sessionEmail = (req: IncomingMessage) => {
    const header = req.headers.authorization ?? "";
    return auth.emailFor(header.startsWith("Bearer ") ? header.slice(7) : null);
  };

  const serveStatic = (path: string, res: ServerResponse) => {
    const dir = options.staticDir;
    if (!dir) return json(res, 404, { error: "Not found." });
    let file = joinPath(dir, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      file = joinPath(dir, "index.html"); // client-side routes
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === "POST /api/auth/request") {
        const email = normalizeEmail((await readBody(req)).email);
        if (!email) return json(res, 400, { error: "Enter a valid email address." });
        const result = await auth.requestCode(email);
        return json(res, result.error ? 429 : 200, result);
      }
      if (route === "POST /api/auth/verify") {
        const body = await readBody(req);
        const email = normalizeEmail(body.email);
        if (!email) return json(res, 400, { error: "Enter a valid email address." });
        const result = auth.verify(email, String(body.code ?? ""));
        return json(res, result.error ? 400 : 200, result.error ? result : { ...result, email });
      }
      if (route === "GET /api/me") {
        const email = sessionEmail(req);
        return email ? json(res, 200, { email }) : json(res, 401, { error: "Not signed in." });
      }
      if (route === "POST /api/auth/signout") {
        const header = req.headers.authorization ?? "";
        if (header.startsWith("Bearer ")) auth.signOut(header.slice(7));
        return json(res, 200, {});
      }
      if (route === "GET /api/games") {
        return json(res, 200, { games: Object.keys(games).map(rooms.gameInfo) });
      }
      if (route === "POST /api/rooms") {
        const email = sessionEmail(req);
        if (!email) return json(res, 401, { error: "Sign in to host a table." });
        const body = await readBody(req);
        const gameId = String(body.gameId ?? "");
        if (!Object.hasOwn(games, gameId)) return json(res, 400, { error: "Choose a game first." });
        let code = rooms.newRoomCode();
        while (roomsByCode.has(code)) code = rooms.newRoomCode();
        roomsByCode.set(code, rooms.createRoom(code, email, gameId, body.settings));
        persist();
        return json(res, 200, { code });
      }
      if (route === "GET /api/history") {
        const email = sessionEmail(req);
        if (!email) return json(res, 401, { error: "Not signed in." });
        return json(res, 200, { history: store.data.history[email] ?? [] });
      }
      if (route === "GET /api/preview") {
        // ?title=...&artist=...  or  ?deezerId=123  ->  audio/mpeg (30s preview)
        const id = Number(url.searchParams.get("deezerId"));
        const title = url.searchParams.get("title")?.trim();
        const artist = url.searchParams.get("artist")?.trim();
        if (id > 0) return await deezer.streamPreview({ deezerId: id }, req, res);
        if (!title || !artist) return json(res, 400, { error: "Pass title and artist, or deezerId." });
        return await deezer.streamPreview({ title, artist }, req, res);
      }
      const roomMatch = /^\/api\/rooms\/([A-Za-z0-9]+)$/.exec(url.pathname);
      if (req.method === "GET" && roomMatch) {
        return json(res, 200, { exists: roomsByCode.has(roomMatch[1]!.toUpperCase()) });
      }
      if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "Not found." });
      if (req.method === "GET") return serveStatic(url.pathname, res);
      json(res, 405, { error: "Method not allowed." });
    } catch (err) {
      console.error(err);
      json(res, 500, { error: "Something went wrong." });
    }
  });

  // ---- WebSocket: /ws?room=CODE ----

  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });

  wss.on("connection", (ws, req) => {
    const code = new URL(req.url ?? "/", "http://localhost").searchParams.get("room")?.toUpperCase() ?? "";
    const room = roomsByCode.get(code);
    if (!room) {
      send(ws, { type: "error", message: "This table does not exist any more." });
      return ws.close();
    }
    let member: Member | null = null;

    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;

      if (!member) {
        if (msg.type !== "hello") return;
        const isHost = auth.emailFor(msg.sessionToken) === room.hostEmail;
        member = rooms.join(room, typeof msg.memberToken === "string" ? msg.memberToken : undefined, isHost);
        member.connected = true;
        let roomSockets = sockets.get(room);
        if (!roomSockets) sockets.set(room, (roomSockets = new Map()));
        roomSockets.set(ws, member);
        send(ws, { type: "welcome", memberToken: member.token });
        return broadcast(room);
      }
      if (!room.members.includes(member)) return; // kicked

      if (msg.type === "chat") {
        const result = rooms.chat(room, member, msg.text);
        if ("error" in result) return send(ws, { type: "error", message: result.error });
        // Chat is ephemeral: sent to this room's sockets only, not stored, not part of the saved state.
        for (const other of sockets.get(room)?.keys() ?? []) send(other, { type: "chat", message: result.message });
        return;
      }

      const wasFinished = room.game?.result != null;
      let refusal: rooms.Refusal;
      switch (msg.type) {
        case "setName":
          refusal = rooms.setName(room, member, msg.name);
          break;
        case "sit":
          refusal = rooms.sit(room, member, msg.seat);
          break;
        case "stand":
          refusal = rooms.stand(room, member);
          break;
        case "start":
          refusal = rooms.start(room, member);
          break;
        case "move":
          refusal = rooms.move(room, member, msg.move);
          break;
        case "skip":
          refusal = rooms.skip(room, member, msg.playerId);
          break;
        case "endGame":
          refusal = rooms.endGame(room, member);
          break;
        case "kick": {
          refusal = rooms.kick(room, member, msg.playerId);
          if (refusal === null) {
            for (const [other, m] of sockets.get(room) ?? []) {
              if (m.id !== msg.playerId) continue;
              send(other, { type: "kicked" });
              sockets.get(room)!.delete(other);
              other.close();
            }
          }
          break;
        }
        default:
          return;
      }
      if (refusal !== null) return send(ws, { type: "error", message: refusal });
      if (!wasFinished && room.game?.result) recordHistory(room);
      broadcast(room);
    });

    ws.on("close", () => {
      const roomSockets = sockets.get(room);
      if (!member || !roomSockets?.delete(ws)) return;
      const current = member;
      current.connected = [...roomSockets.values()].includes(current);
      // Visitors who never chose a name leave no trace.
      if (!current.connected && !current.name && !current.isHost) {
        room.members = room.members.filter((m) => m !== current);
      }
      broadcast(room);
    });
  });

  // Turn timers: play the default move for anyone who has run out of time.
  const clock = setInterval(() => {
    for (const room of roomsByCode.values()) {
      if (!room.game || room.game.deadline === null) continue;
      const wasFinished = room.game.result !== null;
      if (!rooms.expireTurn(room)) continue;
      if (!wasFinished && room.game.result) recordHistory(room);
      broadcast(room);
    }
  }, 250);
  clock.unref();

  const sweep = setInterval(() => {
    const cutoff = Date.now() - ROOM_IDLE_MS;
    for (const [code, room] of roomsByCode) {
      if (room.updatedAt < cutoff && !sockets.get(room)?.size) {
        roomsByCode.delete(code);
        sockets.delete(room);
      }
    }
    persist();
  }, 60 * 60 * 1000);
  sweep.unref();

  return {
    server,
    close: () => {
      clearInterval(sweep);
      clearInterval(clock);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.close();
      store.flush();
    },
  };
}
