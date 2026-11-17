import type { HitsterView } from "@cardgame/games";
import type { RoomView } from "@cardgame/protocol";
import { describe, expect, it } from "vitest";
import { scenarios } from "./dev/fixtures";
import {
  describeGap,
  gameModel,
  joinNames,
  rankLabel,
  ranking,
  revealedPlacement,
  seating,
  stageOf,
  statusText,
  tablePlayer,
  whoseTurn,
} from "./model";
import type { GameModel } from "./types";

const model = (room: RoomView): GameModel => {
  const m = gameModel(room);
  if (!m) throw new Error("no game");
  return m;
};
const viewOf = (room: RoomView) => room.game!.view as HitsterView;

describe("tablePlayer", () => {
  const room = scenarios.myTurn({ players: 4 });

  it("describes a seated player with their seat's look", () => {
    const mika = tablePlayer(room, "p1");
    expect(mika).toMatchObject({
      name: "Mika",
      seat: 5,
      animal: "🐷",
      chip: "#ef4a3c",
      chipEdge: "#b8362b",
      connected: true,
      isHost: false,
      isMe: false,
    });
  });

  it("makes the viewer's own seat gold", () => {
    expect(tablePlayer(room, "p0")).toMatchObject({
      seat: 3,
      chip: "#ffd84a",
      chipEdge: "#c9a52e",
      isMe: true,
      isHost: true,
    });
  });

  it("falls back safely for a player who is not seated", () => {
    expect(tablePlayer(room, "ghost")).toEqual({
      id: "ghost",
      name: "Someone",
      seat: null,
      animal: "🃏",
      chip: "#d8d2bf",
      chipEdge: "#a8a28f",
      connected: false,
      isHost: false,
      isMe: false,
    });
  });
});

describe("seating", () => {
  it("orders opponents clockwise from the seat after the viewer's", () => {
    // Seats: you 3, Mika 5, Jonathan 0, Priya 6, Otto 1, Alexandrina 7.
    const room = scenarios.myTurn({ players: 6 });
    const { me, opponents } = seating(room, viewOf(room).players);
    expect(me?.id).toBe("p0");
    expect(opponents.map((p) => p.seat)).toEqual([5, 6, 7, 0, 1]);
  });

  it("uses plain seat order for a spectator, with no me", () => {
    const room = scenarios.spectator({ players: 5 });
    const { me, opponents } = seating(room, viewOf(room).players);
    expect(me).toBeNull();
    expect(opponents.map((p) => p.seat)).toEqual([0, 1, 3, 5, 6]);
  });

  it("has no me for a viewer seated outside the game, but starts after their seat", () => {
    const room = scenarios.benched({ players: 3 });
    const { me, opponents } = seating(room, viewOf(room).players);
    expect(me).toBeNull();
    expect(opponents.map((p) => p.seat)).toEqual([5, 6, 0]);
  });

  it("puts players without a seat last", () => {
    const room = scenarios.myTurn({ players: 3 });
    const { opponents } = seating(room, [...viewOf(room).players, "gone"]);
    expect(opponents.map((p) => p.id)).toEqual(["p1", "p2", "gone"]);
  });
});

describe("stageOf", () => {
  const view = viewOf(scenarios.myTurn());
  const game = { result: null, pause: null };

  it("reads every server stage", () => {
    expect(
      stageOf(
        { ...view, intro: true },
        { result: null, pause: { remainingMs: 900 } },
      ),
    ).toEqual({ kind: "intro", remainingMs: 900 });
    expect(stageOf(view, game)).toMatchObject({
      kind: "placing",
      player: "p0",
    });
    const turn = {
      turnNumber: 3,
      player: "p1",
      song: { title: "Hey Ya!", artist: "OutKast", year: 2003 },
      outcome: "wrong" as const,
      index: 0,
    };
    expect(
      stageOf(
        { ...view, revealing: true, lastTurn: turn, nextPlayer: "p2" },
        game,
      ),
    ).toEqual({ kind: "revealing", turn, next: "p2" });
    expect(stageOf({ ...view, current: null }, game)).toEqual({
      kind: "dealing",
    });
    expect(stageOf(view, { result: { winners: ["p1"] }, pause: null })).toEqual(
      { kind: "over", winners: ["p1"] },
    );
    expect(stageOf({ ...view, winners: ["p2"] }, game)).toEqual({
      kind: "over",
      winners: ["p2"],
    });
  });

  it("says whose turn it is", () => {
    expect(whoseTurn({ kind: "dealing" }, "p0")).toBe("nobody");
    expect(whoseTurn({ kind: "over", winners: ["p0"] }, "p0")).toBe("nobody");
    const placing = stageOf(view, game);
    expect(whoseTurn(placing, "p0")).toBe("mine");
    expect(whoseTurn(placing, "p1")).toBe("opponent");
    expect(whoseTurn(placing, null)).toBe("opponent");
  });
});

describe("gameModel", () => {
  it("is null without a Hitster game", () => {
    const room = scenarios.myTurn();
    expect(gameModel({ ...room, game: null })).toBeNull();
    expect(
      gameModel({ ...room, game: { ...room.game!, gameId: "other" } }),
    ).toBeNull();
  });

  it("describes my turn", () => {
    const m = model(scenarios.myTurn({ players: 8, goal: 5 }));
    expect(m.me?.id).toBe("p0");
    expect(m.opponents).toHaveLength(7);
    expect(m.goal).toBe(5);
    expect(m.whose).toBe("mine");
    expect(m.active?.id).toBe("p0");
    expect(m.winners).toEqual([]);
  });

  it("describes an opponent's turn and the intro", () => {
    const opp = model(scenarios.opponentTurn());
    expect(opp.whose).toBe("opponent");
    expect(opp.active?.name).toBe("Mika");
    const intro = model(scenarios.intro());
    expect(intro.stage).toEqual({ kind: "intro", remainingMs: 9000 });
    expect(intro.whose).toBe("nobody");
    expect(intro.active).toBeNull();
  });

  it("lists the winners once the game is over", () => {
    const m = model(scenarios.overTie({ players: 3 }));
    expect(m.stage.kind).toBe("over");
    expect(m.winners.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(m.timer).toBeNull();
  });
});

describe("revealedPlacement", () => {
  it("takes a correct card out of the timeline and keeps its gap", () => {
    const room = scenarios.opponentRevealCorrect({
      timelines: "long",
      goal: 8,
    });
    const m = model(room);
    const turn = viewOf(room).lastTurn!;
    const placed = revealedPlacement(m)!;
    expect(placed.player).toBe(turn.player);
    expect(placed.placedAt).toBe(turn.index);
    expect(placed.line).toHaveLength(m.timelines[turn.player]!.length - 1);
    expect(placed.line.map((c) => c.year)).not.toContain(turn.song.year);
  });

  it("keeps a wrong card's timeline as it is", () => {
    const m = model(scenarios.myRevealWrong());
    const placed = revealedPlacement(m)!;
    expect(placed.line).toEqual(m.timelines.p0);
    expect(placed.placedAt).toBe(m.lastTurn!.index);
  });

  it("has no gap for a skipped turn, and nothing outside a reveal", () => {
    expect(
      revealedPlacement(model(scenarios.opponentRevealPassed()))?.placedAt,
    ).toBeNull();
    expect(revealedPlacement(model(scenarios.myTurn()))).toBeNull();
  });
});

describe("describeGap", () => {
  const line = [{ year: 1976 }, { year: 1981 }];
  it("names the spot in the design's words", () => {
    expect(describeGap(line, 0)).toBe("Before 1976");
    expect(describeGap(line, 1)).toBe("Between 1976 and 1981");
    expect(describeGap(line, 2)).toBe("After 1981");
    expect(describeGap([], 0)).toBeNull();
  });
});

describe("statusText", () => {
  const sub = (room: RoomView) => statusText(model(room));

  it("covers the intro and dealing", () => {
    expect(sub(scenarios.intro())).toEqual({
      headline: "Shuffling…",
      sub: "Dealing everyone a starting card.",
    });
    const room = scenarios.myTurn();
    const dealing = { ...model(room), stage: { kind: "dealing" as const } };
    expect(statusText(dealing).headline).toBe("Dealing…");
  });

  it("covers my turn, with and without a local placement", () => {
    const room = scenarios.myTurn({ timelines: "long" });
    const m = model(room);
    expect(statusText(m)).toEqual({
      headline: "Your turn",
      sub: "Listen, then drag the card into your timeline.",
    });
    const [a, b] = m.timelines.p0!;
    expect(statusText(m, { index: 1, dragging: false })).toEqual({
      headline: `Between ${a!.year} and ${b!.year}?`,
      sub: "Drag again to change your mind.",
    });
    expect(statusText(m, { index: 0, dragging: true })).toEqual({
      headline: `Before ${a!.year}`,
      sub: "Drop to place it.",
    });
  });

  it("handles an empty timeline on my turn", () => {
    const m = model(scenarios.myTurn());
    const empty = { ...m, timelines: { ...m.timelines, p0: [] } };
    expect(statusText(empty).sub).toBe(
      "Listen, then drag the card to start your timeline.",
    );
    expect(statusText(empty, { index: 0, dragging: false }).headline).toBe(
      "Start your timeline?",
    );
  });

  it("ignores a placement when it is not my turn", () => {
    const m = model(scenarios.opponentTurn());
    expect(statusText(m, { index: 0, dragging: true })).toEqual({
      headline: "Mika's turn",
      sub: "Still choosing.",
    });
  });

  it("explains an away opponent, differently for the host", () => {
    const room = scenarios.disconnectedOpponent();
    expect(sub(room)).toEqual({
      headline: "Mika's turn",
      sub: "They're away. You can skip their turn.",
    });
    const guest = { ...room, you: { ...room.you, isHost: false } };
    expect(sub(guest).sub).toBe("They're away. The host can skip their turn.");
  });

  it("shows another player's turn to spectators and benched viewers", () => {
    expect(sub(scenarios.spectator()).headline).toBe("Jonathan Silva's turn");
    expect(sub(scenarios.benched()).headline).toBe("Mika's turn");
  });

  it("covers my reveal", () => {
    const right = scenarios.myRevealCorrect();
    const song = viewOf(right).lastTurn!.song;
    const line = `${song.title}, ${song.artist}, ${song.year}.`;
    expect(sub(right)).toEqual({ headline: "Nailed it!", sub: line });
    const wrong = scenarios.myRevealWrong();
    const w = viewOf(wrong).lastTurn!.song;
    expect(sub(wrong)).toEqual({
      headline: "Not quite",
      sub: `${w.title}, ${w.artist}, ${w.year}. The card is discarded.`,
    });
  });

  it("covers an opponent's reveal", () => {
    expect(sub(scenarios.opponentRevealCorrect()).headline).toBe("Mika got it");
    expect(sub(scenarios.opponentRevealWrong()).headline).toBe("Mika missed");
    const passed = sub(scenarios.opponentRevealPassed());
    expect(passed.headline).toBe("Mika was skipped");
    expect(passed.sub).toMatch(/The card is discarded\.$/);
  });

  it("covers a skipped turn of my own", () => {
    const m = model(scenarios.myRevealWrong());
    const turn = { ...m.lastTurn!, outcome: "passed" as const };
    const skipped = {
      ...m,
      stage: { kind: "revealing" as const, turn, next: null },
    };
    expect(statusText(skipped).headline).toBe("Turn skipped");
  });

  it("covers the end of the game", () => {
    expect(sub(scenarios.overIWin({ goal: 8 }))).toEqual({
      headline: "You win!",
      sub: "8 songs in the right order.",
    });
    expect(sub(scenarios.overOpponentWins({ goal: 5 }))).toEqual({
      headline: "Mika wins",
      sub: "They reached 5 songs first.",
    });
    expect(sub(scenarios.overTie({ goal: 5 }))).toEqual({
      headline: "It's a tie!",
      sub: "The deck ran out. You and Mika have 4 songs each.",
    });
  });

  it("explains a win on an empty deck below the goal", () => {
    const m = model(scenarios.overTie({ goal: 5 }));
    const solo = { ...m, winners: m.winners.slice(0, 1) };
    expect(statusText(solo).sub).toBe(
      "The deck ran out and you have the most songs.",
    );
    const theirs = { ...m, winners: m.winners.slice(1) };
    expect(statusText(theirs)).toEqual({
      headline: "Mika wins",
      sub: "The deck ran out and they have the most songs.",
    });
    expect(statusText({ ...m, winners: [] }).headline).toBe("Game over");
  });
});

describe("ranking", () => {
  it("puts the winner first, then orders by cards", () => {
    const rows = ranking(
      model(scenarios.overOpponentWins({ players: 5, goal: 10 })),
    );
    expect(rows[0]).toMatchObject({ rank: "1ST", winner: true, count: 10 });
    expect(rows[0]!.player.name).toBe("Mika");
    for (let i = 2; i < rows.length; i++)
      expect(rows[i]!.count).toBeLessThanOrEqual(rows[i - 1]!.count);
    expect(rows.filter((r) => r.isMe)).toHaveLength(1);
    expect(rows).toHaveLength(5);
  });

  it("shares rank labels between ties, viewer first", () => {
    const rows = ranking(model(scenarios.overTie({ players: 4, goal: 5 })));
    expect(rows.slice(0, 2).map((r) => [r.rank, r.player.id])).toEqual([
      ["1ST", "p0"],
      ["1ST", "p1"],
    ]);
    expect(rows[2]!.rank).toBe("3RD");
  });

  it("leaves out a viewer who did not play", () => {
    const room = scenarios.benched({ players: 3 });
    expect(ranking(model(room)).some((r) => r.isMe)).toBe(false);
  });

  it("labels ranks", () => {
    expect(rankLabel(1)).toBe("1ST");
    expect(rankLabel(8)).toBe("8TH");
    expect(rankLabel(9)).toBe("9TH");
  });
});

describe("joinNames", () => {
  it("joins names for a sentence", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Mika"])).toBe("Mika");
    expect(joinNames(["You", "Mika", "Jon"])).toBe("You, Mika and Jon");
  });
});

describe("fixtures", () => {
  it("builds every scenario for every player count and goal", () => {
    for (const [name, build] of Object.entries(scenarios))
      for (const players of [2, 3, 4, 5, 6, 7, 8])
        for (const goal of [5, 8, 10] as const)
          for (const timelines of ["short", "long", "mixed"] as const) {
            const room = build({ players, goal, timelines });
            const m = model(room);
            const view = viewOf(room);
            const inGame = name === "benched" ? Math.min(players, 7) : players;
            expect(view.players).toHaveLength(inGame);
            expect(m.opponents.length + (m.me ? 1 : 0)).toBe(inGame);
            for (const line of Object.values(view.timelines)) {
              expect(line.length).toBeLessThanOrEqual(goal);
              const years = line.map((c) => c.year);
              expect(years).toEqual([...years].sort((a, b) => a - b));
            }
            // A correct card may reach the goal while it is being revealed.
            if (m.stage.kind === "placing" || m.stage.kind === "intro")
              for (const line of Object.values(view.timelines))
                expect(line.length).toBeLessThan(goal);
          }
  });
});
