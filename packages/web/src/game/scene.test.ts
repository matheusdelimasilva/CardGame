import type { RoomView } from "@cardgame/protocol";
import { describe, expect, it } from "vitest";
import { betReducer, freshBet, type BetState } from "./betting";
import type { Beat } from "./choreography";
import { scenarios } from "./dev/fixtures";
import {
  DISCARD_EXIT,
  MYSTERY_DEAL,
  MYSTERY_HOME,
  feltLayout,
  feltTimeline,
  handSlot,
  landscapeLayout,
} from "./layout";
import { gameModel, revealedPlacement, stolenCard, timelineOf } from "./model";
import { portraitLayout } from "./portrait";
import {
  freshPlacement,
  placementReducer,
  type PlacementState,
} from "./placement";
import { DISCARD_CLEAR_MS, STEAL_LAND_MS, dealCount, scene } from "./scene";

const options = { players: 4, goal: 10, timelines: "mixed" } as const;
const sceneOf = (
  room: RoomView,
  beat: Beat = "ready",
  placement: PlacementState = freshPlacement("current"),
) => {
  const model = gameModel(room)!;
  return { model, scene: scene({ model, beat, placement }) };
};
/** A hand slot's pose; scenes carry its scale separately. */
const slotPose = (k: number, total: number) => {
  const { x, y, r } = handSlot(k, total);
  return { x, y, r };
};
const placed = (index: number, held = false): PlacementState => {
  let s = freshPlacement("current");
  s = placementReducer(s, { type: "grab", turn: "current" });
  s = placementReducer(s, { type: "hover", index, turn: "current" });
  return held
    ? s
    : placementReducer(s, { type: "drop", index, turn: "current" });
};

describe("the scene on the viewer's turn", () => {
  it("keeps the card at home until it is placed, and offers no lock", () => {
    const { scene: s } = sceneOf(scenarios.myTurn(options));
    expect(s.mystery).toMatchObject({
      visible: true,
      draggable: true,
      pose: MYSTERY_HOME,
      face: null,
    });
    expect(s.lock).toBe("hidden");
    expect(s.status.headline).toBe("Your turn");
    expect(s.plate.active).toBe(true);
  });

  it("slides the card in from the deck as it arrives", () => {
    const { scene: s } = sceneOf(scenarios.myTurn(options), "arrive");
    expect(s.mystery.pose).toEqual(MYSTERY_DEAL);
  });

  it("follows the pointer while held and parts the hand over a slot", () => {
    const { model, scene: s } = sceneOf(
      scenarios.myTurn(options),
      "ready",
      placed(1, true),
    );
    const n = timelineOf(model, "p0").length;
    expect(s.mystery.pose).toBe("held");
    expect(s.mystery.heldTilt).toBe(0);
    expect(s.dropZone).toEqual({
      visible: true,
      over: true,
      slot: handSlot(1, n + 1),
    });
    expect(s.status.sub).toBe("Drop to place it.");
    expect(s.lock).toBe("hidden");
  });

  it("leaves a dropped card in its slot and offers to lock it in", () => {
    const { model, scene: s } = sceneOf(
      scenarios.myTurn(options),
      "ready",
      placed(0),
    );
    const n = timelineOf(model, "p0").length;
    expect(s.mystery.pose).toEqual(slotPose(0, n + 1));
    expect(s.mystery.scale).toBe(handSlot(0, n + 1).scale);
    expect(s.hand![0]!.pose.x).toBeGreaterThan(handSlot(0, n + 1).x);
    expect(s.status.headline).toMatch(/^Before \d{4}\?$/);
    expect(s.lock).toBe("ready");
  });

  it("locks the card and the button while the placement is sent", () => {
    const sent = placementReducer(placed(0), {
      type: "send",
      error: null,
      turn: "current",
    });
    const { scene: s } = sceneOf(scenarios.myTurn(options), "ready", sent);
    expect(s.lock).toBe("sending");
    expect(s.mystery.draggable).toBe(false);
    expect(s.status.sub).toBe("Locked in. Checking the year…");
  });

  it("hides the card and the hand in the deck during the intro, then deals", () => {
    const intro = sceneOf(scenarios.intro(options), "undealt").scene;
    expect(intro.shuffling).toBe(true);
    expect(intro.hand!.every((c) => !c.dealt)).toBe(true);
    expect(intro.minis.every((m) => !m.dealt)).toBe(true);
    expect(intro.mystery.visible).toBe(false);
    const dealing = sceneOf(scenarios.myTurn(options), "dealing").scene;
    expect(dealing.mystery.visible).toBe(false);
    expect(dealing.status.headline).toBe("Dealing…");
    const delays = [...dealing.hand!, ...dealing.minis].map((c) => c.delayMs);
    expect(new Set(delays).size).toBe(delays.length);
  });
});

describe("the scene of the viewer's reveal", () => {
  it("flips a right card in its slot with a glow, then it joins the hand", () => {
    const room = scenarios.myRevealCorrect(options);
    const { model, scene: flip } = sceneOf(room, "flip");
    const reveal = revealedPlacement(model)!;
    expect(flip.hand).toHaveLength(reveal.line.length);
    expect(flip.mystery).toMatchObject({
      visible: true,
      correct: true,
      pose: slotPose(reveal.placedAt!, reveal.line.length + 1),
    });
    expect(flip.mystery.face?.year).toBe(model.lastTurn!.song.year);
    const settle = sceneOf(room, "settle").scene;
    expect(settle.mystery.visible).toBe(false);
    expect(settle.hand).toHaveLength(reveal.line.length + 1);
    expect(settle.hand![reveal.placedAt!]!.pose).toEqual(flip.mystery.pose);
  });

  it("throws a wrong card off the table, then closes the hand once it is clear", () => {
    const room = scenarios.myRevealWrong(options);
    const flip = sceneOf(room, "flip").scene;
    const settle = sceneOf(room, "settle").scene;
    expect(settle.mystery).toMatchObject({
      pose: DISCARD_EXIT,
      motion: "discard",
      correct: false,
      scale: flip.mystery.scale,
    });
    expect(settle.status.headline).toBe("Not quite");
    // The gap stays open while the card waits on it, then closes behind it.
    expect(flip.hand!.every((c) => c.delayMs === 0)).toBe(true);
    expect(settle.hand!.every((c) => c.delayMs === DISCARD_CLEAR_MS)).toBe(
      true,
    );
    const right = sceneOf(scenarios.myRevealCorrect(options), "settle").scene;
    expect(right.hand!.every((c) => c.delayMs === 0)).toBe(true);
  });
});

describe("a long hand", () => {
  const long = { ...options, timelines: "long" } as const;

  it("draws every card at the hand's scale, the card in its slot too", () => {
    const { model, scene: s } = sceneOf(
      scenarios.myTurn(long),
      "ready",
      placed(3),
    );
    const n = timelineOf(model, "p0").length;
    const scale = handSlot(0, n + 1).scale;
    expect(scale).toBeLessThan(1);
    expect(s.hand!.every((c) => c.scale === scale)).toBe(true);
    expect(s.mystery.scale).toBe(scale);
  });

  it("shrinks the held card to the hand's size over a slot", () => {
    const { model, scene: s } = sceneOf(
      scenarios.myTurn(long),
      "ready",
      placed(3, true),
    );
    const n = timelineOf(model, "p0").length;
    expect(s.mystery.scale).toBeCloseTo(1.08 * handSlot(3, n + 1).scale, 10);
    expect(s.dropZone.slot).toEqual(handSlot(3, n + 1));
  });
});

describe("the scene on an opponent's turn", () => {
  it("lays their timeline on the felt and rests the card on the deck", () => {
    const { model, scene: s } = sceneOf(scenarios.opponentTurn(options));
    const active = model.active!;
    const line = timelineOf(model, active.id);
    const row = feltTimeline(line.length);
    const felt = s.minis.filter((m) => m.layer === "felt");
    expect(felt.map((m) => m.key)).toEqual(line.map((c) => c.id));
    expect(felt.map((m) => m.pose.x)).toEqual(row.map((p) => p.x));
    expect(s.mystery).toMatchObject({
      pose: MYSTERY_DEAL,
      visible: true,
      draggable: false,
    });
    expect(s.statusBox).toBe(feltLayout(line.length).status);
    expect(s.seats.find((seat) => seat.active)?.player.id).toBe(active.id);
    expect(s.felt?.player.id).toBe(active.id);
  });

  it("puts the status beside a short line and under a long one", () => {
    const short = sceneOf(
      scenarios.opponentTurn({ ...options, timelines: "short" }),
    ).scene;
    expect(short.statusBox).toBe("opponent");
    const long = sceneOf(
      scenarios.opponentTurn({ ...options, timelines: "long" }),
    ).scene;
    expect(long.statusBox).toBe("under");
  });

  it("shows the title and artist on the face-down card when the table does", () => {
    const { scene: s } = sceneOf(
      scenarios.opponentTurn({ ...options, showSongInfo: true }),
    );
    expect(s.mystery.title).not.toBeNull();
  });

  it("reveals their card in its gap, then sends their line back to the seat", () => {
    const room = scenarios.opponentRevealCorrect(options);
    const model = gameModel(room)!;
    const reveal = revealedPlacement(model)!;
    const placedKey = timelineOf(model, reveal.player)[reveal.placedAt!]!.id;
    const show = sceneOf(room, "show").scene;
    expect(show.status.headline).toBe(`${model.active!.name} placed it`);
    const card = (beat: Beat) =>
      sceneOf(room, beat).scene.minis.find((m) => m.key === placedKey)!;
    expect(card("launch").year).toBeNull();
    expect(card("show").layer).toBe("placed");
    expect(card("flip")).toMatchObject({
      year: model.lastTurn!.song.year,
      glow: true,
    });
    const back = sceneOf(room, "return").scene;
    expect(back.felt).toBeNull();
    expect(back.minis.every((m) => m.layer === "seat")).toBe(true);
    expect(card("return").layer).toBe("seat");
  });

  it("throws a wrong card off the felt", () => {
    const { scene: s } = sceneOf(
      scenarios.opponentRevealWrong(options),
      "settle",
    );
    const thrown = s.minis.find((m) => m.layer === "placed")!;
    expect(thrown).toMatchObject({ motion: "discard", glow: false });
    expect(thrown.pose).toEqual(DISCARD_EXIT);
  });

  it("turns a skipped player's card over on the deck", () => {
    const { scene: s } = sceneOf(
      scenarios.opponentRevealPassed(options),
      "flip",
    );
    expect(s.mystery).toMatchObject({ visible: true, pose: MYSTERY_DEAL });
    expect(s.mystery.face).not.toBeNull();
    expect(s.minis.some((m) => m.layer === "placed")).toBe(false);
  });
});

describe("viewers who are not playing", () => {
  it.each(["spectator", "benched"] as const)(
    "%s: everyone is an opponent, with no hand and no draggable card",
    (name) => {
      const { model, scene: s } = sceneOf(scenarios[name](options));
      expect(model.me).toBeNull();
      expect(s.hand).toBeNull();
      expect(s.mystery.draggable).toBe(false);
      expect(s.seats).toHaveLength(model.opponents.length);
    },
  );

  it("seats all eight players of a full table for a spectator", () => {
    const { scene: s } = sceneOf(
      scenarios.spectator({ ...options, players: 8 }),
    );
    expect(s.seats).toHaveLength(8);
    expect(new Set(s.seats.map((seat) => seat.at.x)).size).toBe(8);
  });
});

describe("the scene on the portrait stage", () => {
  const long = { ...options, timelines: "long" } as const;
  const layout = portraitLayout(90, options.players - 1);
  const portraitOf = (
    room: RoomView,
    beat: Beat = "ready",
    placement: PlacementState = freshPlacement("current"),
  ) => {
    const model = gameModel(room)!;
    return { model, scene: scene({ model, beat, placement, layout }) };
  };

  it("draws the hand and the card resting in it in hand units, and says which slot the card is in", () => {
    const { model, scene: s } = portraitOf(
      scenarios.myTurn(long),
      "ready",
      placed(7),
    );
    const n = timelineOf(model, "p0").length;
    const { scale, ...pose } = layout.hand.slot(7, n + 1);
    expect(s.mystery).toMatchObject({ slot: 7, pose, scale });
    expect(s.handSlots).toBe(n + 1);
    expect(s.hand!.map((c) => c.pose.x)).toEqual(
      [...range(7), ...range(n - 7).map((i) => i + 8)].map(
        (k) => layout.hand.slot(k, n + 1).x,
      ),
    );
    expect(portraitOf(scenarios.myTurn(long)).scene.mystery).toMatchObject({
      slot: null,
      pose: layout.mysteryHome,
    });
  });

  it("draws the slot under a held card where the drop lands", () => {
    const { model, scene: s } = portraitOf(
      scenarios.myTurn(long),
      "ready",
      placed(2, true),
    );
    const n = timelineOf(model, "p0").length;
    expect(s.dropZone.slot).toEqual(layout.hand.slot(2, n + 1));
    expect(s.mystery.slot).toBeNull();
  });

  it("flips the viewer's card in its slot, then throws a wrong one off the stage", () => {
    const room = scenarios.myRevealWrong(long);
    const flip = portraitOf(room, "flip").scene.mystery;
    expect(flip.slot).not.toBeNull();
    const settle = portraitOf(room, "settle").scene.mystery;
    expect(settle).toMatchObject({
      slot: null,
      pose: layout.discardExit,
      motion: "discard",
    });
  });

  it("piles the other opponents' cards behind their seats and lays the active one's on the felt", () => {
    const { model, scene: s } = portraitOf(scenarios.opponentTurn(long));
    const active = model.active!;
    const line = timelineOf(model, active.id);
    const felt = s.minis.filter((m) => m.layer === "felt");
    expect(felt.map((m) => m.pose.x)).toEqual(
      layout.feltTimeline(line.length).map((c) => c.x),
    );
    const piled = s.minis.filter((m) => m.layer === "pile");
    expect(piled.length + felt.length).toBe(s.minis.length);
    expect(piled.every((m) => m.zoom === 1)).toBe(true);
    // The bet bar is part of the status here, which moves up for it.
    expect(s.statusBox).toBe("betting");
    expect(s.betBar?.place).toBe("status");
    expect(portraitOf(scenarios.opponentNoTokens(long)).scene.statusBox).toBe(
      "opponent",
    );
    expect(s.mystery.pose).toEqual(layout.mysteryDeal);
  });
});

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

it("counts every starting card for the deal", () => {
  const model = gameModel(scenarios.intro({ ...options, timelines: "short" }))!;
  expect(dealCount(model)).toBe(
    [model.me!, ...model.opponents].reduce(
      (n, p) => n + timelineOf(model, p.id).length,
      0,
    ),
  );
});

describe("betting on an opponent's turn", () => {
  const four = { ...options, players: 4 } as const;
  const withBet = (room: RoomView, bet: BetState, secondsLeft = 3) => {
    const model = gameModel(room)!;
    return scene({
      model,
      beat: "ready",
      placement: freshPlacement(null),
      bet,
      secondsLeft,
    });
  };
  const picked = (index: number, sent = false): BetState => {
    let s = betReducer(freshBet("current"), {
      type: "pick",
      index,
      turn: "current",
    });
    if (sent)
      s = betReducer(s, {
        type: "send",
        move: "bet",
        error: null,
        turn: "current",
      });
    return s;
  };

  it("offers every gap of their line and the bar, which confirms only a picked gap", () => {
    const room = scenarios.opponentTurn(four);
    const s = withBet(room, freshBet("current"));
    const line = s.felt!.line;
    expect(s.gaps).toHaveLength(line.length + 1);
    expect(s.gaps[0]).toMatchObject({
      label: `Bet: Before ${line[0]!.year}`,
      state: "open",
      disabled: false,
    });
    expect(s.gaps[1]!.label).toBe(
      `Bet: Between ${line[0]!.year} and ${line[1]!.year}`,
    );
    for (const gap of s.gaps) expect(gap.reach).toBeGreaterThan(gap.box.w);
    expect(s.betBar).toEqual({
      text: "Tap a gap in Mika's timeline to bet",
      seconds: null,
      canConfirm: false,
      sending: false,
      place: "floating",
    });
    const pick = withBet(room, picked(1));
    expect(pick.gaps[1]!.state).toBe("picked");
    expect(pick.betBar).toMatchObject({
      text: `Bet 1 token: Between ${line[0]!.year} and ${line[1]!.year}`,
      canConfirm: true,
    });
    const sending = withBet(room, picked(1, true));
    expect(sending.betBar).toMatchObject({ canConfirm: false, sending: true });
    expect(sending.gaps.every((g) => g.disabled)).toBe(true);
  });

  it("counts the bar down once they have locked in", () => {
    const s = withBet(scenarios.opponentLocked(four), freshBet("current"), 4);
    expect(s.betBar?.seconds).toBe(4);
    expect(s.status.timer).toBe("Bets close in 4s.");
  });

  it("keeps my gap marked once I have bet, without the bar", () => {
    const room = scenarios.opponentBetPlaced(four);
    const model = gameModel(room)!;
    const s = withBet(room, freshBet("current"));
    expect(s.betBar).toBeNull();
    expect(s.gaps).toHaveLength(1);
    expect(s.gaps[0]).toMatchObject({
      state: "mine",
      index: model.myBet.kind === "placed" ? model.myBet.index : -1,
    });
    expect(s.gaps[0]!.label).toMatch(/^Your bet: /);
  });

  it.each([
    "opponentPassedBet",
    "opponentNoTokens",
    "spectator",
    "myTurn",
    "myTurnLocked",
  ] as const)("offers no betting in %s", (name) => {
    const s = withBet(scenarios[name](four), freshBet("current"));
    expect(s.gaps).toEqual([]);
    expect(s.betBar).toBeNull();
  });

  it("shows a waiting token per bet, a BET tag on bettors and their chips less the bet", () => {
    const room = scenarios.opponentBetPlaced(four);
    const model = gameModel(room)!;
    const s = withBet(room, freshBet("current"));
    const layout = landscapeLayout(model.opponents.length);
    const count = s.felt!.line.length;
    expect(s.bets.map((b) => b.label)).toEqual([
      "You placed a bet.",
      "Priya placed a bet.",
      "Jonathan Silva placed a bet.",
    ]);
    s.bets.forEach((b, i) => {
      expect(b.at).toEqual(layout.bets.pendingFelt(i, 3, count));
      expect(b).toMatchObject({ motion: "move", inHand: false });
    });
    const bettors = s.seats.filter((seat) => seat.bet).map((x) => x.player.id);
    expect(bettors.sort()).toEqual(["p2", "p3"]);
    for (const seat of s.seats)
      expect(seat.chips).toBe(model.tokens[seat.player.id]);
    expect(s.plate.chips).toBe(model.tokens.p0);
    // Each token flies in from its bettor's chips.
    const priya = s.seats.find((seat) => seat.player.name === "Priya")!;
    expect(s.bets[1]!.from.x).toBeGreaterThan(priya.chipsAt.x);
  });
});

describe("the viewer's locked card", () => {
  it("rests in its slot, cannot be moved, and counts down the others' bets", () => {
    const room = scenarios.myTurnLocked(options);
    const model = gameModel(room)!;
    const s = scene({
      model,
      beat: "ready",
      placement: freshPlacement("current"),
      secondsLeft: 3,
    });
    expect(s.mystery).toMatchObject({ slot: 0, draggable: false });
    expect(s.lock).toBe("hidden");
    expect(s.timer).toEqual({ filled: 3, total: 5 });
    expect(s.status.headline).toBe("Locked in");
    expect(s.status.timer).toBe("Opponents can bet for 3s.");
    const layout = landscapeLayout(model.opponents.length);
    s.bets.forEach((b, i) =>
      expect(b.at).toEqual(layout.bets.pendingMine(i, s.bets.length)),
    );
  });
});

describe("the reveal of bets", () => {
  const four = { ...options, players: 4 } as const;
  const at = (room: RoomView, beat: Beat) => sceneOf(room, beat).scene;

  it("keeps an opponent's bets waiting while their card is shown, then lands them on their gaps", () => {
    const room = scenarios.opponentRevealRefund(four);
    const model = gameModel(room)!;
    const layout = landscapeLayout(model.opponents.length);
    const show = at(room, "show");
    expect(show.bets.every((b) => b.motion === "move")).toBe(true);
    const bets = at(room, "bets");
    expect(bets.status).toEqual({ headline: "Bets are in", sub: "" });
    const turn = model.lastTurn!;
    const reveal = revealedPlacement(model)!;
    const mine = bets.bets.find((b) => b.player.isMe)!;
    expect(mine.at).toEqual(
      layout.bets.feltSpot(
        turn.bets[0]!.index,
        reveal.line.length,
        reveal.placedAt,
      ),
    );
    // Two bets on one gap stack upwards.
    const [, second, third] = bets.bets;
    expect(second!.level).toBe(0);
    expect(third!.level).toBe(1);
    expect(third!.at.y).toBeLessThan(second!.at.y);
  });

  it("holds a refund back until the tokens settle, then sends it home and the rest away", () => {
    const room = scenarios.opponentRevealRefund(four);
    const model = gameModel(room)!;
    const flip = at(room, "flip");
    expect(flip.plate.chips).toBe(model.tokens.p0! - 1);
    const settle = at(room, "settle");
    expect(settle.plate.chips).toBe(model.tokens.p0);
    const mine = settle.bets.find((b) => b.player.isMe)!;
    expect(mine).toMatchObject({ motion: "home", inHand: false });
    expect(mine.at).toEqual(mine.from);
    expect(
      settle.bets
        .filter((b) => !b.player.isMe)
        .every((b) => b.motion === "vanish"),
    ).toBe(true);
    expect(at(room, "return").bets).toEqual([]);
  });

  it("says nobody bet when nobody did", () => {
    expect(at(scenarios.opponentRevealWrong(four), "bets").status).toEqual({
      headline: "Bets are in",
      sub: "Nobody bet.",
    });
  });

  it("lands bets on the viewer's hand, the card still face down", () => {
    const room = scenarios.myRevealBets(four);
    const s = at(room, "bets");
    expect(s.status).toEqual({
      headline: "Locked in",
      sub: "Bets against you are revealed.",
    });
    expect(s.mystery.face).toBeNull();
    expect(s.mystery.slot).not.toBeNull();
    expect(s.bets.every((b) => b.inHand)).toBe(true);
    expect(at(room, "flip").mystery.face).not.toBeNull();
  });

  it("flies a card I steal into my hand, which makes room for it", () => {
    const room = scenarios.opponentRevealIStole(four);
    const model = gameModel(room)!;
    const stolen = stolenCard(model)!;
    const full = timelineOf(model, "p0");
    const flip = at(room, "flip");
    expect(flip.hand).toHaveLength(full.length - 1);
    expect(flip.plate.count).toBe(full.length - 1);
    const settle = at(room, "settle");
    expect(settle.hand).toHaveLength(full.length - 1);
    expect(settle.handSlots).toBe(full.length);
    const card = settle.minis.find((m) => m.key === stolen.card.id)!;
    expect(card).toMatchObject({ inHand: true, layer: "placed" });
    const slot = handSlot(stolen.index, full.length);
    expect(card.pose).toEqual({ x: slot.x, y: slot.y, r: slot.r });
    const after = at(room, "return");
    expect(after.hand!.map((c) => c.song.id)).toContain(stolen.card.id);
    expect(after.minis.some((m) => m.key === stolen.card.id)).toBe(false);
  });

  it("flies a card someone else steals to their seat", () => {
    const room = scenarios.opponentRevealOtherStole(four);
    const model = gameModel(room)!;
    const stolen = stolenCard(model)!;
    const seat = (s: ReturnType<typeof at>) =>
      s.seats.find((x) => x.player.id === stolen.thief)!;
    const full = timelineOf(model, stolen.thief).length;
    expect(seat(at(room, "flip")).count).toBe(full - 1);
    const settle = at(room, "settle");
    expect(seat(settle).count).toBe(full);
    const cards = settle.minis.filter((m) => m.key === stolen.card.id);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.layer).toBe("placed");
    expect(
      at(room, "return").minis.find((m) => m.key === stolen.card.id)!.layer,
    ).toBe("seat");
  });

  it("flies my stolen card to the thief's seat, where it appears once it lands", () => {
    const room = scenarios.myRevealStolen(four);
    const model = gameModel(room)!;
    const stolen = stolenCard(model)!;
    const flip = at(room, "flip");
    expect(flip.status.headline).toBe("Not quite");
    const settle = at(room, "settle");
    expect(settle.status.headline).toBe("Priya steals it");
    expect(settle.mystery).toMatchObject({ motion: "steal", visible: false });
    const landed = settle.minis.find((m) => m.key === stolen.card.id)!;
    expect(landed).toMatchObject({ motion: "land", delayMs: STEAL_LAND_MS });
    expect(settle.mystery.pose).toEqual(landed.pose);
  });
});
