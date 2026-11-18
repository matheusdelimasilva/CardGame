import type { RoomView } from "@cardgame/protocol";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackAudio } from "../audio";
import { LocaleProvider } from "../i18n/locale";
import type { ChatEntry } from "../useRoom";
import { GUESS_HINT } from "./ChatPanel";
import { SCENARIO_NAMES, scenarios } from "./dev/fixtures";
import { GameScreen, LOCK_RETRY_MS } from "./GameScreen";

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

const element = (
  room: RoomView,
  error: string | null = null,
  chats: readonly ChatEntry[] = [],
) => (
  <GameScreen
    room={room}
    connection="open"
    error={error}
    chats={chats}
    send={send}
    audio={audio}
    onLeave={vi.fn()}
    onBackToLobby={vi.fn()}
  />
);
/** The screen's own box: a phone held upright, or none at all (landscape). */
let screenBox: { width: number; height: number } | null = null;
const render = (
  room: RoomView,
  chats: readonly ChatEntry[] = [],
  withLocale = false,
) => {
  const game = element(room, null, chats);
  act(() => {
    renderer = create(
      withLocale ? <LocaleProvider>{game}</LocaleProvider> : game,
      {
        createNodeMock: (node) => {
          if (node.type === "dialog") return dialog;
          const box = screenBox;
          if (box && String(node.props.className).startsWith("game-screen"))
            return { getBoundingClientRect: () => box };
          return null;
        },
      },
    );
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
  myTurnLocked: /Locked in/,
  opponentBetPlaced: /Bet placed\./,
  opponentLocked: /has placed/,
  opponentLockedBetPlaced: /has placed/,
  opponentPassedBet: /You passed\./,
  opponentNoTokens: /No tokens left to bet\./,
  myRevealBets: /Locked in/,
  myRevealStolen: /Locked in/,
  opponentRevealRefund: /placed it/,
  opponentRevealIStole: /placed it/,
  opponentRevealOtherStole: /placed it/,
  opponentRevealThiefWins: /placed it/,
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
    if (name === "intro") {
      expect(textOf(root)).toContain("Get ready");
      // Step 4 of the rules: betting.
      expect(textOf(root)).toContain("Bet a token");
    }
    if (name.startsWith("over")) expect(textOf(root)).toContain("FINAL SCORES");
  });

  it("switches an in-progress game and its chat history to Brazilian Portuguese", () => {
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    vi.stubGlobal("document", {
      activeElement: null,
      body: {},
      documentElement: {},
    });
    screenBox = { width: 320, height: 700 };
    const root = render(
      scenarios.myTurn(),
      [
        {
          id: "1",
          kind: "system",
          from: { id: "", name: "" },
          text: "Mika guessed the song correctly.",
          textPtBR: "Mika acertou a música.",
          at: 1,
        },
        {
          id: "2",
          from: { id: "p1", name: "Mika" },
          text: "What a tune!",
          at: 2,
        },
      ],
      true,
    );

    expect(status(root)).toMatch(/^Your turn/);
    key(root, "ArrowRight");
    expect(status(root)).toMatch(/^Before \d{4}\?/);

    const picker = root
      .findByProps({ className: "gs-tools" })
      .findByType("select");
    expect(picker.props["aria-label"]).toBe("Language");
    act(() => picker.props.onChange({ target: { value: "pt-BR" } }));

    expect(status(root)).toMatch(/^Antes de \d{4}\?/);
    expect(buttons(root, "Confirmar posição")).toHaveLength(1);
    expect(textOf(root)).toContain("META: ");
    expect(textOf(root)).toContain("Mika acertou a música.");
    expect(textOf(root)).toContain("Mika: What a tune!");
    expect(root.findByType("select").props["aria-label"]).toBe("Idioma");
    expect(mystery(root).props["aria-label"]).toContain(
      "Carta da música misteriosa",
    );
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

  it("stops waiting for an answer once the server has the card locked in", () => {
    const root = render(scenarios.myTurn());
    key(root, "ArrowRight");
    act(() => buttons(root, "Lock it in")[0]!.props.onClick());
    act(() => renderer!.update(element(scenarios.myTurnLocked())));
    expect(buttons(root, "Lock it in")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(LOCK_RETRY_MS * 2);
    });
    expect(status(root)).toMatch(/^Locked in/);
    expect(mystery(root).props["aria-keyshortcuts"]).toBe("Enter Space");
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

describe("betting", () => {
  const gaps = (root: ReactTestInstance) =>
    root.findAll(
      (n) =>
        n.type === "button" &&
        String(n.props["aria-label"]).startsWith("Bet: "),
    );
  const confirm = (root: ReactTestInstance) => buttons(root, "Confirm bet")[0]!;
  const pass = (root: ReactTestInstance) => buttons(root, "Pass")[0]!;

  it("bets on a picked gap once, and lets the player try again after a refusal", () => {
    const room = scenarios.opponentTurn();
    const root = render(room);
    expect(gaps(root).length).toBeGreaterThan(1);
    expect(confirm(root).props.disabled).toBe(true);
    act(() => gaps(root)[1]!.props.onClick());
    expect(gaps(root)[1]!.props["aria-pressed"]).toBe(true);
    expect(textOf(root)).toMatch(/Bet 1 token: Between \d{4} and \d{4}/);
    act(() => {
      confirm(root).props.onClick();
      confirm(root).props.onClick();
    });
    act(() => pass(root).props.onClick());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: "move",
      move: { type: "bet", index: 1 },
    });
    expect(confirm(root).props.disabled).toBe(true);
    act(() =>
      renderer!.update(
        element(room, "That is not a gap in the current player's timeline."),
      ),
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(confirm(root).props.disabled).toBe(false);
    act(() => confirm(root).props.onClick());
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("passes once", () => {
    const root = render(scenarios.opponentLocked());
    act(() => {
      pass(root).props.onClick();
      pass(root).props.onClick();
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: "move",
      move: { type: "declineBet" },
    });
  });

  it("drops the bar once the server has the bet, keeping the gap marked", () => {
    const root = render(scenarios.opponentBetPlaced());
    expect(buttons(root, "Confirm bet")).toHaveLength(0);
    expect(gaps(root)).toHaveLength(0);
    expect(
      root.findAll((n) =>
        String(n.props["aria-label"]).startsWith("Your bet: "),
      ),
    ).toHaveLength(1);
  });

  it.each([
    "opponentNoTokens",
    "opponentPassedBet",
    "myTurn",
    "myTurnLocked",
    "spectator",
    "benched",
  ] as const)("offers no bet in %s", (name) => {
    const root = render(scenarios[name]());
    expect(buttons(root, "Confirm bet")).toHaveLength(0);
    expect(gaps(root)).toHaveLength(0);
  });

  it("shows my chips with their note, and a token per bet with its own", () => {
    const root = render(scenarios.opponentBetPlaced({ players: 3 }));
    expect(
      root.findAllByProps({
        "aria-label": "You have 1 chip. Use it to bet against their guesses.",
      }),
    ).toHaveLength(1);
    const tokens = root.findAll(
      (n) =>
        typeof n.type === "string" &&
        String(n.props.className).includes("gs-bet-token"),
    );
    expect(tokens.map((t) => t.props["aria-label"])).toEqual([
      "You placed a bet.",
      "Jonathan Silva placed a bet.",
    ]);
    expect(tokens.every((t) => t.props.tabIndex === 0)).toBe(true);
    expect(textOf(root)).toContain("BET");
  });
});

describe("guessing in the chat", () => {
  const said = (id: string, text: string): ChatEntry => ({
    id,
    from: { id: "p1", name: "Mika" },
    text,
    at: 0,
  });
  const notice: ChatEntry = {
    id: "notice:1",
    kind: "notice",
    text: "Close, but not quite. Your message wasn't sent.",
    at: 0,
  };
  const badgeLabels = (root: ReactTestInstance) =>
    root
      .findAll(
        (n) =>
          typeof n.type === "string" &&
          String(n.props.className).includes("gs-chat-badge"),
      )
      .map((b) => b.props["aria-label"] as string);
  const placeholder = (root: ReactTestInstance) =>
    root.findByProps({ "aria-label": "Chat message" }).props.placeholder;
  const log = (root: ReactTestInstance) =>
    root
      .findAll(
        (n) =>
          typeof n.type === "string" &&
          String(n.props.className).startsWith("gs-chat-line"),
      )
      .map(textOf);
  const update = (room: RoomView, chats: readonly ChatEntry[]) =>
    act(() => renderer!.update(element(room, null, chats)));

  it("shows the viewer's badges and asks for guesses while a song is placed", () => {
    const root = render(scenarios.opponentTurn({ guessed: "song" }));
    expect(badgeLabels(root)).toEqual([
      "Song guessed",
      "Artist not guessed yet",
    ]);
    expect(placeholder(root)).toBe("Guess or chat…");
  });

  it("keeps the badges through a reveal but takes plain chat, and drops them for the final scores", () => {
    const root = render(scenarios.opponentRevealCorrect({ guessed: "both" }));
    expect(badgeLabels(root)).toEqual(["Song guessed", "Artist guessed"]);
    expect(placeholder(root)).toBe("Say something…");
    update(scenarios.overOpponentWins(), []);
    expect(badgeLabels(root)).toEqual([]);
  });

  it("has no badges, hint or step 5 when the table does not guess", () => {
    for (const room of [
      scenarios.myTurn({ guessInChat: false }),
      scenarios.myTurn({ showSongInfo: true }),
    ]) {
      const root = render(room);
      expect(badgeLabels(root)).toEqual([]);
      expect(placeholder(root)).toBe("Say something…");
      expect(textOf(root)).not.toContain(GUESS_HINT);
      act(() => buttons(root, "Instructions")[0]!.props.onClick());
      expect(textOf(root)).toContain("Bet a token");
      expect(textOf(root)).not.toContain("Guess in the chat.");
      act(() => renderer?.unmount());
    }
  });

  it("gives spectators neither badges nor the hint", () => {
    const root = render(scenarios.spectator());
    expect(badgeLabels(root)).toEqual([]);
    expect(placeholder(root)).toBe("Say something…");
    expect(textOf(root)).not.toContain(GUESS_HINT);
  });

  it("adds step 5 to the intro and the help note", () => {
    expect(textOf(render(scenarios.intro()))).toContain("Guess in the chat.");
    act(() => renderer?.unmount());
    const root = render(scenarios.myTurn());
    expect(textOf(root)).not.toContain("Guess in the chat.");
    act(() => buttons(root, "Instructions")[0]!.props.onClick());
    expect(textOf(root)).toContain("Guess in the chat.");
  });

  it("starts the game's log with the hint once, and again for a new game where it begins", () => {
    const before = [said("1", "gl all")];
    const root = render(scenarios.intro(), before);
    expect(log(root)).toEqual(["Mika: gl all", GUESS_HINT]);
    const later = [...before, said("2", "is this Queen??"), notice];
    update(scenarios.opponentTurn(), later);
    update(scenarios.myTurn(), later);
    expect(log(root)).toEqual([
      "Mika: gl all",
      GUESS_HINT,
      "Mika: is this Queen??",
      notice.text,
    ]);
    // Play again: the next game's hint follows the lines of the last one.
    update(scenarios.overIWin(), later);
    update(scenarios.intro(), later);
    expect(log(root)).toEqual([
      "Mika: gl all",
      "Mika: is this Queen??",
      notice.text,
      GUESS_HINT,
    ]);
  });

  it("never shows a sent line itself: only the server's lines appear", () => {
    const root = render(scenarios.opponentTurn());
    const input = root.findByProps({ "aria-label": "Chat message" });
    act(() => input.props.onChange({ target: { value: "Bohemian Rhapsody" } }));
    act(() => root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(send).toHaveBeenCalledWith({
      type: "chat",
      text: "Bohemian Rhapsody",
    });
    expect(textOf(root)).not.toContain("Bohemian Rhapsody");
    expect(input.props.value).toBe("");
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

  it("puts the bet's buttons in the status", () => {
    const root = render(scenarios.opponentTurn());
    const statusBox = root.find(
      (n) =>
        typeof n.type === "string" &&
        String(n.props.className).split(" ").includes("gs-status"),
    );
    expect(statusBox.findAll((n) => n.type === "button").map(textOf)).toEqual([
      "Confirm bet",
      "Pass",
    ]);
    expect(textOf(statusBox)).toContain("Tap a gap in Mika's timeline to bet.");
  });

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

  it("marks a private note or a table line that arrives while the chat is closed, also once the history is full", () => {
    const full: ChatEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      from: { id: "p1", name: "Mika" },
      text: `line ${i}`,
      at: 0,
    }));
    const root = render(scenarios.opponentTurn(), full);
    expect(chatButton(root).props["aria-label"]).toBe("Chat");
    const withNotice: ChatEntry[] = [
      ...full.slice(1),
      { id: "notice:1", kind: "notice", text: "Close, but not quite.", at: 0 },
    ];
    act(() =>
      renderer!.update(element(scenarios.opponentTurn(), null, withNotice)),
    );
    expect(chatButton(root).props["aria-label"]).toBe("Chat, new messages");
    act(() => chatButton(root).props.onClick());
    act(() => chatButton(root).props.onClick());
    expect(chatButton(root).props["aria-label"]).toBe("Chat");
    const credit: ChatEntry = {
      id: "51",
      kind: "system",
      from: { id: "", name: "" },
      text: "Mika guessed the song correctly.",
      at: 0,
    };
    act(() =>
      renderer!.update(
        element(scenarios.opponentTurn(), null, [
          ...withNotice.slice(1),
          credit,
        ]),
      ),
    );
    expect(chatButton(root).props["aria-label"]).toBe("Chat, new messages");
  });
});
