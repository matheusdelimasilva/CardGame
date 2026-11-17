# Brazilian popular-song expansion: chart-first plan

Revised 2026-11-15. User priority: recognizable popular songs, preferably with a documented chart position. This supersedes the album-first proposal. This is a plan, not an executed bulk import.

## Goal and priority order

Aim for hundreds of net new playable Brazilian recordings, emphasizing the 1960s onward. Select in this order: credible popularity evidence, correct recording and original release year, playable preview, then year coverage. Annual quotas must not be filled with obscure album tracks simply to reach a number.

The earlier 20-per-year calculation remains a coverage benchmark: 547 additional songs would fill the current deficits from 1960–2026, including 490 in 1960–1999. It is not an acceptance quota or a forecast of available chart-backed recordings. Target a first campaign of 300–500 accepted additions, contingent on source coverage and measured pilot yield, then reassess. Chart availability may leave some earlier years thinner.

## Discover from charts; use albums for verification

1. Build a chart-source inventory by period, recording publisher, territory, methodology, frequency, earliest/latest accessible dates, missing issues and access route. Distinguish national radio, streaming, sales, regional and genre charts. Do not describe a local or genre ranking as a national overall ranking.
2. For periods with accessible charts, import annual Top 20/50 lists first, then weekly Top 10/20 entries to find popular singles absent from annual lists. Start with a narrow slice per era; source availability and permissible reuse must be checked before implementing bulk ingestion. Deduplicate repeat appearances across weeks and years. Artist nationality is separate from chart territory: Brazilian charts also include foreign artists. Preserve existing international catalog entries, but count the new Brazilian-performer additions separately.
3. For earlier decades, locate contemporaneous chart pages and their methodology in newspaper/magazine archives and relevant radio/sales records. Use OCR to propose rows, retaining issue/page/crop references; ambiguous titles, artists, columns or positions require inspection. An archive's mere possession of a publication does not establish that it contains a usable chart series. Do not invent a continuous historical national ranking.
4. Where actual chart data cannot be found, use a separately labelled pool of documented hits: artist/label single histories, contemporary accounts of widespread radio success, broadcaster archives or later authoritative histories. These may justify popularity but do not justify a chart position. Album tracklists supply recording/year evidence and candidates to investigate, not automatic popularity evidence.
5. Search and validate the specific Deezer recording. Album and artist discographies become supporting tools for release dates, credits, original vs later versions and ISRC/recording identity.

Source examples to investigate: [Crowley Top 100](https://charts.crowley.com.br/index.html), [Crowley's 2023 annual report](https://www.crowley.com.br/cbab/relatorios/mailing_anual/TOP100BrasilTheCrowleyOfficialBroadcast2023.pdf), Billboard Brasil, Pro-Música Brasil and publication archives. The official Crowley annual report explicitly gives a reporting period, rank, title, artist and execution count. No claim is made here that comparable historical chart archives or bulk endpoints are available for every decade. Wikipedia lists can locate underlying sources but are not substitutes for source verification.

## Preserve chart observations, not one ambiguous rank

Add an evidence sidecar keyed by stable song/recording identity, keeping existing game keys compatible. A song can have many observations. Store:

- chart publisher/name, territory, scope (overall/genre/regional), measurement (radio/streaming/sales), and frequency;
- exact reporting period or issue date; position, chart size and units/executions only if supplied;
- observation type: weekly position, annual position, or explicitly published peak; weeks on chart only if supported;
- source URL, issue/page/table row, retrieval time, raw title and full performer credit;
- connection to the accepted recording, and verification status/reviewer decision.

Keep original recording release year separate from chart year. A 1968 recording can chart in 1969 or return decades later. Never use chart year as a verified release year. A lowest observed position in an incomplete archive must be labelled best observed position, not lifetime peak. Annual #12 and weekly #12 are different facts and must not be compared as equivalent scores.

The existing JSON has `chartYear` and `chartRank`, but its builder collapses multiple appearances to a single preferred chart observation. Preserve those legacy fields for compatibility while retaining all sourced observations in the sidecar. Future UI can show, for example, “#12 · national radio · annual 1982” only when that exact evidence exists; otherwise display “documented hit” or no rank.

## Correct the ingestion assumptions before scaling

The current scraper defaults `rank` to 1 when a table lacks a rank column. That is valid only when the source is explicitly a number-one list. New adapters must distinguish an explicit #1 list from unranked tables, reject ambiguous headers and store unknown positions as null. Do not assume existing rank fields are all independently verified; audit source references before promoting them into the new evidence tier.

The pipeline currently discovers song articles and a limited set of charts, searches MusicBrainz only for already-known titles, retains supplied category/curated dates, and skips cached Deezer nulls indefinitely. Add source-specific parsers, dated/versioned miss retries and explicit verification states rather than broadening the audio matcher's tolerances.

## Acceptance and selection rules

Maintain two transparent tiers: **chart-backed** (position/date/source verified) and **documented hit** (credible popularity evidence, no numerical rank). Report totals separately. Unknown rank must remain unknown. Neither a famous artist, an acclaimed album, current Deezer popularity nor an LLM's memory proves historical chart performance.

Within comparable chart families, prioritize annual Top 20, weekly Top 10 and sustained chart presence; then widen to annual Top 50/100 or weekly Top 20 as needed. Cross-source and cross-methodology diversity matters: radio, streaming and genre lists measure different audiences. Prioritize deficient release years among candidates of comparable popularity evidence. Avoid flooding the catalog with a few artists or one radio-dominant genre; report concentration and use softer tie-breaks rather than excluding major hits through rigid album caps.

All accepted entries also need performer-specific release-year evidence, compatible credits and version, deduplication, and a freshly tested audio preview. Use recording MBID/ISRC plus album/version/duration evidence where available. ISRC's year is assignment year, not original release year. Title/artist alone cannot rule out later re-recordings. A charted live recording is eligible when explicitly supported; preserve that version and date rather than substituting a studio recording. Send conflicts and weak version links to review, and exclude provisional identities from the strict accepted count.

## Automation workflow

`source inventory → chart imports/OCR → normalized observations → popularity shortlist → recording/year resolution → preview test → automatic acceptance or review → export`

Automate structured chart imports, deduplication, shortlisting, strong identity matches, preview checks and reports. Review OCR errors, missing ranks, historical evidence, conflicting dates and ambiguous recordings. An LLM may discover sources and propose matches but cannot invent ranks or approve its own unsupported evidence.

Persist candidate state and provenance outside the game dataset. Check in accepted decisions and compact factual evidence; cache bulky source responses. Exports must rebuild offline. Keep one shared MusicBrainz limiter at the existing 1.1-second interval, provider-specific backoff, and resumable checkpoints. Verify current endpoint access and source reuse conditions. Do not assume a public archive API or a current Deezer quota from repository comments.

## Implementation and pilot

1. Add coverage and chart-evidence reporting, candidate/observation schemas, and a source inventory. Audit legacy ranks; implement the missing-rank rule.
2. Implement one modern structured chart adapter and one historical-source path. Preserve observations and test parser/date/scope handling. Add selective Deezer miss retries and full recording metadata.
3. Pilot 200 distinct chart-backed candidates across available eras, emphasizing 1960–1999. Where historical charts are unavailable, report that explicitly and pilot documented hits as a separate cohort. Measure accepted unique playable recordings, verified rank coverage, year coverage, identity errors and review effort. Audit all automatic acceptances in the pilot.
4. Scale to batches of 100–200 accepted tracks. Expand historical source coverage and chart depth based on measured yield, without relaxing evidence standards to meet a volume target. Publish before/after counts by release year and popularity tier, plus rejected/unavailable/conflicting candidates.
5. After 300–500 additions, reassess coverage and the next target. A total candidate budget of 1,500–2,500 is only a planning allowance until the pilot establishes conversion and source availability.

## Validation and completion criteria

Require source-backed chart position/period/scope, preserved multiple observations, no inferred lifetime peak from partial history, independent release-year checks, working audio at export time, and recording/ID duplicate review. Preserve saved-game title/artist keys and flag unexpected changes to existing songs. Test ranked vs unranked tables, weekly vs annual dates, OCR column mistakes, returning catalog hits, live/remix/re-recording distinctions, guest credits and cached null retries. Run pipeline and relevant application checks before shipping.

Success is hundreds of popular, correctly dated, playable additions with auditable evidence; show what percentage have verified chart positions. Equal yearly counts are a secondary goal. The actual yield and review workload remain unmeasured until the pilot.
