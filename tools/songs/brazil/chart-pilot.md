# Chart-first expansion pilot

Run with Node supporting TypeScript (the matcher imports the server TypeScript module):

```sh
node tools/songs/brazil/prepare-chart-pilot.mjs
node tools/songs/brazil/match-chart-pilot.mjs
node tools/songs/brazil/review-chart-pilot.mjs
node tools/songs/brazil/report-chart-pilot.mjs
node --test tools/songs/brazil/chart-evidence.node-test.mjs tools/songs/brazil/pipeline-br.node-test.mjs
```

Preparation reads the existing chart cache and the historical seed manifest. It
preserves multiple chart observations separately from release years. The legacy
chart cache is explicitly unverified: some old parsers inferred number-one
positions from absent columns. Historical seed rows also remain provisional
until the source scan can be inspected. Unknown release years remain null.

Matching is resumable, stores track/album/ISRC/duration metadata, and tests
actual preview audio responses. The review stage retains alternate candidates
for strict misses, including live/subtitle/medley versions. It does not weaken
the game's matcher. Both stages store results in the ignored `.cache/br/`
directory and never write to the playable song dataset. Neither stage establishes
Brazilian performer nationality or original release year by itself.

The generated `out/chart-pilot-br.json` is an audit snapshot of source claims and
candidate input. Strict matches and playable alternate candidates still need
source/recording review before acceptance. A working preview is not evidence of
the historical version or chart rank. Do not count candidates as additions.

The pilot deliberately keeps foreign performers from mixed Brazilian charts in
the review input, so nationality exclusions are explicit rather than inferred
from territory. No foreign act is automatically promoted into Brazilian-artist
addition counts. Chart positions retain their source context; the script does
not calculate lifetime peaks or weeks on chart from partial histories.

## First completed run

The 2026-11-15 run processed 192 candidates: 167 existing chart-listed
songs without IDs and 25 new provisional annual-1964 seeds. There were 17
strict text matches and 93 additional alternate-version candidates with working
previews, for 110 audio candidates total. Of these, 75 titles explicitly identify
live versions. These totals include foreign performers; they are not counts of
new Brazilian catalog additions. No rows were promoted into the playable pool.
Source-scan, performer, original-year and recording review remains outstanding.

The recovery cohort is made of prior misses and is not a representative sample
of new chart discovery. Expanding to fresh source-backed chart rows is required
to achieve the hundreds-of-additions goal. See `out/chart-pilot-br-report.md`.
