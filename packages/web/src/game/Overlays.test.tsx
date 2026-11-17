import type { ReactElement } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConnectionBanner,
  FinalScores,
  PlayerMenu,
  RoundNote,
  SoundPrompt,
} from "./Overlays";
import type { RankRow, TablePlayer } from "./types";

/** What the dialogs need of the <dialog> element; there is no DOM here. */
const dialog = { open: false, showModal: vi.fn(), focus: vi.fn() };
let renderer: ReactTestRenderer | undefined;
const render = (element: ReactElement) => {
  act(() => {
    renderer = create(element, { createNodeMock: () => dialog });
  });
  return renderer!.root;
};
const textOf = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
const button = (root: ReactTestInstance, text: string) =>
  root.findAllByType("button").find((b) => textOf(b) === text);
const steps = (root: ReactTestInstance) => root.findAllByType("li").map(textOf);

beforeEach(() => {
  vi.stubGlobal("document", { activeElement: null, body: {} });
  dialog.open = false;
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const player = (overrides: Partial<TablePlayer> = {}): TablePlayer => ({
  id: "p1",
  name: "Mika",
  seat: 5,
  animal: "🐷",
  chip: "#ef4a3c",
  chipEdge: "#b8362b",
  connected: true,
  isHost: false,
  isMe: false,
  ...overrides,
});

describe("round note", () => {
  it("opens as a modal and cannot be dismissed during the intro", () => {
    const root = render(<RoundNote mode="intro" goal={10} secondsLeft={7} />);
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(textOf(root.findByType("h2"))).toBe("Get ready");
    expect(button(root, "×")).toBeUndefined();
    expect(textOf(root.findByProps({ role: "timer" }))).toBe("STARTS IN7");

    const note = root.findByType("dialog");
    const cancel = { preventDefault: vi.fn() };
    act(() => note.props.onCancel(cancel));
    expect(cancel.preventDefault).toHaveBeenCalled();
    // A close the browser forces anyway puts the note straight back.
    act(() => note.props.onClose());
    expect(dialog.showModal).toHaveBeenCalledTimes(2);
  });

  it("closes the help note from its button, Escape and the backdrop", () => {
    const onClose = vi.fn();
    const root = render(<RoundNote mode="help" goal={8} onClose={onClose} />);
    expect(textOf(root.findByType("h2"))).toBe("How a round works");
    expect(root.findAllByProps({ role: "timer" })).toHaveLength(0);
    act(() => button(root, "×")!.props.onClick());
    const note = root.findByType("dialog");
    act(() => note.props.onClose());
    act(() => note.props.onClick({ target: note, currentTarget: note }));
    act(() => note.props.onClick({ target: {}, currentTarget: note }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("shows the betting and chat steps only when those rules are on", () => {
    const root = render(<RoundNote mode="intro" goal={5} secondsLeft={3} />);
    expect(steps(root)).toEqual([
      "Listen to the mystery song.",
      "Drag its card into your timeline where the year fits.",
      "Right spot, you keep it. First to 5 wins.",
    ]);
    act(() =>
      renderer!.update(
        <RoundNote mode="intro" goal={5} secondsLeft={3} chatGuessing />,
      ),
    );
    expect(steps(root)).toHaveLength(4);
    expect(steps(root)[3]).toMatch(/^Guess in the chat\./);
    act(() =>
      renderer!.update(
        <RoundNote
          mode="intro"
          goal={5}
          secondsLeft={3}
          betting
          chatGuessing
        />,
      ),
    );
    expect(steps(root)[3]).toMatch(/^Bet a token/);
    expect(steps(root)[4]).toMatch(/^Guess in the chat\./);
  });
});

describe("final scores", () => {
  const me = player({
    id: "me",
    name: "matt",
    animal: "🐸",
    isMe: true,
    isHost: true,
  });
  const rows: RankRow[] = [
    { rank: "1ST", player: me, count: 10, winner: true, isMe: true },
    { rank: "2ND", player: player(), count: 7, winner: false, isMe: false },
  ];
  const props = {
    headline: "You win!",
    sub: "10 songs in the right order.",
    rows,
    goal: 10,
    onPlayAgain: vi.fn(),
    onBackToLobby: vi.fn(),
  };

  it("lists everyone with their rank, pips and score, the viewer marked", () => {
    const root = render(<FinalScores {...props} isHost />);
    const items = root.findAllByType("li");
    expect(items.map((li) => li.props.className)).toEqual([
      "gs-score-row gs-score-me",
      "gs-score-row",
    ]);
    expect(textOf(items[0]!)).toBe("1ST🐸matt (you)10/10");
    expect(textOf(items[1]!)).toBe("2ND🐷Mika7/10");
    const pips = items[1]!.findByProps({ className: "gs-score-pips" });
    expect(pips.children).toHaveLength(10);
    expect(pips.findAllByProps({ className: "gs-pip-on" }).length).toBe(7);
  });

  it("lets the host play again", () => {
    const root = render(<FinalScores {...props} isHost />);
    const again = button(root, "Play again")!;
    expect(again.props.disabled).toBe(false);
    act(() => again.props.onClick());
    expect(props.onPlayAgain).toHaveBeenCalledTimes(1);
    expect(root.findAllByProps({ className: "gs-scores-hint" })).toHaveLength(
      0,
    );
  });

  it("tells everyone else that the host starts the next game", () => {
    const root = render(<FinalScores {...props} isHost={false} />);
    const again = button(root, "Play again")!;
    expect(again.props.disabled).toBe(true);
    const hint = root.findByProps({ className: "gs-scores-hint" });
    expect(again.props["aria-describedby"]).toBe(hint.props.id);
    expect(textOf(hint)).toBe("The host starts the next game.");
    act(() => button(root, "Back to lobby")!.props.onClick());
    expect(props.onBackToLobby).toHaveBeenCalledTimes(1);
  });

  it("throws confetti only when celebrating, and cannot be dismissed", () => {
    const root = render(<FinalScores {...props} isHost />);
    expect(root.findAllByProps({ className: "gs-confetti" })).toHaveLength(0);
    const cancel = { preventDefault: vi.fn() };
    act(() => root.findByType("dialog").props.onCancel(cancel));
    expect(cancel.preventDefault).toHaveBeenCalled();
    act(() => renderer!.update(<FinalScores {...props} isHost celebrate />));
    expect(
      root.findByProps({ className: "gs-confetti" }).findAllByType("i"),
    ).toHaveLength(36);
  });
});

describe("player menu", () => {
  const actions = {
    onSkip: vi.fn(),
    onRemove: vi.fn(),
    onEndGame: vi.fn(),
    onClose: vi.fn(),
  };
  const labels = (root: ReactTestInstance) =>
    root
      .findAllByType("button")
      .map(textOf)
      .filter((t) => t !== "×");

  it("offers to play the turn of a player who is away on it", () => {
    const root = render(
      <PlayerMenu
        player={player({ connected: false })}
        running
        playing
        theirTurn
        {...actions}
      />,
    );
    expect(textOf(root.findByType("h2"))).toBe("Mika");
    expect(labels(root)).toEqual([
      "Play their turn for them",
      "Remove and end this game",
      "End the game for everyone",
    ]);
    act(() => button(root, "Play their turn for them")!.props.onClick());
    expect(actions.onSkip).toHaveBeenCalledTimes(1);
    expect(actions.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not skip a connected player or one whose turn it is not", () => {
    const root = render(
      <PlayerMenu player={player()} running playing theirTurn {...actions} />,
    );
    expect(button(root, "Play their turn for them")).toBeUndefined();
    act(() =>
      renderer!.update(
        <PlayerMenu
          player={player({ connected: false })}
          running
          playing
          theirTurn={false}
          {...actions}
        />,
      ),
    );
    expect(button(root, "Play their turn for them")).toBeUndefined();
    act(() => button(root, "End the game for everyone")!.props.onClick());
    expect(actions.onEndGame).toHaveBeenCalledTimes(1);
  });

  it("only removes from the table when no game is running", () => {
    const root = render(
      <PlayerMenu
        player={player()}
        running={false}
        playing
        theirTurn={false}
        {...actions}
      />,
    );
    expect(labels(root)).toEqual(["Remove from table"]);
    act(() => button(root, "Remove from table")!.props.onClick());
    expect(actions.onRemove).toHaveBeenCalledTimes(1);
    expect(actions.onClose).toHaveBeenCalledTimes(1);
  });

  it("never offers to remove the viewer", () => {
    const root = render(
      <PlayerMenu
        player={player({ isMe: true })}
        running
        playing
        theirTurn={false}
        {...actions}
      />,
    );
    expect(labels(root)).toEqual(["End the game for everyone"]);
  });
});

describe("banners", () => {
  it("announces a lost connection", () => {
    const root = render(<ConnectionBanner />);
    const banner = root.findByProps({ role: "status" });
    expect(textOf(banner)).toBe("Connection lost. Reconnecting…");
  });

  it("turns sound on from the prompt", () => {
    const onTurnOn = vi.fn();
    const root = render(<SoundPrompt onTurnOn={onTurnOn} />);
    act(() => button(root, "Tap anywhere to turn on sound")!.props.onClick());
    expect(onTurnOn).toHaveBeenCalledTimes(1);
  });
});
