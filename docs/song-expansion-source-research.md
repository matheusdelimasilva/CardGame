# Sources for bulk Brazilian song expansion

Checked 2026-11-15. Recommendation: discover candidates by original album, then validate individual recordings and their previews. Hundreds of new candidates are plausible; net accepted yield requires a pilot and is not established by source catalog size.

## Best source roles

| Source           | Verified capability                                                                                                                                                                                                                                                 | Recommended role                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discos do Brasil | Album pages give release year, label, complete track list and performer/musician credits. The João Gilberto 1961 page supplies twelve tracks and explicitly identifies the original LP year.                                                                        | Seed historically important original albums, preserving the album URL and per-track performer. Avoid reading composer names as singers.                        |
| IMMuB            | Album pages give year, artist, catalog number, track list and alternate editions; some have session notes. The 1965 Leny Andrade album distinguishes a multi-song potpourri from standalone tracks. The 1965 Mário Reis album explicitly identifies a 1971 reissue. | Discover many album tracks across decades; retain edition metadata and flag medleys, live albums and re-recorded older works.                                  |
| MusicBrainz      | API supports artist/release/recording entities, browse pagination, release tracklists and ISRC metadata.                                                                                                                                                            | Scalable machine-readable discovery and recording identifiers, followed by archive corroboration where first-release evidence is weak.                         |
| Deezer           | Existing project runs have successfully searched tracks, fetched ISRC/album metadata and retrieved previews. Developer documentation could not be accessed in this research.                                                                                        | Match playback to the historically established recording, then check the actual preview response. Do not infer a new official quota or availability guarantee. |

Album source examples: [Discos do Brasil — João Gilberto 1961](https://discografia.discosdobrasil.com.br/discos/joao-gilberto-1961), [IMMuB — Estamos Aí](https://immub.org/album/estamos-ai-1), [IMMuB — Ao Meu Rio](https://immub.org/album/ao-meu-rio), [IMMuB — Coisas](https://immub.org/album/coisas).

IMMuB describes its catalog as exceeding 90,000 discs, but that does not imply 90,000 suitable or playable releases. Its FAQ describes onsite audio as low-quality research references; use the pages for metadata, not as the game's audio backend. No supported public bulk API was verified for either archive. Begin with a bounded album URL list and cached, conservative page reads rather than claiming an unrestricted crawler. Sources: [IMMuB catalog history](https://immub.org/noticias/como-o-immub-construiu-o-maior-catalogo-da-musica-brasileira-na-internet), [IMMuB FAQ](https://immub.org/perguntas_frequentes).

## MusicBrainz implementation facts

- Requests need a meaningful User-Agent and must remain at or below one call per second. The existing 1.1-second gap is suitable; use a shared limiter across stages and retry/backoff on 503 responses.
- Resolve reviewed artist MBIDs, browse their releases/release groups, then fetch chosen releases with recordings and artist credits. Browse pages can request up to 100 results; release responses can be shortened by the 500-track response cap, so advance offsets by the actual number of returned releases.
- Fetch recording ISRCs and release membership. Recording search supports artist/recording fields and ISRC lookup, but a `country:BR` recording query means a release occurred in Brazil, not that the artist is Brazilian.

Sources: [API](https://musicbrainz.org/doc/MusicBrainz_API), [rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), [recording search](https://musicbrainz.org/doc/MusicBrainz_API/Search/RecordingSearch).

## Recording identity gates

Automatic acceptance should require an explicit recording link (for example, matching ISRC supported by release metadata), consistent full artist credit and version, credible performer-specific original-release evidence, and a successful preview check. Title similarity plus an album year alone is insufficient. Conflicts, missing identifiers, ambiguous compilations and apparent later studio performances go to review.

MusicBrainz distinguishes different performances, remixes and edits as separate recordings, while ordinary mastering differences generally remain the same recording. A remaster is therefore not automatically a wrong match, but remaster labeling does not itself prove identity. Source: [MusicBrainz recording guidelines](https://musicbrainz.org/doc/Style/Recording).

ISRC is useful for joining recordings across services; its embedded year must never become the card year. IFPI states that the year element is the year of assignment and may differ from the recording or release year. Source: [IFPI ISRC structure](https://isrc.ifpi.org/isrc-standard/isrc-structure).

## Practical pilot

Review a seed list spanning 1960–1999 and several genres/regions, import 20–30 original albums, and measure: candidate tracks, genuinely new recordings, confident matches, working previews, historical-year conflicts, and additions per year. Estimate a larger run only from those observed acceptance rates. This pilot size is an engineering proposal, not a source-derived yield claim.
