import { useMemo, useState } from "react";
import { useLocale } from "../i18n/locale";
import { LanguagePicker } from "../ui/LanguagePicker";
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
const decades = [
  ...new Set(catalog.map((s) => Math.floor(s.year / 10) * 10)),
].sort((a, b) => a - b);

export default function SongLibrary() {
  const { locale, t } = useLocale();
  const numbers = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const number = numbers.format;
  const yearSources: Record<string, string> = {
    "chart-year": t("Chart-year fallback", "Ano da parada como referência"),
    musicbrainz: "MusicBrainz",
    wikipedia: "Wikipedia",
    curated: t("Curated", "Curadoria"),
  };
  const sourceLabel = (source: string) => yearSources[source] ?? source;
  const catalogLabel = (list: CatalogSong["catalog"]) =>
    list === "brasil" ? "Brasil" : t("International", "Internacional");
  const decadeLabel = (year: number) => t(`${year}s`, `Anos ${year}`);
  const recordCount = (count: number) =>
    t(
      `${number(count)} ${count === 1 ? "record" : "records"}`,
      `${number(count)} ${count === 1 ? "registro" : "registros"}`,
    );
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
        if (sort === "title") return a.title.localeCompare(b.title, locale);
        if (sort === "artist")
          return (
            a.artist.localeCompare(b.artist, locale) ||
            a.title.localeCompare(b.title, locale)
          );
        if (sort === "rank")
          return (
            (a.chartRank ?? Infinity) - (b.chartRank ?? Infinity) ||
            b.year - a.year
          );
        return sort === "year-asc" ? a.year - b.year : b.year - a.year;
      }),
    [filters, sort, locale],
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
          ♠ CARDGAME <span>{t("/ THE COLLECTION", "/ A COLEÇÃO")}</span>
        </a>
        <div className="lib-nav-actions">
          <a href="/">{t("Back to game ↗", "Voltar ao jogo ↗")}</a>
          <LanguagePicker compact />
        </div>
      </header>
      <section className="lib-heading">
        <div>
          <p className="lib-eyebrow">
            {t(
              "THE HITSTER ARCHIVE · CATALOG EXPLORER",
              "ACERVO DO HITSTER · CATÁLOGO DE MÚSICAS",
            )}
          </p>
          <h1>
            {t("Good music.", "Música boa.")}
            <br />
            <em>{t("Great discoveries.", "Grandes descobertas.")}</em>
          </h1>
          <p>
            {t(
              "Dig through the decades. Find a favorite. Inspect every detail.",
              "Explore várias décadas, encontre suas favoritas e confira todos os detalhes.",
            )}
          </p>
        </div>
        <div className="lib-record" aria-hidden="true">
          <div>
            CG
            <br />
            <small>33⅓ RPM</small>
          </div>
        </div>
      </section>
      <div
        className="lib-tabs"
        aria-label={t("Song catalog", "Catálogo de músicas")}
      >
        {[
          ["", t("All records", "Todos os registros")],
          ["international", catalogLabel("international")],
          ["brasil", catalogLabel("brasil")],
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
        <span className="lib-live">
          {t("● FROM THE GAME DATASET", "● DO CATÁLOGO DO JOGO")}
        </span>
      </div>
      <section
        className="lib-stats"
        aria-label={t(
          "Filtered catalog statistics",
          "Estatísticas do catálogo filtrado",
        )}
      >
        <div>
          <small>{t("RECORDS IN VIEW", "REGISTROS NA SELEÇÃO")}</small>
          <strong>{number(rows.length)}</strong>
          <span>
            {t(
              `of ${number(catalog.length)} catalog entries`,
              `de ${number(catalog.length)} registros no catálogo`,
            )}
          </span>
        </div>
        <div>
          <small>{t("ARTIST CREDITS", "ARTISTAS CREDITADOS")}</small>
          <strong>{number(artists)}</strong>
          <span>
            {t("distinct credited names", "nomes distintos nos créditos")}
          </span>
        </div>
        <div>
          <small>{t("PREVIEW MATCHES", "PRÉVIAS IDENTIFICADAS")}</small>
          <strong>
            {rows.length ? Math.round((matched / rows.length) * 100) : 0}
            <i>%</i>
          </strong>
          <span>
            {t(
              `${number(matched)} with a Deezer ID`,
              `${number(matched)} com ID do Deezer`,
            )}
          </span>
        </div>
        <div>
          <small>{t("RELEASE YEARS", "ANOS DE LANÇAMENTO")}</small>
          <strong className="lib-year-stat">
            {rows.length
              ? `${Math.min(...rows.map((s) => s.year))}–${Math.max(...rows.map((s) => s.year))}`
              : "—"}
          </strong>
          <span>
            {t("first-release metadata", "dados do primeiro lançamento")}
          </span>
        </div>
      </section>
      <section
        className="lib-panel lib-coverage"
        aria-label={t("Metadata coverage", "Cobertura dos metadados")}
      >
        <div className="lib-panel-title">
          <h2>{t("What’s in the metadata?", "O que há nos metadados?")}</h2>
          <span>
            {t(
              `${recordCount(coverageRows.length)} in scope`,
              `${recordCount(coverageRows.length)} na seleção`,
            )}
          </span>
        </div>
        <p className="lib-coverage-note">
          {t(
            "Click a statistic to explore those records. Counts follow search, catalog, decade and year source, before the data-quality filter. Missing fields can overlap; chart fields and external IDs are optional for some sources.",
            "Selecione uma estatística para explorar os registros. Os totais consideram a busca, o catálogo, a década e a fonte do ano. Um registro pode ter vários campos ausentes. Posições nas paradas e IDs externos são opcionais para algumas fontes.",
          )}
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
              <span>{t(option.label, option.labelPtBR)}</span>
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
                {t(option.description, option.descriptionPtBR)}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="lib-insights">
        <div className="lib-panel">
          <div className="lib-panel-title">
            <h2>{t("A trip through time", "Uma viagem no tempo")}</h2>
            <span>
              {t(
                "Pick a decade to explore",
                "Escolha uma década para explorar",
              )}
            </span>
          </div>
          <div className="lib-chart">
            {counts.map(({ decade, count }) => (
              <button
                key={decade}
                aria-label={t(
                  `${decadeLabel(decade)}: ${number(count)} songs`,
                  `${decadeLabel(decade)}: ${number(count)} ${count === 1 ? "música" : "músicas"}`,
                )}
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
                <small>{decadeLabel(decade)}</small>
              </button>
            ))}
          </div>
          <p className="lib-note">
            {t(
              "Counts follow all filters except the selected decade.",
              "Os totais consideram todos os filtros, exceto a década selecionada.",
            )}
          </p>
        </div>
        <div className="lib-panel">
          <div className="lib-panel-title">
            <h2>{t("On heavy rotation", "Em alta rotação")}</h2>
            <span>{t("Top artist credits", "Artistas com mais faixas")}</span>
          </div>
          <div className="lib-artists">
            {topArtists.map(([artist, count], i) => (
              <button key={artist} onClick={() => update("query", artist)}>
                <span>0{i + 1}</span>
                <strong>{artist}</strong>
                <small>{number(count)}</small>
              </button>
            ))}
            {!topArtists.length && (
              <p>
                {t(
                  "No artists match these filters.",
                  "Nenhum artista corresponde a esses filtros.",
                )}
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="lib-panel lib-browser">
        <div className="lib-panel-title">
          <div>
            <p className="lib-eyebrow">
              {t("THE RECORD CRATE", "A CAIXA DE DISCOS")}
            </p>
            <h2>{t("Explore the collection", "Explore a coleção")}</h2>
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
              {t("↝ Surprise me", "↝ Surpreenda-me")}
            </button>
            <button disabled={!rows.length} onClick={exportRows}>
              {t("Export JSON ↓", "Exportar JSON ↓")}
            </button>
          </div>
        </div>
        <div className="lib-filters">
          <label className="lib-search">
            <span>{t("Search the archive", "Buscar no acervo")}</span>
            <input
              value={filters.query}
              onChange={(e) => update("query", e.target.value)}
              placeholder={t(
                "Search songs, artists, years or IDs…",
                "Busque por faixa, artista, ano ou ID…",
              )}
            />
          </label>
          <label>
            <span>{t("Decade", "Década")}</span>
            <select
              value={filters.decade}
              onChange={(e) => update("decade", e.target.value)}
            >
              <option value="">{t("All decades", "Todas as décadas")}</option>
              {decades.map((d) => (
                <option key={d} value={d}>
                  {decadeLabel(d)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("Data quality", "Qualidade dos dados")}</span>
            <select
              value={filters.quality}
              onChange={(e) => update("quality", e.target.value)}
            >
              <option value="">{t("All records", "Todos os registros")}</option>
              {qualityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label, option.labelPtBR)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("Year source", "Fonte do ano")}</span>
            <select
              value={filters.source}
              onChange={(e) => update("source", e.target.value)}
            >
              <option value="">{t("All sources", "Todas as fontes")}</option>
              {[...new Set(catalog.map((s) => s.yearSource))].map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="lib-results">
          <span aria-live="polite">
            {recordCount(rows.length)}{" "}
            {Object.values(filters).some(Boolean) && (
              <button
                onClick={() => {
                  setFilters(initial);
                  setPage(0);
                }}
              >
                {t("Clear filters ×", "Limpar filtros ×")}
              </button>
            )}
          </span>
          <label>
            {t("Sort by", "Ordenar por")}{" "}
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="year-desc">
                {t("Newest first", "Mais recentes primeiro")}
              </option>
              <option value="year-asc">
                {t("Oldest first", "Mais antigas primeiro")}
              </option>
              <option value="artist">
                {t("Artist A–Z", "Artista de A a Z")}
              </option>
              <option value="title">{t("Title A–Z", "Título de A a Z")}</option>
              <option value="rank">
                {t("Chart rank", "Posição na parada")}
              </option>
            </select>
          </label>
        </div>
        <div className="lib-table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <span className="sr-only">{t("Preview", "Prévia")}</span>
                </th>
                <th>{t("TRACK / ARTIST", "FAIXA / ARTISTA")}</th>
                <th>{t("YEAR", "ANO")}</th>
                <th>{t("CHART RANK", "POSIÇÃO NA PARADA")}</th>
                <th>{t("CATALOG", "CATÁLOGO")}</th>
                <th>{t("YEAR SOURCE", "FONTE DO ANO")}</th>
                <th>{t("PREVIEW", "PRÉVIA")}</th>
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
                      aria-label={t(
                        `Play ${song.title} by ${song.artist}`,
                        `Tocar ${song.title}, de ${song.artist}`,
                      )}
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
                            ? t(
                                `Chart year ${song.chartYear}`,
                                `Ano da parada: ${song.chartYear}`,
                              )
                            : t(
                                "Chart year unavailable",
                                "Ano da parada indisponível",
                              )}
                        </span>
                      </>
                    ) : (
                      <span>{t("No rank", "Sem posição")}</span>
                    )}
                  </td>
                  <td>{catalogLabel(song.catalog)}</td>
                  <td>
                    <span
                      className={`lib-badge ${song.yearSource === "chart-year" ? "fallback" : ""}`}
                    >
                      {sourceLabel(song.yearSource)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={song.deezerId ? "lib-matched" : "lib-missing"}
                    >
                      {song.deezerId
                        ? t("● Matched", "● ID encontrado")
                        : t("○ No ID", "○ Sem ID")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="lib-empty">
            <h2>
              {t("No records in this crate.", "Nenhum registro encontrado.")}
            </h2>
            <p>
              {t(
                "Try another artist, decade, or quality filter.",
                "Experimente outro artista, década ou filtro de qualidade.",
              )}
            </p>
            <button
              onClick={() => {
                setFilters(initial);
                setPage(0);
              }}
            >
              {t("Reset filters", "Redefinir filtros")}
            </button>
          </div>
        )}
        <footer className="lib-pagination">
          <span>
            {rows.length
              ? `${number(page * 40 + 1)}–${number(Math.min(rows.length, (page + 1) * 40))}`
              : "0"}{" "}
            {t(
              `of ${recordCount(rows.length)}`,
              `de ${recordCount(rows.length)}`,
            )}
          </span>
          <div>
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              {t("← Previous", "← Anterior")}
            </button>
            <button
              disabled={(page + 1) * 40 >= rows.length}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("Next →", "Próxima →")}
            </button>
          </div>
        </footer>
      </section>
      <p className="lib-footnote">
        {t(
          "International: Billboard year-end charts. Brasil: charts, Wikipedia categories & curated history. Entries may overlap across catalogs. A Deezer match does not guarantee current preview availability.",
          "O catálogo Internacional vem das paradas anuais da Billboard. O catálogo Brasil reúne paradas musicais, categorias da Wikipedia e registros históricos selecionados. Uma faixa pode aparecer nos dois catálogos. A presença de um ID do Deezer não garante que a prévia esteja disponível.",
        )}
      </p>
      {selected && (
        <aside
          className="lib-detail"
          aria-label={t("Song details", "Detalhes da música")}
        >
          <button
            className="lib-close"
            aria-label={t("Close song details", "Fechar detalhes da música")}
            onClick={() => setSelected(null)}
          >
            ×
          </button>
          <p className="lib-eyebrow">
            {t("LINER NOTES", "FICHA DA MÚSICA")} ·{" "}
            {catalogLabel(selected.catalog).toLocaleUpperCase(locale)}
          </p>
          <div className="lib-detail-year">{selected.year}</div>
          <h2>{selected.title}</h2>
          <p>{selected.artist}</p>
          <button disabled={!selected.deezerId} onClick={() => play(selected)}>
            {t("▶ Play 30-second preview", "▶ Tocar prévia de 30 segundos")}
          </button>
          <div className="lib-detail-missing">
            <h3>{t("Missing information", "Informações ausentes")}</h3>
            {missingFields(selected, locale).length ? (
              <ul>
                {missingFields(selected, locale).map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            ) : (
              <p>
                {t(
                  "All tracked metadata fields are present.",
                  "Todos os campos de metadados monitorados estão preenchidos.",
                )}
              </p>
            )}
            <p>
              {t(
                "Optional chart fields and IDs may not apply to this source.",
                "Campos de paradas e IDs opcionais podem não se aplicar a esta fonte.",
              )}
            </p>
          </div>
          <dl>
            {[
              [
                t("Year source", "Fonte do ano"),
                sourceLabel(selected.yearSource),
              ],
              [t("Chart year", "Ano da parada"), selected.chartYear],
              [t("Chart rank", "Posição na parada"), selected.chartRank],
              [t("Dataset source", "Fonte dos dados"), selected.source],
              [t("Deezer ID", "ID do Deezer"), selected.deezerId],
              [t("MusicBrainz ID", "ID do MusicBrainz"), selected.mbid],
            ].map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value ?? t("Not available", "Indisponível")}</dd>
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
                {t("Open in Deezer ↗", "Abrir no Deezer ↗")}
              </a>
            )}
            {selected.mbid && (
              <a
                href={`https://musicbrainz.org/recording/${selected.mbid}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("MusicBrainz recording ↗", "Gravação no MusicBrainz ↗")}
              </a>
            )}
          </div>
          <details>
            <summary>{t("Raw record", "Dados brutos")}</summary>
            <pre>{JSON.stringify(selected, null, 2)}</pre>
          </details>
        </aside>
      )}
      <section
        className="lib-player"
        aria-label={t("Preview player", "Reprodutor de prévias")}
      >
        <div className="lib-mini-record" aria-hidden="true">
          ♪
        </div>
        <div className="lib-now">
          <small>
            {playing
              ? t(
                  "ON THE TURNTABLE · 30-SECOND PREVIEW",
                  "TOCANDO AGORA · PRÉVIA DE 30 SEGUNDOS",
                )
              : t("READY WHEN YOU ARE", "PRONTO PARA TOCAR")}
          </small>
          <strong>
            {playing?.title ??
              t(
                "Your next discovery is a play away.",
                "Sua próxima descoberta está a um toque.",
              )}
          </strong>
          <span>
            {playing
              ? `${playing.artist} · ${playing.year}`
              : t(
                  "Choose a track or let us surprise you.",
                  "Escolha uma faixa ou deixe a surpresa por nossa conta.",
                )}
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
              aria-label={t("Stop preview", "Parar prévia")}
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
            {t("Preview unavailable.", "Prévia indisponível.")}{" "}
            <button onClick={() => playing && play(playing)}>
              {t("Retry", "Tentar novamente")}
            </button>
            {playing?.deezerId && (
              <a
                href={`https://www.deezer.com/track/${playing.deezerId}`}
                target="_blank"
                rel="noreferrer"
              >
                {t("Open Deezer ↗", "Abrir o Deezer ↗")}
              </a>
            )}
          </p>
        )}
      </section>
    </main>
  );
}
