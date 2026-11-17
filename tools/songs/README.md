# Song dataset (US, by release year)

Builds `out/songs.json`: popular songs grouped by the year they were **created**
(first released), for the music-timeline game. Plain Node (v18+), no dependencies.

## Sources

| Data                     | Source                                                                         | Notes                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Which songs were popular | Billboard Year-End singles lists, via the Wikipedia pages                      | 1959+ is the Hot 100 (100/yr). 1949-1958 are Billboard's smaller year-end lists (30-51/yr). |
| Original release year    | [MusicBrainz](https://musicbrainz.org) recording search (`first-release-date`) | Data is CC0.                                                                                |

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
30s preview, played via the room-scoped track URL; null when not matched yet).
A song that charted in two consecutive years appears once.

## Known limits

- US-only, and chart-popular rather than streaming-popular.
- Years marked `chart-year` can be off by one (e.g. a December release that charted next year).
- Billboard/Wikipedia content is used for factual metadata only (titles, artists, ranks).

## Brazil

Run from the repo root (network stages are resumable; do not commit `.cache/`):

```bash
node tools/songs/brazil/scrape-br.mjs                 # all chart pages + 1900-current year categories
node tools/songs/brazil/fetch-musicbrainz-br.mjs       # at least 1.1 seconds between requests
node tools/songs/brazil/build-songs-br.mjs
node tools/songs/fetch-deezer.mjs --br                 # every Brazilian dataset row
node tools/songs/brazil/build-songs-br.mjs
node tools/songs/brazil/verify-songs-br.mjs
node --test tools/songs/brazil/pipeline-br.node-test.mjs # offline script regression checks
```

The Deezer step imports the server's TypeScript matcher, so use a Node version
with native type stripping (this build used Node 26). The other Brazilian steps
remain plain JavaScript. `--br --top N` selects chart-ranked rows only, excluding
category/curated rows without a rank; omit `--top` to attempt all rows. Brazil
uses `.cache/br/deezer.json` and `out/deezer-review-br.txt`; US paths are unchanged.
The Brazilian builder emits `deezerId: null` for misses or unqueried songs and
prints the matched count. It can build from partial MusicBrainz caches, retaining
`chart-year` fallbacks.

The sources cover Brazilian charts, which include international artists, as well
as Brazilian song categories and a curated historical list. They are not a
verified Brazilian-artists-only catalog. Categories without a performer are
excluded. See [verification notes](brazil/verification-br.md) for corrections,
recording-specific live-hit decisions, and remaining historical uncertainties.

## Song Library dashboard

Open `/songs` in the web app, or choose **Explore the song library** on the home
screen. It reads both generated JSON catalogs directly; rebuilding a dataset is
reflected on the next web build. The dashboard is lazy-loaded separately from the
game so its full metadata does not increase the initial game bundle.

Search is case- and accent-insensitive and accepts titles, artist credits, years,
Deezer IDs, and MusicBrainz IDs. Catalog, decade, year-source, and preview-quality
filters combine; charts and summary counts follow the filters. Click a decade or
artist to explore, or a track title to inspect chart metadata, provenance, IDs,
and the raw record. Export JSON downloads all filtered records in the selected
sort order, including catalog labels (not only the current page).

Playback uses `/api/library/preview/:deezerId`, which accepts only IDs present in
the generated datasets and reuses the server's Deezer streaming implementation.
Run both web and server for previews. Matched IDs indicate dataset coverage, not
guaranteed current availability: removed or region-restricted previews can fail.
Missing-ID rows remain browsable, but cannot play from this dashboard. Preview
failures offer retry and a direct Deezer link. No metadata edits are performed.

## International playable expansion

The international expansion recovers chart entries that lack audio IDs, ordered
across deficient release years. It requires Node with native TypeScript stripping
and network access to Deezer, its preview CDN, and MusicBrainz:

```bash
node tools/songs/international/expand.mjs --limit 200 --target 15 --apply
node --test tools/songs/international/*.node-test.mjs
node tools/songs/international/report.mjs
```

`--limit` caps attempted candidates in this run; `--target` is the per-release-year
ID-backed floor for 1950–2025. `--concurrency` defaults to four (maximum eight),
with a shared per-host request scheduler and 1.15-second MusicBrainz spacing.
Use one runner at a time. Network errors remain retryable. Misses and ambiguous
matches are saved in `.cache/international/decisions.json`; they do not get
silently retried or accepted on a later run. Inspect the queue before revisiting
a decision. The runner checks actual preview audio rather than counting an ID as
proof of availability.

Accepted evidence is checked in at `international/accepted.json`, including the
recording ISRC, full MusicBrainz artist credit, original date, matching duration,
source URLs and successful preview-check timestamp. The existing game catalog
is updated only with `--apply`. Existing title/artist/year keys and nonnull IDs
are preserved; accepted rows receive verified recording MBIDs and MusicBrainz
year provenance. Signed URLs and audio are not persisted. `build-songs.mjs`
reuses accepted evidence and the checked-in legacy ID baseline, while respecting
manual overrides. Its initial chart/metadata stages still require their usual
source caches; this change does not make those stages cache-independent.

The offline report validates changes against the baseline, rechecks acceptance
metadata and emits `out/international-expansion-report.md`, a machine-readable
summary, and `international/review.json`. The original legacy previews are not
retested by this campaign. Recovered rows are new **playable entries**, not newly
discovered song titles. See `docs/international-song-expansion-plan.md` for the
follow-up discovery strategy and coverage targets.

The metadata coverage cards show counts and percentages before applying the
quality filter; click a card to filter the table. “Missing information” counts
records missing any tracked field (title, artist, release year, year source,
chart rank, chart year, MusicBrainz ID, or preview ID) once, even when multiple
fields are absent. Individual missing-field counts overlap. Optional chart
metadata and external IDs are not necessarily errors. The table shows chart rank
alongside chart year, and each record's details list its absent fields.
