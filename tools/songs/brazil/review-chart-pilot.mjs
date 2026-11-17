// Produces a resumable review shortlist for strict misses. It never approves a version.
import { join } from "node:path";
import { norm } from "../normalize.mjs";
import { CACHE_DIR, readJson, writeJson, USER_AGENT } from "../lib.mjs";
const source = join(CACHE_DIR, "br", "chart-pilot-matches.json");
const path = join(CACHE_DIR, "br", "chart-pilot-review.json");
const result = await readJson(path, {});
for (const [key, item] of Object.entries(await readJson(source, {}))) {
  if (result[key] || item.metadata) continue;
  try {
    const url = new URL("https://api.deezer.com/search");
    url.searchParams.set("q", `${item.song.artist} ${item.song.title}`);
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw Error(body.error.message);
    const candidates = (body.data ?? []).slice(0, 5).map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist?.name,
      album: t.album?.title,
      albumId: t.album?.id,
      hasPreview: !!t.preview,
      readable: t.readable,
    }));
    const likely = (body.data ?? []).find(
      (t) =>
        norm(t.artist?.name ?? "") === norm(item.song.artist) &&
        norm(t.title).startsWith(norm(item.song.title)) &&
        t.preview &&
        t.readable !== false,
    );
    let preview = null,
      metadata = null;
    if (likely) {
      const t = await (
        await fetch(`https://api.deezer.com/track/${likely.id}`, {
          signal: AbortSignal.timeout(15000),
        })
      ).json();
      metadata = {
        id: t.id,
        title: t.title,
        artist: t.artist?.name,
        album: t.album?.title,
        isrc: t.isrc,
        releaseDate: t.release_date,
        duration: t.duration,
      };
      const audio = await fetch(likely.preview, {
        headers: { Range: "bytes=0-1023" },
        signal: AbortSignal.timeout(15000),
      });
      const bytes = new Uint8Array(await audio.arrayBuffer());
      preview = {
        status: audio.status,
        contentType: audio.headers.get("content-type"),
        bytes: bytes.length,
        ok:
          [200, 206].includes(audio.status) &&
          audio.headers.get("content-type")?.startsWith("audio/") &&
          bytes.length > 0,
      };
    }
    result[key] = {
      song: item.song,
      candidates,
      metadata,
      preview,
      state: "needs_source_and_version_review",
      checkedAt: new Date().toISOString(),
    };
    await writeJson(path, result);
    console.log(
      `${Object.keys(result).length} ${likely ? "AUDIO CANDIDATE" : "REVIEW"} ${key}`,
    );
  } catch (e) {
    console.error(`${key}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 250));
}
