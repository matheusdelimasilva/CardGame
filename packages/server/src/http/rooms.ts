import { games, getGame } from "@cardgame/games";
import { createRoomSchema, readBody } from "../http";
import { gameInfo, trackFor } from "../rooms";
import { json, sessionEmail, type HttpContext, type Route } from "./context";

/** Game catalog, room creation/existence, history and room-scoped audio routes. */
export function roomRoutes({
  auth,
  deezer,
  registry,
  store,
}: HttpContext): Route[] {
  return [
    {
      method: "GET",
      path: "/api/games",
      handler(_req, res) {
        json(res, 200, { games: Object.keys(games).map(gameInfo) });
      },
    },
    {
      method: "POST",
      path: "/api/rooms",
      async handler(req, res) {
        const email = sessionEmail(req, auth);
        if (!email)
          return json(res, 401, { error: "Sign in to host a table." });
        const body = await readBody(req, createRoomSchema);
        if (!getGame(body.gameId))
          return json(res, 400, { error: "Choose a game first." });
        const room = registry.create(email, body.gameId, body.settings);
        json(res, 200, { code: room.code });
      },
    },
    {
      method: "GET",
      path: "/api/history",
      handler(req, res) {
        const email = sessionEmail(req, auth);
        if (!email) return json(res, 401, { error: "Not signed in." });
        json(res, 200, {
          history: Object.hasOwn(store.data.history, email)
            ? store.data.history[email]
            : [],
        });
      },
    },
    {
      method: "GET",
      path: /^\/api\/rooms\/([A-Za-z0-9]+)\/track\/([a-f0-9]+)$/,
      async handler(req, res, match) {
        const room = registry.get(match[1]!.toUpperCase());
        const track = room ? trackFor(room, match[2]!) : null;
        if (!track)
          return json(res, 404, { error: "That song is no longer playing." });
        const song = track.deezerId
          ? { deezerId: track.deezerId }
          : { title: track.title, artist: track.artist };
        await deezer.streamPreview(song, req, res);
      },
    },
    {
      method: "GET",
      path: /^\/api\/rooms\/([A-Za-z0-9]+)$/,
      handler(_req, res, match) {
        json(res, 200, {
          exists: registry.get(match[1]!.toUpperCase()) !== undefined,
        });
      },
    },
  ];
}
