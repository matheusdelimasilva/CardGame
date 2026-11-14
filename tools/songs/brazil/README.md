# Song dataset (Brazil, by release year)

Builds `../out/songs-br.json`: popular Brazilian songs (and songs that were big on Brazilian
radio/streaming) grouped by release year, in the same shape as the US `songs.json`.
Plain Node (v22.6+ for the `.ts` import), no dependencies.

## Sources

| Data | Source | Years | Notes |
|---|---|---|---|
| Year-end top 100 (radio) | pt.wikipedia "Lista das canções mais executadas no Brasil em …" (Crowley) | 1999, 2000, 2002, 2004, 2005, 2007, 2008, 2021 | 2000/2002/2004 pages only have the top 10, 2005 the top 20 |
| Number-one songs | pt.wikipedia "Lista de canções/singles número um na …" | 2009–2025 | Brasil Hot 100 Airplay, Hot Popular Songs, Top 100 Brasil (Crowley), Top 50 Streaming (Pro-Música), Brasil Hot 100, Brazil Songs. Every #1 gets `chartRank: 1`. |
| Notable songs by year | pt.wikipedia "Categoria:Canções de <ano>", Brazilian pages only | 1912–2026 | The main source before 1999. No rank: a Wikipedia article is the popularity proxy. |
| Hand-picked hits | `curated-br.mjs` | 1917–2025 | Fallback for gaps; also each year's #1 as reported by the press (Buscapé, Crowley, Pro-Música, Spotify). |
| Release year / id | [MusicBrainz](https://musicbrainz.org) recording search | all | Data is CC0. |

A category page counts as Brazilian when a category says so (Portuguese-language, Brazilian
genre, "do Brasil"…), when its first paragraph does, or when it was recorded by an artist whose
pages are mostly Brazilian. Portuguese (Portugal) and Eurovision songs are excluded.

## Run (from the repo root)

```bash
node tools/songs/brazil/scrape-br.mjs                # ~15 min, caches in .cache/br/
node tools/songs/brazil/fetch-musicbrainz-br.mjs     # ~35 min (1 req/s), resumable
node tools/songs/fetch-deezer.mjs --file songs-br.json   # optional: Deezer preview ids
node tools/songs/brazil/build-songs-br.mjs           # instant, offline
```

## Output fields

Same as `songs.json`: `title`, `artist`, `year` (release year, the one to use), `yearSource`,
`chartYear`, `chartRank`, `mbid`, `deezerId`, plus `source` (which list the song came from).

`yearSource` is one of:
- `wikipedia`: the song's "Canções de <ano>" category (its release year).
- `curated`: hand-picked list.
- `musicbrainz`: chart song whose MusicBrainz first release is the chart year or the year before.
- `chart-year`: chart song with no MusicBrainz match; the year it charted.

`chartYear` and `chartRank` are `null` for songs that only come from Wikipedia categories or the curated list.

## Known limits

- Before 1999 there are no chart lists online; coverage is whatever has a Wikipedia article
  (a handful per year before 1960). Years with no song at all: 1919, 1921, 1923, 1925–1927, 1948.
- For category songs the `artist` is the infobox artist, which is sometimes a later cover
  (e.g. "Enrosca", 1975, credited to Sandy & Junior).
- Chart years include international songs that were big in Brazil (e.g. Backstreet Boys in 1999).
