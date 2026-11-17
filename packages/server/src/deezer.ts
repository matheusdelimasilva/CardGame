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
  /** The full credit ("Mark Ronson featuring Bruno Mars") when `artist` was cut down to search with. */
  credit?: string;
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
/** A different recording from the hit: rejected unless the wanted title asks for it. */
const VARIANT =
  /\b(live|ao vivo|remix|rmx|mix|mixshow|karaoke|instrumental|a ?cap+ella|acoustic|demo|cover|tribute|re-?record(ing|ed)?|sped up|slowed|reprise|redux|overdub|alternate take|alt\.? take|pianoforte|taylor['’]?s version|vs\.?)\b|\b(19|20)\d\d version\b/i;
/** Bracket tags that don't change the recording ("Single Version", "Remastered 2009", ...). */
const HARMLESS =
  /^((\d{4} )?(digital(ly)? )?remaster(ed)?( version)?( \d{4})?|single( version| edit)?|radio edit|(7|12)"? (inch )?(single )?edit|edit(ed)?( version)?|mono( version)?|stereo( version)?|original( mix| version)?|(love )?theme from .*|(from|music from) (the )?(original )?(motion picture|film|movie|musical|soundtrack|ost|tv|series)\b.*|from ["“].*|.*\bsoundtrack\b.*)$/i;
/** Sound-alike / cover uploads that put the real artist's name in their own. */
const IMPOSTOR =
  /\b(karaoke|tribute|made famous|originally performed|in the style of|cover|hello i['’]?m|as made popular|vs\.? the hits)\b/i;

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
  return artist
    .split(
      /\s+\(?(?:featuring|feat\.?|ft\.?|with|duet with|com (?:a )?participação de|participação de|part\.?|x)\s+|\s*\/\s*|,\s+/i,
    )[0]!
    .trim()
    .replace(/\s*\($/, "");
}

/**
 * Comparable forms of a title: with bracketed parts dropped, and with them kept
 * ("Whoomp! (There It Is)"). "Part II" and "Pt. 2" compare equal. A double A-side
 * ("Maggie May" / "Reason to Believe") is matched on its first title.
 */
function titleForms(title: string): Set<string> {
  const first = title.split(/"?\s+\/\s+"?|"\s*\/\s*"/)[0]!;
  const keep = first.replace(/[()[\]]/g, " ");
  const parts = (s: string) =>
    norm(s)
      .replace(/\bpart\b/g, "pt")
      .replace(
        /\bpt (i{1,3}|iv)\b/g,
        (_, r: string) => `pt ${["i", "ii", "iii", "iv"].indexOf(r) + 1}`,
      );
  return new Set([parts(first), parts(keep)].filter(Boolean));
}

/** Same act: identical names, or one is the other plus words ("David Rose Orchestra"). */
function sameArtist(want: string, got: string): boolean {
  if (!want || !got) return false; // non-Latin names normalise to "" and would match anything
  return (
    got === want || got.startsWith(want + " ") || want.startsWith(got + " ")
  );
}

/**
 * True when every tag on the candidate's title that the wanted title doesn't have is
 * known to be harmless. A "feat." tag is harmless when the dataset credits those artists too.
 */
function cleanTags(want: SongQuery, title: string): boolean {
  const wantedTitle = norm(want.title.replace(/[()[\]]/g, " "));
  const wantedArtists = new Set(
    norm((want.credit ?? want.artist).replace(/[()[\]]/g, " ")).split(" "),
  );
  const tags = [...title.matchAll(/\(([^)]*)\)|\[([^\]]*)\]|\s-\s(.+)$/g)].map(
    (m) => (m[1] ?? m[2] ?? m[3])!.trim(),
  );
  return tags.every((tag) => {
    for (const part of tag.split(/\s*[/;]\s*/)) {
      const p = part.trim();
      if (!p || HARMLESS.test(p) || (norm(p) && wantedTitle.includes(norm(p))))
        continue;
      const feat =
        /^(feat\.?|featuring|ft\.?|with|com (?:a )?participação de|participação de|part\.?)\s+(.*)$/i.exec(
          p,
        );
      if (
        feat &&
        norm(feat[2]!)
          .split(" ")
          .every((w) => w === "and" || w === "e" || wantedArtists.has(w))
      )
        continue;
      return false;
    }
    return true;
  });
}

/** Higher is better; null means "not this song". */
export function scoreCandidate(want: SongQuery, t: ApiTrack): number | null {
  if (!t.preview || t.readable === false) return null;
  if (
    IMPOSTOR.test(t.artist.name) ||
    (IMPOSTOR.test(t.title) && !IMPOSTOR.test(want.title))
  )
    return null;
  // Remixes, live takes, re-recordings etc. are other recordings: a miss beats a wrong one.
  if (VARIANT.test(t.title) && !VARIANT.test(want.title)) return null;
  // An explicitly requested Brazilian live hit must not fall back to a studio take.
  if (/\bao vivo\b/i.test(want.title) && !/\b(ao vivo|live)\b/i.test(t.title))
    return null;
  if (/\b(remix|rmx)\b/i.test(want.title) && !/\b(remix|rmx)\b/i.test(t.title))
    return null;

  const wanted = titleForms(want.title);
  const got = [...titleForms(t.title), ...titleForms(t.title_short ?? t.title)];
  if (!got.some((g) => wanted.has(g))) return null;

  const wantArtist = norm(primaryArtist(want.artist));
  const gotArtist = norm(t.artist.name);
  if (!sameArtist(wantArtist, gotArtist)) return null;

  // Any tag we don't recognise as harmless ("(Commentary)", "(from One Night In Malibu)",
  // "(Juliet's Version)") usually means another recording. Treat it as a miss.
  if (!cleanTags(want, t.title)) return null;

  // Exact artist name first, then popularity (rank is 0..1,000,000).
  return (gotArtist === wantArtist ? 1 : 0) + (t.rank ?? 0) / 1_000_000;
}

function previewExpiry(url: string): number {
  const m = /exp=(\d+)/.exec(decodeURIComponent(url));
  return m ? Number(m[1]) * 1000 : Date.now() + 10 * 60 * 1000;
}

export class Deezer {
  private ids = new Map<string, number | null>();
  private previews = new Map<number, DeezerTrack>();

  // A plain field, not a parameter property, so Node can run this file directly
  // (type stripping) from the tools/songs scripts.
  private readonly fetchImpl: Fetch;

  constructor(fetchImpl: Fetch = fetch) {
    this.fetchImpl = fetchImpl;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`);
    if (!res.ok) throw new Error(`Deezer ${path}: HTTP ${res.status}`);
    const body = (await res.json()) as T & { error?: { message?: string } };
    if (body.error)
      throw new Error(`Deezer ${path}: ${body.error.message ?? "error"}`);
    return body;
  }

  private async search(q: string, limit: number): Promise<ApiTrack[]> {
    // Deezer search sometimes answers {"data":[],"total":11}: results exist but the page
    // came back empty. It is transient, so retry a few times before believing it.
    for (let attempt = 0; ; attempt++) {
      const body = await this.get<{ data?: ApiTrack[]; total?: number }>(
        `/search?limit=${limit}&q=${encodeURIComponent(q)}`,
      );
      const data = body.data ?? [];
      if (data.length || !body.total || attempt >= 3) return data;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  /** The artist's most popular tracks (up to 300), for songs the text search misses. */
  private async artistTopTracks(artist: string): Promise<ApiTrack[]> {
    const found = await this.get<{ data?: { id: number; name: string }[] }>(
      `/search/artist?limit=5&q=${encodeURIComponent(artist)}`,
    );
    const want = norm(artist);
    const match = found.data?.find((a) => norm(a.name) === want);
    if (!match) return [];
    const tracks: ApiTrack[] = [];
    for (let index = 0; index < 300; index += 100) {
      const page = await this.get<{ data?: ApiTrack[] }>(
        `/artist/${match.id}/top?limit=100&index=${index}`,
      );
      tracks.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < 100) break;
    }
    return tracks;
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
    const track = {
      id: t.id,
      title: t.title,
      artist: t.artist.name,
      previewUrl: t.preview!,
    };
    this.previews.set(t.id, track);
    return track;
  }

  /** Fresh track data (with an unexpired preview URL) by Deezer id. */
  async trackById(id: number): Promise<DeezerTrack | null> {
    const cached = this.previews.get(id);
    if (
      cached &&
      previewExpiry(cached.previewUrl) - EXPIRY_MARGIN_MS > Date.now()
    )
      return cached;
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

    // "Jan and Dean" is one act, but "The Andrews Sisters and Gordon Jenkins" is filed on
    // Deezer under the first name only. Try the full credit first, then the lead name.
    const full = primaryArtist(song.artist);
    const lead = full.split(/\s+(?:and|&|e)\s+/i)[0]!.trim();
    let hit: ApiTrack | null = null;
    for (const artist of lead && lead !== full ? [full, lead] : [full]) {
      const want = {
        title: song.title,
        artist,
        credit: song.credit ?? song.artist,
      };
      hit ??= this.best(want, await this.search(`${artist} ${song.title}`, 25));
      // Fallback: some artist spellings derail the combined query; title-only, then filter by artist.
      hit ??= this.best(want, await this.search(song.title, 50));
      // Last resort: older songs buried under covers are usually in the artist's top tracks.
      hit ??= this.best(want, await this.artistTopTracks(artist));
      if (hit) break;
    }

    this.ids.set(key, hit?.id ?? null);
    return hit ? this.remember(hit) : null;
  }

  /**
   * Streams the song's 30s MP3 preview into an HTTP response, passing Range requests
   * through so browsers can seek. Responds 404 when the song is not on Deezer.
   */
  async streamPreview(
    song: SongQuery | { deezerId: number },
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const track =
      "deezerId" in song
        ? await this.trackById(song.deezerId)
        : await this.findTrack(song);
    if (!track) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return void res.end(
        JSON.stringify({ error: "No preview found for this song." }),
      );
    }

    const abort = new AbortController();
    res.on("close", () => abort.abort());
    let upstream: Response;
    try {
      upstream = await this.fetchImpl(track.previewUrl, {
        headers: req.headers.range ? { range: req.headers.range } : {},
        signal: abort.signal,
      });
    } catch (err) {
      // The listener went away (a browser drops the request when the next song starts): nothing to answer.
      if (abort.signal.aborted) return;
      throw err;
    }
    if (!upstream.ok || !upstream.body) {
      this.previews.delete(track.id); // maybe expired; next call re-resolves
      res.writeHead(502, { "Content-Type": "application/json" });
      return void res.end(
        JSON.stringify({ error: "Could not load the preview." }),
      );
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
    Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream)
      .on("error", () => res.destroy())
      .pipe(res);
  }
}
