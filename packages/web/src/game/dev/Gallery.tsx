/**
 * Development-only page at /dev/game: previews of the game screen's parts
 * in any fixture scenario. Sections are the `*.gallery.tsx` files next to
 * this one (see GallerySection in ./types).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import "../game.css";
import {
  SCENARIO_NAMES,
  isScenarioName,
  scenarios,
  type Goal,
  type TimelineLength,
} from "./fixtures";
import type { GalleryContext, GallerySection } from "./types";

const modules = import.meta.glob<{ default: GallerySection }>(
  "./*.gallery.tsx",
  { eager: true },
);
const SECTIONS = Object.entries(modules)
  .map(([path, module]) => ({
    name: path.replace(/^\.\//, "").replace(/\.gallery\.tsx$/, ""),
    section: module.default,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const GOALS: Goal[] = [5, 8, 10];
const LENGTHS: TimelineLength[] = ["short", "long", "mixed"];

/** Scenario and options from the query string, with defaults for anything missing or wrong. */
function readOptions(params: URLSearchParams): Omit<GalleryContext, "room"> {
  const scenario = params.get("scenario") ?? "";
  const players = Number(params.get("players"));
  const goal = Number(params.get("goal"));
  const timelines = params.get("timelines") ?? "";
  return {
    scenario: isScenarioName(scenario) ? scenario : "myTurn",
    options: {
      players: players >= 2 && players <= 8 ? Math.round(players) : 4,
      goal: (GOALS as number[]).includes(goal) ? (goal as Goal) : 10,
      timelines: (LENGTHS as string[]).includes(timelines)
        ? (timelines as TimelineLength)
        : "mixed",
      showSongInfo: params.get("songInfo") === "1",
    },
  };
}

function toQuery(picked: Omit<GalleryContext, "room">, only?: string): string {
  const params = new URLSearchParams({
    ...(only ? { only } : {}),
    scenario: picked.scenario,
    players: String(picked.options.players),
    goal: String(picked.options.goal),
    timelines: picked.options.timelines,
    ...(picked.options.showSongInfo ? { songInfo: "1" } : {}),
  });
  return `?${params}`;
}

/** Lets a section's preview size itself to its frame rather than the window. */
const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 10",
  containerType: "size",
  border: "2px solid #26292b",
  borderRadius: 8,
  overflow: "hidden",
};
const framedScreen = {
  height: "100%",
  minHeight: 0,
  "--u": "min(1cqw, 1.6cqh)",
} as CSSProperties;
/** The page text is cream; form controls keep dark text on their light fill. */
const field: CSSProperties = { color: "#141617", font: "inherit" };
const centred: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
};

function Preview({
  section,
  context,
  style,
}: {
  section: GallerySection;
  context: GalleryContext;
  style?: CSSProperties;
}) {
  const body: ReactNode = section.render(context);
  return (
    <div className="game-screen" style={style}>
      {section.fullscreen ? body : <div style={centred}>{body}</div>}
    </div>
  );
}

export default function Gallery() {
  const [picked, setPicked] = useState(() =>
    readOptions(new URLSearchParams(location.search)),
  );
  const only = new URLSearchParams(location.search).get("only");
  const code = new URLSearchParams(location.search).get("code");
  const context: GalleryContext = useMemo(
    () => ({
      ...picked,
      room: {
        ...scenarios[picked.scenario](picked.options),
        ...(code ? { code } : {}),
      },
    }),
    [picked, code],
  );

  if (only !== null) {
    const found = SECTIONS.find((s) => s.name === only);
    if (!found)
      return (
        <p style={{ padding: 24 }}>
          No gallery section named “{only}”.{" "}
          <a href="/dev/game">All sections</a>
        </p>
      );
    return <Preview section={found.section} context={context} />;
  }

  const update = (next: Omit<GalleryContext, "room">) => {
    setPicked(next);
    history.replaceState(null, "", toQuery(next));
  };
  const setOption = <K extends keyof GalleryContext["options"]>(
    key: K,
    value: GalleryContext["options"][K],
  ) => update({ ...picked, options: { ...picked.options, [key]: value } });

  return (
    <main
      style={{
        height: "100%",
        overflow: "auto",
        padding: "16px 24px 48px",
        fontFamily: "Rubik, sans-serif",
        color: "#fffaf0",
      }}
    >
      <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>Game screen gallery</h1>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          marginBottom: 24,
          fontSize: 14,
        }}
      >
        <label>
          Scenario{" "}
          <select
            style={field}
            value={picked.scenario}
            onChange={(e) =>
              isScenarioName(e.target.value) &&
              update({ ...picked, scenario: e.target.value })
            }
          >
            {SCENARIO_NAMES.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Players{" "}
          <select
            style={field}
            value={picked.options.players}
            onChange={(e) => setOption("players", Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Cards to win{" "}
          <select
            style={field}
            value={picked.options.goal}
            onChange={(e) => setOption("goal", Number(e.target.value) as Goal)}
          >
            {GOALS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Timelines{" "}
          <select
            style={field}
            value={picked.options.timelines}
            onChange={(e) =>
              setOption("timelines", e.target.value as TimelineLength)
            }
          >
            {LENGTHS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={picked.options.showSongInfo}
            onChange={(e) => setOption("showSongInfo", e.target.checked)}
          />{" "}
          Show song info
        </label>
      </div>
      {SECTIONS.length === 0 && <p>No *.gallery.tsx files yet.</p>}
      {SECTIONS.map(({ name, section }) => (
        <section key={name} style={{ maxWidth: 1100, marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>
            {section.title}{" "}
            <a
              href={`/dev/game${toQuery(picked, name)}`}
              style={{ fontSize: 14, color: "#ffd84a" }}
            >
              open alone
            </a>
          </h2>
          <div style={frameStyle}>
            <Preview section={section} context={context} style={framedScreen} />
          </div>
        </section>
      ))}
    </main>
  );
}
