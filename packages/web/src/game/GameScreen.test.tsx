import type { RoomView } from "@cardgame/protocol";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackAudio } from "../audio";
import { SCENARIO_NAMES, scenarios } from "./dev/fixtures";
import { GameScreen } from "./GameScreen";

/** What the dialogs need of the <dialog> element; there is no DOM here. */
const dialog = { open: false, showModal: vi.fn(), focus: vi.fn() };
const audio: TrackAudio = {
  status: "playing",
  muted: false,
  toggle: vi.fn(),
  setMuted: vi.fn(),
};
const send = vi.fn();
let renderer: ReactTestRenderer | undefined;

const element = (room: RoomView, error: string | null = null) => (
  <GameScreen
    room={room}
    connection="open"
    error={error}
    chats={[]}
    send={send}
    audio={audio}
    onLeave={vi.fn()}
    onBackToLobby={vi.fn()}
  />
);
/** The screen's own box: a phone held upright, or none at all (landscape). */
let screenBox: { width: number; height: number } | null = null;
const render = (room: RoomView) => {
  act(() => {
    renderer = create(element(room), {
      createNodeMock: (node) => {
        if (node.type === "dialog") return dialog;
        const box = screenBox;
        if (box && String(node.props.className).startsWith("game-screen"))
          return { getBoundingClientRect: () => box };
        return null;
      },
    });
  });
  return renderer!.root;
};
const textOf = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const buttons = (root: ReactTestInstance, text: string) =>
  root.findAllByType("button").filter((b) => textOf(b) === text);
const status = (root: ReactTestInstance) =>
  textOf(
    root.find(
      (n) =>
        typeof n.type === "string" &&
        String(n.props.className).split(" ").includes("gs-status"),
    ),
  );
const mystery = (root: ReactTestInstance) =>
  root.find(
    (n) =>
      typeof n.type === "string" &&
      String(n.props.className).includes("gs-stage-mystery"),
  );
const key = (root: ReactTestInstance, k: string) =>
  act(() => mystery(root).props.onKeyDown({ key: k, preventDefault() {} }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", { activeElement: null, body: {} });
  dialog.open = false;
  screenBox = null;
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A headline each scenario must show (the over scenarios also have final scores). */
const HEADLINES: Record<(typeof SCENARIO_NAMES)[number], RegExp> = {
  intro: /Shuffling…/,
  myTurn: /Your turn/,
  opponentTurn: /'s turn/,
  myRevealCorrect: /Nailed it!/,
  myRevealWrong: /Not quite/,
  opponentRevealCorrect: /placed it/,
  opponentRevealWrong: /placed it/,
  opponentRevealPassed: /was skipped/,
  overIWin: /You win!/,
  overOpponentWins: /wins/,
  overTie: /It's a tie!/,
  spectator: /'s turn/,
  benched: /'s turn/,
  disconnectedOpponent: /away/,
};

describe("game screen", () => {
  it.each(SCENARIO_NAMES)("draws the %s scenario", (name) => {
    const room = scenarios[name]({ players: 5, goal: 8 });
    const root = render(room);
    expect(status(root)).toMatch(HEADLINES[name]);
    expect(textOf(root)).toContain("FIRST TO 8");
    expect(root.findAllByProps({ "aria-label": "Table chat" })).toHaveLength(1);
    const hand = root.findAllByProps({
      "aria-label": "Your timeline, oldest first",
    });
    expect(hand).toHaveLength(
      name === "spectator" || name === "benched" ? 0 : 1,
    );
    if (name === "intro") expect(textOf(root)).toContain("Get ready");
    if (name.startsWith("over")) expect(textOf(root)).toContain("FINAL SCORES");
  });

  it("tells viewers who are not playing what they are doing", () => {
    expect(textOf(render(scenarios.benched()))).toContain(
      "You join the next game.",
    );
    expect(buttons(renderer!.root, "Stand up")).toHaveLength(1);
    act(() => renderer!.unmount());
    expect(textOf(render(scenarios.spectator()))).toContain("Watching.");
  });

  it("sends a placement once, and lets the player try again after a refusal", () => {
    const room = scenarios.myTurn();
    const root = render(room);
    expect(buttons(root, "Lock it in")).toHaveLength(0);
    key(root, "ArrowRight");
    expect(status(root)).toMatch(/^Before \d{4}\?/);
    const lockButton = () => buttons(root, "Lock it in")[0]!;
    act(() => {
      lockButton().props.onClick();
      lockButton().props.onClick();
    });
    key(root, "Enter");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: "move",
      move: { type: "place", index: 0 },
    });
    expect(lockButton().props.disabled).toBe(true);
    act(() => renderer!.update(element(room, "It is not your turn.")));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(lockButton().props.disabled).toBe(false);
    act(() => lockButton().props.onClick());
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("pauses or resumes the song from the card, and sends it home with Escape", () => {
    const root = render(scenarios.myTurn());
    key(root, " ");
    expect(audio.toggle).toHaveBeenCalledTimes(1);
    key(root, "ArrowLeft");
    expect(buttons(root, "Lock it in")).toHaveLength(1);
    key(root, "Escape");
    expect(buttons(root, "Lock it in")).toHaveLength(0);
  });

  it("opens the host's menu from an opponent's seat card", () => {
    const root = render(scenarios.disconnectedOpponent());
    const seat = root.findAll(
      (n) =>
        n.type === "button" && String(n.props.className).includes("gs-seat"),
    )[0]!;
    act(() => seat.props.onClick());
    act(() => buttons(root, "Play their turn for them")[0]!.props.onClick());
    expect(send).toHaveBeenCalledWith({
      type: "skip",
      playerId: expect.any(String),
    });
  });

  it("only offers to remove, not end the game, for a seated person who is not in it", () => {
    const room = scenarios.disconnectedOpponent();
    room.seats = room.seats.map((s) =>
      s && !s.isHost && s.id !== room.you.id ? { ...s, inGame: false } : s,
    );
    const root = render(room);
    const seat = root.findAll(
      (n) =>
        n.type === "button" && String(n.props.className).includes("gs-seat"),
    )[0]!;
    act(() => seat.props.onClick());
    expect(buttons(root, "Remove from table")).toHaveLength(1);
    expect(buttons(root, "Remove and end this game")).toHaveLength(0);
  });

  it("lists only connected spectators as watching", () => {
    const room = scenarios.spectator();
    room.spectators = [
      { id: "s1", name: "Here", connected: true },
      { id: "s2", name: "Gone", connected: false },
    ];
    const text = textOf(render(room));
    expect(text).toContain("Here");
    expect(text).not.toContain("Gone");
  });

  it("starts the next game from the final scores", () => {
    const root = render(scenarios.overIWin());
    act(() => buttons(root, "Play again")[0]!.props.onClick());
    expect(send).toHaveBeenCalledWith({ type: "start" });
  });
});

describe("game screen held upright", () => {
  beforeEach(() => {
    screenBox = { width: 375, height: 812 };
  });
  const chatButton = (root: ReactTestInstance) =>
    root.find(
      (n) =>
        n.type === "button" &&
        String(n.props.className).includes("gs-chat-toggle"),
    );
  const chatSpot = (root: ReactTestInstance) =>
    root.find(
      (n) =>
        typeof n.type === "string" &&
        String(n.props.className).includes("gs-chat-spot"),
    );

  it("takes the portrait stage, with the sound switch beside the chat button", () => {
    const root = render(scenarios.opponentTurn());
    expect(
      root.findByProps({ className: "game-screen is-portrait" }),
    ).toBeTruthy();
    const sound = root.findByProps({ "aria-label": "Sound" });
    // In the stage's tools corner, not the header.
    expect(
      root
        .findByProps({ className: "tl-header-actions" })
        .findAllByProps({ "aria-label": "Sound" }),
    ).toHaveLength(0);
    act(() => sound.props.onClick());
    expect(audio.setMuted).toHaveBeenCalledWith(true);
    expect(chatButton(root).props["aria-expanded"]).toBe(false);
  });

  it("opens the chat from its button, marks messages that arrive while it is closed, and closes it for the viewer's turn", () => {
    const root = render(scenarios.opponentTurn());
    expect(chatSpot(root).props.className).toContain("is-closed");
    act(() => chatButton(root).props.onClick());
    expect(chatSpot(root).props.className).not.toContain("is-closed");
    act(() => chatButton(root).props.onClick());
    const chats = [
      { id: "1", from: { id: "p1", name: "Mika" }, text: "Queen?", at: 0 },
    ];
    act(() =>
      renderer!.update(
        <GameScreen
          {...element(scenarios.opponentTurn()).props}
          chats={chats}
        />,
      ),
    );
    expect(chatButton(root).props["aria-label"]).toBe("Chat, new messages");
    act(() => chatButton(root).props.onClick());
    expect(chatButton(root).props["aria-label"]).toBe("Chat");
    act(() =>
      renderer!.update(
        <GameScreen {...element(scenarios.myTurn()).props} chats={chats} />,
      ),
    );
    expect(chatSpot(root).props.className).toContain("is-closed");
  });
});
