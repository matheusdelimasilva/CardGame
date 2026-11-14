// 30-second song previews from Deezer's public API (no key needed).
//
// - Search uses plain queries: Deezer's advanced syntax (artist:"..." track:"...") is fuzzy
//   and often returns nothing, so we search loosely and pick the best match ourselves.
// - Preview URLs are signed and expire (hdnea=exp=...), so never store them. The Deezer
//   track id is stable; we cache it and re-resolve the preview URL when it runs out.

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export interface SongQuery {
  title: string;
  artist: string;
}

export interface DeezerTrack {
  id: number;
  title: string;
  artist: string;
  previewUrl: string;
}

interface ApiTrack {
  id: number;
  title: string;
  title_short?: string;
  readable?: boolean;
  rank?: number;
  preview?: string;
  artist: { name: string };
}

type Fetch = typeof fetch;

const API = "https://api.deezer.com";
/** Re-resolve a preview URL this long before its signature expires. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const VARIANT = /\b(live|remix|mix|karaoke|instrumental|cover|tribute|re-?record(ing|ed)?|acoustic|demo|version|edit|medley|sped up|slowed)\b/i;

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\s+-\s+.*$/, "") // "Song - 2011 Remaster"
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();
}

/** "Mariah Carey featuring Boyz II Men" -> "Mariah Carey". */
export function primaryArtist(artist: string): string {
  return artist.split(/\s+(?:featuring|feat\.?|ft\.?|with|duet with|x)\s+|\s*\/\s*|,\s+/i)[0]!.trim();
}

/** Higher is better; null means "not this song". */
export function scoreCandidate(want: SongQuery, t: ApiTrack): number | null {
  if (!t.preview || t.readable === false) return null;

  const wantTitle = norm(want.title);
  const gotTitle = norm(t.title_short ?? t.title);
  let score: number;
  if (gotTitle === wantTitle) score = 3;
  else if (gotTitle.startsWith(wantTitle) || wantTitle.startsWith(gotTitle)) score = 1.5;
  else return null;

  const wantArtist = norm(primaryArtist(want.artist));
  const gotArtist = norm(t.artist.name);
  if (gotArtist === wantArtist) score += 3;
  else if (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist)) score += 2;
  else return null;

  // Prefer the original recording over live/remix/re-recorded versions, unless asked for.
  if (VARIANT.test(t.title) && !VARIANT.test(want.title)) score -= 2;

  // Popularity breaks ties (rank is 0..1,000,000).
  return score + (t.rank ?? 0) / 1_000_000;
}

function previewExpiry(url: string): number {
  const m = /exp=(\d+)/.exec(decodeURIComponent(url));
  return m ? Number(m[1]) * 1000 : Date.now() + 10 * 60 * 1000;
}

export class Deezer {
  private ids = new Map<string, number | null>();
  private previews = new Map<number, DeezerTrack>();

  constructor(private readonly fetchImpl: Fetch = fetch) {}

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`);
    if (!res.ok) throw new Error(`Deezer ${path}: HTTP ${res.status}`);
    const body = (await res.json()) as T & { error?: { message?: string } };
    if (body.error) throw new Error(`Deezer ${path}: ${body.error.message ?? "error"}`);
    return body;
  }

  private async search(q: string, limit: number): Promise<ApiTrack[]> {
    const body = await this.get<{ data?: ApiTrack[] }>(`/search?limit=${limit}&q=${encodeURIComponent(q)}`);
    return body.data ?? [];
  }

  private best(want: SongQuery, candidates: ApiTrack[]): ApiTrack | null {
    let best: ApiTrack | null = null;
    let bestScore = -Infinity;
    for (const t of candidates) {
      const s = scoreCandidate(want, t);
      if (s !== null && s > bestScore) [best, bestScore] = [t, s];
    }
    return best;
  }

  private remember(t: ApiTrack): DeezerTrack {
    const track = { id: t.id, title: t.title, artist: t.artist.name, previewUrl: t.preview! };
    this.previews.set(t.id, track);
    return track;
  }

  /** Fresh track data (with an unexpired preview URL) by Deezer id. */
  async trackById(id: number): Promise<DeezerTrack | null> {
    const cached = this.previews.get(id);
    if (cached && previewExpiry(cached.previewUrl) - EXPIRY_MARGIN_MS > Date.now()) return cached;
    const t = await this.get<ApiTrack>(`/track/${id}`).catch(() => null);
    return t?.preview ? this.remember(t) : null;
  }

  /** Finds the song on Deezer. Returns null when there is no confident match with a preview. */
  async findTrack(song: SongQuery): Promise<DeezerTrack | null> {
    const key = `${norm(song.artist)}|${norm(song.title)}`;
    if (this.ids.has(key)) {
      const id = this.ids.get(key)!;
      return id === null ? null : this.trackById(id);
    }

    let hit = this.best(song, await this.search(`${primaryArtist(song.artist)} ${song.title}`, 25));
    // Fallback: some artist spellings derail the combined query; title-only, then filter by artist.
    hit ??= this.best(song, await this.search(song.title, 50));

    this.ids.set(key, hit?.id ?? null);
    return hit ? this.remember(hit) : null;
  }

  /**
   * Streams the song's 30s MP3 preview into an HTTP response, passing Range requests
   * through so browsers can seek. Responds 404 when the song is not on Deezer.
   */
  async streamPreview(song: SongQuery | { deezerId: number }, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const track = "deezerId" in song ? await this.trackById(song.deezerId) : await this.findTrack(song);
    if (!track) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return void res.end(JSON.stringify({ error: "No preview found for this song." }));
    }

    const abort = new AbortController();
    res.on("close", () => abort.abort());
    const upstream = await this.fetchImpl(track.previewUrl, {
      headers: req.headers.range ? { range: req.headers.range } : {},
      signal: abort.signal,
    });
    if (!upstream.ok || !upstream.body) {
      this.previews.delete(track.id); // maybe expired; next call re-resolves
      res.writeHead(502, { "Content-Type": "application/json" });
      return void res.end(JSON.stringify({ error: "Could not load the preview." }));
    }

    const headers: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=600",
    };
    for (const h of ["content-length", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    res.writeHead(upstream.status, headers);
    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream).on("error", () => res.destroy()).pipe(res);
  }
}
