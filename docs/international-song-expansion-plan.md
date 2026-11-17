# International song expansion

Prepared 2026-11-15; execution authorized in this chat. The campaign prioritizes hundreds of additional playable songs and even coverage, using recognizable chart entries already present before adding new discovery sources.

## Baseline and target

The international catalog (`tools/songs/out/songs.json`) contains 6,711 rows, covering release years 1949–2025. Only 357 have Deezer IDs, all distinct; 6,354 lack IDs. The game normally samples only rows with IDs (`packages/games/src/hitster/index.ts`, `sampleSongs`). An ID is not evidence of a currently working preview. No freshness audit exists for the original 357.

| Period    | Catalog rows | With audio IDs |  Additions for 15/year |
| --------- | -----------: | -------------: | ---------------------: |
| 1949      |           33 |              5 | Outside initial target |
| 1950–1959 |          433 |             43 |                    107 |
| 1960–1969 |        1,001 |             50 |                    100 |
| 1970–1979 |        1,025 |             51 |                     99 |
| 1980–1989 |        1,005 |             48 |                    102 |
| 1990–1999 |          942 |             45 |                    105 |
| 2000–2009 |          907 |             45 |                    105 |
| 2010–2019 |          891 |             47 |                    103 |
| 2020–2025 |          474 |             23 |                     67 |

**First target: 15 ID-backed songs in every release year from 1950–2025.** This needs 788 additional playable entries and gives 1,145 total including 1949, if all deficits are filled without removals. Ten/year needs 408 additions; twenty/year needs 1,168. These are exact deficits, not guaranteed acceptance yields. The present playable pool is already fairly even across full decades; the much larger raw catalog is uneven. Completing playback matching is the most direct way to expand the game.

Keep 1949 separate because the archive only covers one year of that decade. Do not count the incomplete 2026 chart year as comparable to complete decades. Within each year, prioritize higher chart ranks, then move to the next candidate if evidence or audio fails. Quotas never override recording checks.

## Mostly automatic pipeline

1. Preserve the baseline and build per-year deficits. Existing rows are the first discovery pool: chart recognition is already recorded. Round-robin deficient years to prevent a long run from favoring one era.
2. Resolve candidate audio through the existing strict Deezer matcher. Reject covers, incompatible versions, unreadable tracks and duplicates. Fetch full track details; retain ISRC, album, duration and version evidence.
3. Search MusicBrainz by ISRC and require the same ISRC, compatible song/version, exact normalized full recording artist credit, original-release year equal to the existing card year, and duration within five seconds. Uncertain dates and later recordings go to review. A compilation/remaster date never replaces the original date. Preserve song keys and card years.
4. Fetch and validate the actual preview response. Require successful HTTP, audio content type, a nonempty MP3 payload, and store check time/status. Do not commit signed URLs or audio. Count verified additions separately from legacy ID coverage.
5. Save accepted evidence in `tools/songs/international/accepted.json`. Keep HTTP search caches and rejected/review candidates under the ignored `.cache/international/`. Apply accepted IDs and verified recording MBIDs to existing rows. The builder reuses accepted evidence so rebuilding cannot silently erase the campaign.
6. Audit the first 100 attempted candidates and their accepted evidence, fix any incorrect acceptance rule, then scale in resumable runs. Report accepted volume, review reasons, per-year/decade coverage, duplicate checks, and preview failures.

Implemented runner: `node tools/songs/international/expand.mjs --limit 200 --target 15 [--apply]`. It requires Node with TypeScript stripping because it imports the existing server matcher. The limit is attempts per run, not accepted additions. Cached review/miss decisions prevent repeated requests; transient network errors remain retryable. The initial campaign does not automatically retry ambiguous evidence or weaken its gates.

## New titles beyond the existing 6,711

Recovering an existing row is a **new playable addition**, not a newly discovered catalog title. Report those separately. Once this campaign has established yield, add an independent discovery manifest of UK chart hits absent from the US year-end lists. Use the Official Charts archive (1952 onward), keeping chart date/rank/source and corroborating original recording dates via MusicBrainz. Validate bulk access/licensing before a large importer; no unrestricted public bulk API was verified. Continue into reviewed regional first-party charts for broader language/market diversity. UK coverage alone does not make this a geographically balanced catalog.

For remaining deficient years, use chart-backed singles and reviewed artist/label discographies. Avoid filling quotas with arbitrary album tracks. A second campaign goal of 300–500 genuinely new titles is plausible as a discovery target, but requires a separate measured novelty/acceptance yield. This first execution makes no claim to have discovered such titles unless the report shows them.

## Automation choices and remaining risks

The recommended approach automates search, identity evidence, preview checks, deficit ordering and accepted export. It sends missing/conflicting ISRCs, duration differences, alternate versions and year disagreements to review. A fully unattended strict subset is possible; its volume is constrained by evidence coverage, especially for older recordings. An LLM can propose candidates or summarize discrepancies; source evidence decides acceptance.

Use one shared MusicBrainz limiter at 1.15 seconds between requests, descriptive User-Agent, caches, bounded timeouts and exponential backoff. Deezer access has been successfully probed for this campaign; historical code comments are not a current quota guarantee. Provider availability and preview geography can change. An ISRC is useful but imperfect identity evidence, and its assignment year is never the release year. Metadata verification does not equal listening to every preview; manually spot-check accepted tracks and inspect conflicts.

Equalizing the catalog improves random gameplay coverage. Exact equal decade probability would require a separate seeded sampling change; preserve current gameplay behavior during data expansion. Track artist concentration as the pool grows; the chart-ranked candidate pool favors recognizable hits but is US-centric.

## Validation and reproducibility

Require no removed/reordered rows, unchanged existing title/artist/year keys and original nonnull IDs, unique positive new Deezer IDs, an accepted evidence row for each new ID, verified original year, complete MB recording credits, fresh successful preview checks, and offline reapplication. Test the identity gates against live/remix, wrong year/credit/ISRC, duration mismatch and invalid audio responses. Run relevant existing Deezer and Hitster tests. Keep baseline counts in the final report. Do not claim the original 357 previews were rechecked unless a separate audit does so.

Sources and verified access limitations: [international-song-source-research.md](international-song-source-research.md), [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [recording guidelines](https://musicbrainz.org/doc/Style/Recording), [IFPI ISRC structure](https://isrc.ifpi.org/isrc-standard/isrc-structure), [Official Charts archive guide](https://www.officialcharts.com/chart-news/a-guide-to-exploring-the-official-charts-archive__8094/).

## Pilot correction: conflicting first-release metadata

The first scale audit found that Alex Warren's “Ordinary” inherits a 2024
MusicBrainz first-release date, while the [label's release announcement](https://www.warnermusic.ie/news/2025/alex-warrens-love-is-anything-but-ordinary-on-deeply-romantic-new-single/),
[Official Charts](https://www.officialcharts.com/songs/alex-warren-ordinary/)
and Deezer's single identify the 2025 release. The campaign paused, added a
regression test, and held that candidate rather than changing the existing card
year automatically. Rule version 2 also holds conflicting single-release years,
Deezer dates earlier than the card year, and combined two-title cards. Eleven
previous acceptances were returned to review; all retained evidence was
re-audited before resuming. This is why a matching ISRC alone cannot approve the
year and why ambiguous dates require review. Some held tracks will prove valid
with stronger original-album or historical-single evidence.
