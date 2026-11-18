import { httpError } from "../user-messages";
import international from "../../../../tools/songs/out/songs.json";
import brasil from "../../../../tools/songs/out/songs-br.json";
import { json, type HttpContext, type Route } from "./context";

// Restrict the public preview proxy to IDs already in the game's catalog.
const previewIds = new Set(
  [...international, ...brasil]
    .map((song) => song.deezerId)
    .filter((id) => id !== null),
);
export function libraryRoutes({ deezer }: HttpContext): Route[] {
  return [
    {
      method: "GET",
      path: /^\/api\/library\/preview\/(\d+)$/,
      async handler(req, res, match) {
        const deezerId = Number(match[1]);
        if (!previewIds.has(deezerId))
          return json(
            res,
            404,
            httpError("Preview is not in the song catalog."),
          );
        await deezer.streamPreview({ deezerId }, req, res);
      },
    },
  ];
}
