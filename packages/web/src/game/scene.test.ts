import type { RoomView } from "@cardgame/protocol";
import { describe, expect, it } from "vitest";
import type { Beat } from "./choreography";
import { scenarios } from "./dev/fixtures";
import {
  DISCARD_EXIT,
  MYSTERY_DEAL,
  MYSTERY_HOME,
  feltLayout,
  feltTimeline,
  handSlot,
} from "./layout";
import { gameModel, revealedPlacement, timelineOf } from "./model";
import {
  freshPlacement,
  placementReducer,
  type PlacementState,
} from "./placement";
import { DISCARD_CLEAR_MS, dealCount, scene } from "./scene";

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

it("counts every starting card for the deal", () => {
  const model = gameModel(scenarios.intro({ ...options, timelines: "short" }))!;
  expect(dealCount(model)).toBe(
    [model.me!, ...model.opponents].reduce(
      (n, p) => n + timelineOf(model, p.id).length,
      0,
    ),
  );
});
