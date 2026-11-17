import { useMemo, useState } from "react";
import {
  catalog,
  filterSongs,
  missingFields,
  qualityOptions,
  type CatalogSong,
  type Filters,
} from "./catalog";
import "./library.css";

const initial: Filters = {
  query: "",
  list: "",
  decade: "",
  quality: "",
  source: "",
};
const number = (n: number) => n.toLocaleString();
const labels: Record<string, string> = {
  "chart-year": "Chart-year fallback",
  musicbrainz: "MusicBrainz",
  wikipedia: "Wikipedia",
  curated: "Curated",
};
const decades = [
  ...new Set(catalog.map((s) => Math.floor(s.year / 10) * 10)),
].sort((a, b) => a - b);

export default function SongLibrary() {
  const [filters, setFilters] = useState(initial);
  const [sort, setSort] = useState("year-desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CatalogSong | null>(null);
  const [playing, setPlaying] = useState<CatalogSong | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const update = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  const rows = useMemo(
    () =>
      filterSongs(filters).sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title);
        if (sort === "artist")
          return (
            a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)
          );
        if (sort === "rank")
          return (
            (a.chartRank ?? Infinity) - (b.chartRank ?? Infinity) ||
            b.year - a.year
          );
        return sort === "year-asc" ? a.year - b.year : b.year - a.year;
      }),
    [filters, sort],
  );
  const coverageRows = useMemo(
    () => filterSongs({ ...filters, quality: "" }),
    [filters],
  );
  const coverage = qualityOptions
    .filter((option) => option.value !== "matched")
    .map((option) => ({
      ...option,
      count: coverageRows.filter(option.matches).length,
    }));
  const matched = rows.filter((s) => s.deezerId).length;
  const artists = new Set(rows.map((s) => s.artist)).size;
  const chartRows = useMemo(
    () => filterSongs({ ...filters, decade: "" }),
    [filters],
  );
  const counts = decades.map((decade) => ({
    decade,
    count: chartRows.filter((s) => Math.floor(s.year / 10) * 10 === decade)
      .length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  const artistCounts = new Map<string, number>();
  rows.forEach((s) =>
    artistCounts.set(s.artist, (artistCounts.get(s.artist) ?? 0) + 1),
  );
  const topArtists = [...artistCounts].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const play = (song: CatalogSong) => {
    setAudioError(false);
    setPlaying(song);
    setAttempt((a) => a + 1);
  };
  const exportRows = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "song-library.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main className="library">
      <header className="lib-nav">
        <a href="/" className="lib-brand">
          ♠ CARDGAME <span>/ THE COLLECTION</span>
        </a>
        <a href="/">Back to game ↗</a>
      </header>
      <section className="lib-heading">
        <div>
          <p className="lib-eyebrow">THE HITSTER ARCHIVE · CATALOG EXPLORER</p>
          <h1>
            Good music.
            <br />
            <em>Great discoveries.</em>
          </h1>
          <p>Dig through the decades. Find a favorite. Inspect every detail.</p>
        </div>
        <div className="lib-record" aria-hidden="true">
          <div>
            CG
            <br />
            <small>33⅓ RPM</small>
          </div>
        </div>
      </section>
      <div className="lib-tabs" aria-label="Song catalog">
        {[
          ["", "All records"],
          ["international", "International"],
          ["brasil", "Brasil"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filters.list === value}
            onClick={() => update("list", value!)}
          >
            {label}
            <span>
              {number(
                catalog.filter((s) => !value || s.catalog === value).length,
              )}
            </span>
          </button>
        ))}
        <span className="lib-live">● FROM THE GAME DATASET</span>
      </div>
      <section className="lib-stats" aria-label="Filtered catalog statistics">
        <div>
          <small>RECORDS IN VIEW</small>
          <strong>{number(rows.length)}</strong>
          <span>of {number(catalog.length)} catalog entries</span>
        </div>
        <div>
          <small>ARTIST CREDITS</small>
          <strong>{number(artists)}</strong>
          <span>distinct credited names</span>
        </div>
        <div>
          <small>PREVIEW MATCHES</small>
          <strong>
            {rows.length ? Math.round((matched / rows.length) * 100) : 0}
            <i>%</i>
          </strong>
          <span>{number(matched)} with a Deezer ID</span>
        </div>
        <div>
          <small>RELEASE YEARS</small>
          <strong className="lib-year-stat">
            {rows.length
              ? `${Math.min(...rows.map((s) => s.year))}–${Math.max(...rows.map((s) => s.year))}`
              : "—"}
          </strong>
          <span>first-release metadata</span>
        </div>
      </section>
      <section
        className="lib-panel lib-coverage"
        aria-label="Metadata coverage"
      >
        <div className="lib-panel-title">
          <h2>What’s in the metadata?</h2>
          <span>{number(coverageRows.length)} records in scope</span>
        </div>
        <p className="lib-coverage-note">
          Click a statistic to explore those records. Counts follow search,
          catalog, decade and year source, before the data-quality filter.
          Missing fields can overlap; chart fields and external IDs are optional
          for some sources.
        </p>
        <div className="lib-coverage-grid">
          {coverage.map((option) => (
            <button
              key={option.value}
              aria-pressed={filters.quality === option.value}
              onClick={() =>
                update(
                  "quality",
                  filters.quality === option.value ? "" : option.value,
                )
              }
            >
              <span>{option.label}</span>
              <strong>
                {number(option.count)}
                <small>
                  {coverageRows.length
                    ? Math.round((option.count / coverageRows.length) * 100)
                    : 0}
                  %
                </small>
              </strong>
              <span className="lib-coverage-description">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="lib-insights">
        <div className="lib-panel">
          <div className="lib-panel-title">
            <h2>A trip through time</h2>
            <span>Pick a decade to explore</span>
          </div>
          <div className="lib-chart">
            {counts.map(({ decade, count }) => (
              <button
                key={decade}
                aria-label={`${decade}s: ${count} songs`}
                aria-pressed={filters.decade === String(decade)}
                onClick={() =>
                  update(
                    "decade",
                    filters.decade === String(decade) ? "" : String(decade),
                  )
                }
              >
                <span className="lib-bar-space">
                  <span
                    className="lib-bar"
                    style={{ height: `${Math.max(2, (count / max) * 100)}%` }}
                  >
                    <span>{number(count)}</span>
                  </span>
                </span>
                <small>{decade}s</small>
              </button>
            ))}
          </div>
          <p className="lib-note">
            Counts follow all filters except the selected decade.
          </p>
        </div>
        <div className="lib-panel">
          <div className="lib-panel-title">
            <h2>On heavy rotation</h2>
            <span>Top artist credits</span>
          </div>
          <div className="lib-artists">
            {topArtists.map(([artist, count], i) => (
              <button key={artist} onClick={() => update("query", artist)}>
                <span>0{i + 1}</span>
                <strong>{artist}</strong>
                <small>{number(count)}</small>
              </button>
            ))}
            {!topArtists.length && <p>No artists match these filters.</p>}
          </div>
        </div>
      </section>
      <section className="lib-panel lib-browser">
        <div className="lib-panel-title">
          <div>
            <p className="lib-eyebrow">THE RECORD CRATE</p>
            <h2>Explore the collection</h2>
          </div>
          <div className="lib-actions">
            <button
              disabled={!matched}
              onClick={() => {
                const playable = rows.filter((s) => s.deezerId);
                const song =
                  playable[Math.floor(Math.random() * playable.length)];
                if (song) {
                  setSelected(song);
                  play(song);
                }
              }}
            >
              ↝ Surprise me
            </button>
            <button disabled={!rows.length} onClick={exportRows}>
              Export JSON ↓
            </button>
          </div>
        </div>
        <div className="lib-filters">
          <label className="lib-search">
            <span>Search the archive</span>
            <input
              value={filters.query}
              onChange={(e) => update("query", e.target.value)}
              placeholder="Search songs, artists, years or IDs…"
            />
          </label>
          <label>
            <span>Decade</span>
            <select
              value={filters.decade}
              onChange={(e) => update("decade", e.target.value)}
            >
              <option value="">All decades</option>
              {decades.map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Data quality</span>
            <select
              value={filters.quality}
              onChange={(e) => update("quality", e.target.value)}
            >
              <option value="">All records</option>
              {qualityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Year source</span>
            <select
              value={filters.source}
              onChange={(e) => update("source", e.target.value)}
            >
              <option value="">All sources</option>
              {[...new Set(catalog.map((s) => s.yearSource))].map((s) => (
                <option key={s} value={s}>
                  {labels[s] ?? s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="lib-results">
          <span aria-live="polite">
            {number(rows.length)} records{" "}
            {Object.values(filters).some(Boolean) && (
              <button
                onClick={() => {
                  setFilters(initial);
                  setPage(0);
                }}
              >
                Clear filters ×
              </button>
            )}
          </span>
          <label>
            Sort by{" "}
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="year-desc">Newest first</option>
              <option value="year-asc">Oldest first</option>
              <option value="artist">Artist A–Z</option>
              <option value="title">Title A–Z</option>
              <option value="rank">Chart rank</option>
            </select>
          </label>
        </div>
        <div className="lib-table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Preview</span>
                </th>
                <th>TRACK / ARTIST</th>
                <th>YEAR</th>
                <th>CHART RANK</th>
                <th>CATALOG</th>
                <th>YEAR SOURCE</th>
                <th>PREVIEW</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(page * 40, (page + 1) * 40).map((song) => (
                <tr
                  key={song.id}
                  className={selected?.id === song.id ? "selected" : ""}
                >
                  <td>
                    <button
                      className="lib-play"
                      disabled={!song.deezerId}
                      aria-label={`Play ${song.title} by ${song.artist}`}
                      onClick={() => play(song)}
                    >
                      ▶
                    </button>
                  </td>
                  <td>
                    <button
                      className="lib-song"
                      onClick={() => setSelected(song)}
                    >
                      {song.title}
                      <span>{song.artist}</span>
                    </button>
                  </td>
                  <td className="lib-table-year">{song.year}</td>
                  <td className="lib-rank">
                    {song.chartRank != null ? (
                      <>
                        <strong>#{song.chartRank}</strong>
                        <span>
                          {song.chartYear != null
                            ? `Chart year ${song.chartYear}`
                            : "Chart year unavailable"}
                        </span>
                      </>
                    ) : (
                      <span>No rank</span>
                    )}
                  </td>
                  <td>
                    {song.catalog === "brasil" ? "Brasil" : "International"}
                  </td>
                  <td>
                    <span
                      className={`lib-badge ${song.yearSource === "chart-year" ? "fallback" : ""}`}
                    >
                      {labels[song.yearSource] ?? song.yearSource}
                    </span>
                  </td>
                  <td>
                    <span
                      className={song.deezerId ? "lib-matched" : "lib-missing"}
                    >
                      {song.deezerId ? "● Matched" : "○ No ID"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="lib-empty">
            <h2>No records in this crate.</h2>
            <p>Try another artist, decade, or quality filter.</p>
            <button
              onClick={() => {
                setFilters(initial);
                setPage(0);
              }}
            >
              Reset filters
            </button>
          </div>
        )}
        <footer className="lib-pagination">
          <span>
            {rows.length
              ? `${page * 40 + 1}–${Math.min(rows.length, (page + 1) * 40)}`
              : "0"}{" "}
            of {number(rows.length)} records
          </span>
          <div>
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Previous
            </button>
            <button
              disabled={(page + 1) * 40 >= rows.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </footer>
      </section>
      <p className="lib-footnote">
        International: Billboard year-end charts. Brasil: charts, Wikipedia
        categories & curated history. Entries may overlap across catalogs. A
        Deezer match does not guarantee current preview availability.
      </p>
      {selected && (
        <aside className="lib-detail" aria-label="Song details">
          <button
            className="lib-close"
            aria-label="Close song details"
            onClick={() => setSelected(null)}
          >
            ×
          </button>
          <p className="lib-eyebrow">
            LINER NOTES · {selected.catalog.toUpperCase()}
          </p>
          <div className="lib-detail-year">{selected.year}</div>
          <h2>{selected.title}</h2>
          <p>{selected.artist}</p>
          <button disabled={!selected.deezerId} onClick={() => play(selected)}>
            ▶ Play 30-second preview
          </button>
          <div className="lib-detail-missing">
            <h3>Missing information</h3>
            {missingFields(selected).length ? (
              <ul>
                {missingFields(selected).map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            ) : (
              <p>All tracked metadata fields are present.</p>
            )}
            <p>Optional chart fields and IDs may not apply to this source.</p>
          </div>
          <dl>
            {[
              [
                "Year source",
                labels[selected.yearSource] ?? selected.yearSource,
              ],
              ["Chart year", selected.chartYear],
              ["Chart rank", selected.chartRank],
              ["Dataset source", selected.source],
              ["Deezer ID", selected.deezerId],
              ["MusicBrainz ID", selected.mbid],
            ].map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value ?? "Not available"}</dd>
              </div>
            ))}
          </dl>
          <div className="lib-detail-links">
            {selected.deezerId && (
              <a
                href={`https://www.deezer.com/track/${selected.deezerId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Deezer ↗
              </a>
            )}
            {selected.mbid && (
              <a
                href={`https://musicbrainz.org/recording/${selected.mbid}`}
                target="_blank"
                rel="noreferrer"
              >
                MusicBrainz recording ↗
              </a>
            )}
          </div>
          <details>
            <summary>Raw record</summary>
            <pre>{JSON.stringify(selected, null, 2)}</pre>
          </details>
        </aside>
      )}
      <section className="lib-player" aria-label="Preview player">
        <div className="lib-mini-record" aria-hidden="true">
          ♪
        </div>
        <div className="lib-now">
          <small>
            {playing
              ? "ON THE TURNTABLE · 30-SECOND PREVIEW"
              : "READY WHEN YOU ARE"}
          </small>
          <strong>
            {playing?.title ?? "Your next discovery is a play away."}
          </strong>
          <span>
            {playing
              ? `${playing.artist} · ${playing.year}`
              : "Choose a track or let us surprise you."}
          </span>
        </div>
        {playing && (
          <>
            <audio
              key={`${playing.id}-${attempt}`}
              controls
              autoPlay
              src={`/api/library/preview/${playing.deezerId}`}
              onError={() => setAudioError(true)}
            />
            <button
              aria-label="Stop preview"
              onClick={() => {
                setPlaying(null);
                setAudioError(false);
              }}
            >
              ×
            </button>
          </>
        )}
        {audioError && (
          <p role="alert">
            Preview unavailable.{" "}
            <button onClick={() => playing && play(playing)}>Retry</button>
            {playing?.deezerId && (
              <a
                href={`https://www.deezer.com/track/${playing.deezerId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open Deezer ↗
              </a>
            )}
          </p>
        )}
      </section>
    </main>
  );
}
