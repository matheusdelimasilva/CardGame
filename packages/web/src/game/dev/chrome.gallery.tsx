/**
 * The game screen's header and every overlay. Pick one in the panel at the
 * bottom right, or open it straight away with `&overlay=<name>` in the URL.
 * Final scores and the player menu use the toolbar's goal; the intro counts
 * down from 10 and then closes, as the real one does.
 */
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { GameHeader } from "../Header";
import { gameModel, ranking, statusText } from "../model";
import {
  ConnectionBanner,
  FinalScores,
  PlayerMenu,
  RoundNote,
  SoundPrompt,
} from "../Overlays";
import { useSecondsLeft } from "../useSecondsLeft";
import { scenarios, type FixtureOptions } from "./fixtures";
import type { GalleryContext, GallerySection } from "./types";

const OVERLAYS = {
  none: "No overlay",
  intro: "Intro note (counts down)",
  help: "How a round works",
  helpAll: "How a round works, with betting and chat",
  scoresWin2: "Final scores: you win, 2 players",
  scoresWin8: "Final scores: you win, 8 players",
  scoresLoss2: "Final scores: you lose, 2 players",
  scoresLoss8: "Final scores: you lose, 8 players",
  scoresTie2: "Final scores: tie, 2 players",
  scoresTie8: "Final scores: tie, 8 players",
  menuAway: "Player menu: away on their turn",
  menuPlaying: "Player menu: playing, connected",
  menuOver: "Player menu: after the game",
} as const;
type Overlay = keyof typeof OVERLAYS;
const isOverlay = (name: string | null): name is Overlay =>
  name !== null && name in OVERLAYS;

/** The model of a fixture room, which every scenario here has. */
const modelOf = (name: keyof typeof scenarios, options: FixtureOptions) =>
  gameModel(scenarios[name](options))!;

const panel: CSSProperties = {
  position: "absolute",
  right: 12,
  bottom: 12,
  zIndex: 20,
  display: "grid",
  gap: 6,
  padding: 10,
  borderRadius: 8,
  background: "#141617e6",
  color: "#fffaf0",
  font: "13px/1.3 Rubik, sans-serif",
};

function Intro({ goal, onDone }: { goal: number; onDone: () => void }) {
  const [timer] = useState(() => ({ remainingMs: 10_000 }));
  const seconds = useSecondsLeft(timer);
  useEffect(() => {
    if (seconds !== 0) return;
    const id = setTimeout(onDone, 700);
    return () => clearTimeout(id);
  }, [seconds, onDone]);
  return <RoundNote mode="intro" goal={goal} secondsLeft={seconds} />;
}

function Scores({
  scenario,
  players,
  goal,
  isHost,
  onDone,
}: {
  scenario: "overIWin" | "overOpponentWins" | "overTie";
  players: number;
  goal: FixtureOptions["goal"];
  isHost: boolean;
  onDone: () => void;
}) {
  const model = modelOf(scenario, { players, goal, timelines: "mixed" });
  const { headline, sub } = statusText(model);
  return (
    <FinalScores
      headline={headline}
      sub={sub}
      rows={ranking(model)}
      goal={model.goal}
      isHost={isHost}
      celebrate={model.winners.some((p) => p.isMe)}
      onPlayAgain={onDone}
      onBackToLobby={onDone}
    />
  );
}

function Menu({
  kind,
  options,
  onDone,
}: {
  kind: "menuAway" | "menuPlaying" | "menuOver";
  options: FixtureOptions;
  onDone: () => void;
}) {
  const model = modelOf(
    kind === "menuAway"
      ? "disconnectedOpponent"
      : kind === "menuPlaying"
        ? "opponentTurn"
        : "overOpponentWins",
    options,
  );
  const player = model.opponents[0]!;
  const log = (what: string) => () => console.info(`${what} ${player.name}`);
  return (
    <PlayerMenu
      player={player}
      running={kind !== "menuOver"}
      playing
      theirTurn={model.active?.id === player.id}
      onSkip={log("skip")}
      onRemove={log("remove")}
      onEndGame={log("end game, from the menu of")}
      onClose={onDone}
    />
  );
}

function ChromePreview({ room, options }: GalleryContext) {
  const [overlay, setOverlay] = useState<Overlay>(() => {
    const asked = new URLSearchParams(location.search).get("overlay");
    return isOverlay(asked) ? asked : "none";
  });
  const [soundOn, setSoundOn] = useState(true);
  const [isHost, setIsHost] = useState(true);
  const [offline, setOffline] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const close = () => setOverlay("none");
  const goal = options.goal;
  const scores = overlay.startsWith("scores")
    ? {
        scenario: overlay.startsWith("scoresWin")
          ? ("overIWin" as const)
          : overlay.startsWith("scoresLoss")
            ? ("overOpponentWins" as const)
            : ("overTie" as const),
        players: overlay.endsWith("8") ? 8 : 2,
      }
    : null;

  return (
    <>
      <GameHeader
        code={room.code}
        gameName={room.gameInfo.name}
        watchers={room.spectators.map((s) => s.name)}
        soundOn={soundOn}
        onLeave={() => console.info("leave")}
        onToggleSound={() => setSoundOn(!soundOn)}
        onInstructions={() => setOverlay("help")}
      />
      {offline && <ConnectionBanner />}
      {blocked && <SoundPrompt onTurnOn={() => setBlocked(false)} />}

      {overlay === "intro" && <Intro goal={goal} onDone={close} />}
      {(overlay === "help" || overlay === "helpAll") && (
        <RoundNote
          mode="help"
          goal={goal}
          betting={overlay === "helpAll"}
          chatGuessing={overlay === "helpAll"}
          onClose={close}
        />
      )}
      {scores && (
        <Scores {...scores} goal={goal} isHost={isHost} onDone={close} />
      )}
      {(overlay === "menuAway" ||
        overlay === "menuPlaying" ||
        overlay === "menuOver") && (
        <Menu kind={overlay} options={options} onDone={close} />
      )}

      <div style={panel}>
        <select
          aria-label="Overlay"
          value={overlay}
          onChange={(e) =>
            isOverlay(e.target.value) && setOverlay(e.target.value)
          }
          style={{ font: "inherit", color: "#141617" }}
        >
          {Object.entries(OVERLAYS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={isHost}
            onChange={(e) => setIsHost(e.target.checked)}
          />{" "}
          Viewer is the host
        </label>
        <label>
          <input
            type="checkbox"
            checked={offline}
            onChange={(e) => setOffline(e.target.checked)}
          />{" "}
          Connection lost
        </label>
        <label>
          <input
            type="checkbox"
            checked={blocked}
            onChange={(e) => setBlocked(e.target.checked)}
          />{" "}
          Sound blocked
        </label>
      </div>
    </>
  );
}

const section: GallerySection = {
  title: "Header and overlays",
  fullscreen: true,
  render: (context) => <ChromePreview {...context} />,
};

export default section;
