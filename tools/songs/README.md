# Song dataset (US, by release year)

Builds `out/songs.json`: popular songs grouped by the year they were **created**
(first released), for the music-timeline game. Plain Node (v18+), no dependencies.

## Sources

| Data | Source | Notes |
|---|---|---|
| Which songs were popular | Billboard Year-End singles lists, via the Wikipedia pages | 1959+ is the Hot 100 (100/yr). 1949-1958 are Billboard's smaller year-end lists (30-51/yr). |
| Original release year | [MusicBrainz](https://musicbrainz.org) recording search (`first-release-date`) | Data is CC0. |

## Run

```bash
pnpm songs            # runs all three steps
```

or step by step (all from the repo root):

```bash
node tools/songs/scrape-billboard.mjs 1949 2025   # ~3 min, caches HTML in .cache/html
node tools/songs/fetch-musicbrainz.mjs            # ~2 h (1 req/s limit), resumable
node tools/songs/build-songs.mjs                  # instant, offline
node tools/songs/fetch-deezer.mjs --top 5         # optional: Deezer ids, chart top 5 per year (~3 min)
node tools/songs/build-songs.mjs                  # again, to write deezerId into songs.json
```

`fetch-deezer.mjs` uses the server's matcher (`packages/server/src/deezer.ts`). It is strict on
purpose: remixes, live takes, re-recordings ("Taylor's Version") and unrecognised title tags are
treated as misses, because a wrong recording would play under the wrong year. Misses are cached as
`null`; review them in `out/deezer-review.txt` and fix by hand in `deezer-overrides.json`
(`{"Artist — Title": <deezer track id>}`, or `null` to drop the song). Drop `--top` to match every song.

The lookup step is resumable: stop it any time and re-run, it only fetches what is
missing. `build-songs.mjs` works on partial caches; unmatched songs fall back to the chart year.

## How the release year is chosen

MusicBrainz often reports reissue or compilation dates (a 1949 hit "first released" in 2011),
so a candidate date is only accepted if the title and primary artist match and the year is
the chart year or the year before it. Otherwise the chart year is used.
Each song records which one it used in `yearSource` (`musicbrainz` or `chart-year`).

## Output fields

`title`, `artist`, `year` (release year, the one to use), `yearSource`, `chartYear`,
`chartRank`, `mbid` (MusicBrainz recording ID when matched), `deezerId` (Deezer track for the
30s preview, played via `GET /api/preview?deezerId=`; null when not matched yet).
A song that charted in two consecutive years appears once.

## Known limits

- US-only, and chart-popular rather than streaming-popular.
- Years marked `chart-year` can be off by one (e.g. a December release that charted next year).
- Billboard/Wikipedia content is used for factual metadata only (titles, artists, ranks).
