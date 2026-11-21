import type { GameInfo, HistoryEntry, SettingValues } from "@cardgame/protocol";
import { useEffect, useState, type CSSProperties } from "react";
import { api, formatApiError } from "../api";
import { navigate } from "../App";
import { useLocale } from "../i18n/locale";
import { defaultsOf, localizedGame } from "../settings";
import { KEYS, storage } from "../storage";
import { LanguagePicker } from "../ui/LanguagePicker";
import { HostSheet } from "./HostSheet";
import { inert } from "./inert";
import { JoinSheet } from "./JoinSheet";
import { Logo } from "./Logo";
import { PastGames } from "./PastGames";
import { SettingsSheet } from "./SettingsSheet";
import { useStage } from "./useStage";

type Screen = "home" | "games" | "settings";
type Door = "host" | "join" | null;

/* Game card geometry on the 1200 x 760 stage. */
const CARD_W = 226;
const CARD_GAP = 26;
const STEP = CARD_W + CARD_GAP;
const STAGE_W = 1200;
/** Where the chosen card rests (its left edge) beside the settings sheet. */
const SETTLED_LEFT = 150;
const REST_TILT = [-2, 1, -1, 2];

const SUITS: Record<string, string> = { hitster: "♪" };
const FALLBACK_SUITS = ["♠", "♦", "♥", "♣"];
const suitOf = (g: GameInfo, i: number) =>
  SUITS[g.id] ?? FALLBACK_SUITS[i % FALLBACK_SUITS.length]!;

/**
 * Home, then the host's two setup steps (choose a game, then its settings),
 * as one scene: moving between them sweeps the paper sheets away and deals
 * the game cards in, rather than swapping pages.
 */
export function HomeFlow({ path }: { path: string }) {
  const { locale, t } = useLocale();
  const { stage, scale } = useStage();

  const [email, setEmail] = useState<string | null>(
    storage.get(KEYS.session) ? storage.get(KEYS.email) : null,
  );
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [games, setGames] = useState<GameInfo[] | null>(null);
  const [gamesError, setGamesError] = useState<{ cause: unknown } | null>(null);
  const [step, setStep] = useState<"games" | "settings">("games");
  const [pick, setPick] = useState<number | null>(null);
  const [values, setValues] = useState<SettingValues>({});
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<{ cause: unknown } | null>(
    null,
  );
  const [door, setDoor] = useState<Door>(null);
  // Cards mount face down below the window, then deal in on the next frame.
  const [dealt, setDealt] = useState(false);

  const onNew = /^\/new\/?$/.test(path);
  const screen: Screen = onNew ? step : "home";
  const away = screen !== "home";
  const game = pick != null ? (games?.[pick] ?? null) : null;

  // Setup needs a host session.
  useEffect(() => {
    if (onNew && !storage.get(KEYS.session)) navigate("/");
  }, [onNew]);

  // A stored session may have expired on the server. Signed-in hosts also
  // get their past games, and the game list is fetched ahead of time so the
  // cards are ready to deal when they press New table.
  useEffect(() => {
    if (!email) return;
    let live = true;
    api.me().catch(() => {
      if (!live) return;
      storage.set(KEYS.session, null);
      setEmail(null);
    });
    api
      .history()
      .then((r) => live && setHistory(r.history))
      .catch(() => live && setHistory([]));
    api
      .games()
      .then((r) => live && setGames(r.games))
      .catch((cause: unknown) => live && setGamesError({ cause }));
    return () => {
      live = false;
    };
  }, [email]);

  useEffect(() => {
    if (!games) return;
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setDealt(true));
    });
    return () => cancelAnimationFrame(id);
  }, [games]);

  const goHome = () => {
    setDoor(null);
    navigate("/");
  };
  const newTable = () => {
    setDoor(null);
    setStep("games");
    setPick(null);
    setCreateError(null);
    navigate("/new");
  };
  const choose = (i: number) => {
    if (pick !== i) setValues(defaultsOf(games![i]!));
    setPick(i);
  };
  const toSettings = () => {
    if (game) setStep("settings");
  };
  const back = () => (screen === "settings" ? setStep("games") : goHome());
  const signedOut = () => {
    setEmail(null);
    setHistory(null);
    setGames(null);
    setDealt(false);
  };

  const create = async () => {
    if (!game) return;
    setBusy(true);
    setCreateError(null);
    try {
      navigate(`/t/${(await api.createRoom(game.id, values)).code}`);
    } catch (cause) {
      setCreateError({ cause });
      setBusy(false);
    }
  };

  const host = (
    <HostSheet
      email={email}
      onSignedIn={setEmail}
      onSignedOut={signedOut}
      onNewTable={newTable}
    />
  );
  const settings = (
    <SettingsSheet
      game={game && localizedGame(game, locale)}
      values={values}
      onChange={(id, v) => setValues((cur) => ({ ...cur, [id]: v }))}
      onCreate={create}
      busy={busy}
      error={
        createError
          ? formatApiError(
              createError.cause,
              locale,
              t("Could not create table.", "Não foi possível criar a mesa."),
            )
          : null
      }
    />
  );
  const stepDots = (
    <div
      className={`step-dots${screen === "settings" ? " two" : ""}`}
      role="img"
      aria-label={t(
        `Step ${screen === "settings" ? 2 : 1} of 2`,
        `Etapa ${screen === "settings" ? 2 : 1} de 2`,
      )}
    >
      <span />
      <span />
    </div>
  );
  const backButton = (
    <button type="button" className="pbtn cream back" onClick={back}>
      {t("← Back", "← Voltar")}
    </button>
  );
  const continueButton = (
    <button
      type="button"
      className="pbtn gold big continue"
      disabled={!game}
      onClick={toSettings}
    >
      {t("Continue", "Continuar")}
    </button>
  );
  const gamesNote = gamesError
    ? formatApiError(
        gamesError.cause,
        locale,
        t("Could not load games.", "Não foi possível carregar os jogos."),
      )
    : games === null && onNew
      ? t("Shuffling the deck…", "Embaralhando as cartas…")
      : null;
  const tagline = t(
    "Card games with friends. One link, no sign-up to join.",
    "Jogue cartas com amigos. É só abrir o link para entrar, sem cadastro.",
  );

  const props = {
    games,
    pick,
    choose,
    dealt,
    screen,
  };

  return (
    <div
      className={`flow ${stage ? "staged" : "stacked"} on-${screen}`}
      data-door={door ?? undefined}
    >
      <div className="flow-felt" aria-hidden="true" />
      {stage ? (
        <div className="stage" style={{ "--s": scale } as CSSProperties}>
          <div className="stage-logo">
            <Logo bare={away} />
            <p className="tagline">{tagline}</p>
          </div>

          <main
            className="doors"
            onMouseLeave={() => setDoor(null)}
            {...inert(away)}
          >
            <section
              className="door host"
              onMouseEnter={() => setDoor("host")}
              onFocus={() => setDoor("host")}
            >
              <HostFan />
              <div className="sheet">
                <div className="sheet-tape gold" aria-hidden="true" />
                {host}
              </div>
            </section>
            <section
              className="door join"
              onMouseEnter={() => setDoor("join")}
              onFocus={() => setDoor("join")}
            >
              <JoinChips />
              <div className="sheet">
                <div className="sheet-tape blue" aria-hidden="true" />
                <JoinSheet />
              </div>
            </section>
          </main>

          <div className="setup" {...inert(!away)}>
            <div className="setup-chrome">
              {backButton}
              {stepDots}
              <div className="picker-head" {...inert(screen !== "games")}>
                <h2 className="screen-title">
                  {t("Choose a game", "Escolha um jogo")}
                </h2>
                {gamesNote && <p className="picker-note">{gamesNote}</p>}
                {continueButton}
              </div>
            </div>
            <section
              className="settings-sheet sheet"
              aria-label={t("Game settings", "Configurações do jogo")}
              {...inert(screen !== "settings")}
            >
              {settings}
            </section>
            <StageCards {...props} />
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className={`stack-top${away ? "" : " stack-top-home"}`}>
            {away && backButton}
            {away && stepDots}
            <LanguagePicker compact className="home-language-picker" />
          </div>
          <div className="stack-logo">
            <Logo bare={away} />
            {!away && <p className="tagline">{tagline}</p>}
          </div>
          {screen === "home" && (
            <main className="stack-doors" key="home">
              <section className="door host">
                <HostFan />
                <div className="sheet">
                  <div className="sheet-tape gold" aria-hidden="true" />
                  {host}
                </div>
              </section>
              <section className="door join">
                <div className="sheet">
                  <div className="sheet-tape blue" aria-hidden="true" />
                  <JoinSheet />
                </div>
              </section>
            </main>
          )}
          {screen === "games" && (
            <main className="stack-games" key="games">
              <h2 className="screen-title">
                {t("Choose a game", "Escolha um jogo")}
              </h2>
              {gamesNote && <p className="picker-note">{gamesNote}</p>}
              <div className="stack-cards">
                {games?.map((g, i) => (
                  <GameCard
                    key={g.id}
                    game={g}
                    index={i}
                    selected={pick === i}
                    onPick={() => choose(i)}
                    style={{ "--i": i } as CSSProperties}
                  />
                ))}
              </div>
              <div className="stack-continue">{continueButton}</div>
            </main>
          )}
          {screen === "settings" && (
            <main className="stack-settings" key="settings">
              <section
                className="sheet"
                aria-label={t("Game settings", "Configurações do jogo")}
              >
                {settings}
              </section>
            </main>
          )}
        </div>
      )}
      {email && <PastGames history={history} away={away} />}
      {stage && <LanguagePicker compact className="home-language-picker" />}
      {!away && (
        <a className="home-library-link" href="/songs">
          {t(
            "♫ Explore the song library ↗",
            "♫ Explore a biblioteca de músicas ↗",
          )}
        </a>
      )}
    </div>
  );
}

/** Three checkered cards tucked behind the Host sheet; they fan out on hover. */
function HostFan() {
  return (
    <div className="host-fan" aria-hidden="true">
      <span className="fan-card f0" />
      <span className="fan-card f2" />
      <span className="fan-card f1" />
    </div>
  );
}

/** Three poker chips tucked behind the Join sheet; they spread out on hover. */
function JoinChips() {
  return (
    <div className="join-chips" aria-hidden="true">
      <span className="chip gold c0" />
      <span className="chip red c2" />
      <span className="chip blue c1" />
    </div>
  );
}

/**
 * The game cards on the stage. Each card's slot moves between three places:
 * stacked face down below the window (home), dealt in a row (choose a game),
 * and, for the chosen one, tilted beside the settings sheet (settings).
 */
function StageCards({
  games,
  pick,
  choose,
  dealt,
  screen,
}: {
  games: GameInfo[] | null;
  pick: number | null;
  choose: (i: number) => void;
  dealt: boolean;
  screen: Screen;
}) {
  if (!games) return null;
  const n = games.length;
  const mid = (n - 1) / 2;
  const rowLeft = STAGE_W / 2 - (n * CARD_W + (n - 1) * CARD_GAP) / 2;
  const at: Screen = dealt ? screen : "home";

  return (
    <div className="stage-cards" {...inert(at !== "games")}>
      {games.map((g, i) => {
        const selected = pick === i;
        const below = {
          transform: `translate(${(mid - i) * STEP}px,660px) rotate(${(i - mid) * -9}deg)`,
          transition: `transform .35s ease-in ${(n - 1 - i) * 40}ms`,
        };
        const slot =
          at === "games"
            ? {
                transform: "translate(0,0)",
                transition: `transform .55s cubic-bezier(.2,.9,.3,1.15) ${320 + i * 100}ms`,
              }
            : at === "settings" && selected
              ? {
                  transform: `translate(${SETTLED_LEFT - rowLeft - i * STEP}px,-10px) rotate(-5deg)`,
                  transition: "transform .5s cubic-bezier(.3,1.1,.4,1)",
                }
              : below;
        const faceUp = at !== "home";
        return (
          <div
            key={g.id}
            className="card-slot"
            style={{
              ...slot,
              ["--tilt" as string]: `${REST_TILT[i % REST_TILT.length]}deg`,
              ["--flip" as string]: faceUp ? "0deg" : "180deg",
              ["--flip-tr" as string]: faceUp
                ? `transform .45s cubic-bezier(.3,1.3,.5,1) ${720 + i * 100}ms`
                : "transform .25s ease-in",
            }}
          >
            <div
              className={`card-lift${selected && at === "games" ? " picked" : ""}`}
            >
              <GameCard
                game={g}
                index={i}
                selected={selected}
                onPick={() => choose(i)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GameCard({
  game,
  index,
  selected,
  onPick,
  style,
}: {
  game: GameInfo;
  index: number;
  selected: boolean;
  onPick: () => void;
  style?: CSSProperties;
}) {
  const { locale, t } = useLocale();
  const suit = suitOf(game, index);
  const count =
    game.minPlayers === game.maxPlayers
      ? String(game.minPlayers)
      : `${game.minPlayers}–${game.maxPlayers}`;
  return (
    <button
      type="button"
      className={`game-card${selected ? " selected" : ""}`}
      aria-pressed={selected}
      onClick={onPick}
      style={style}
    >
      <span className="game-flipper">
        <span className="game-back" aria-hidden="true" />
        <span className="game-face">
          <span
            className={`game-suit${suit === "♥" || suit === "♦" ? " red" : ""}`}
            aria-hidden="true"
          >
            {suit}
          </span>
          <span className="game-title">{game.name}</span>
          <span className="game-players">
            {t(`${count} players`, `${count} jogadores`)}
          </span>
          <span className="game-desc">
            {localizedGame(game, locale).description}
          </span>
        </span>
      </span>
    </button>
  );
}
