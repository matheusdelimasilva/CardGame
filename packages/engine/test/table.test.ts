import { describe, expect, it } from "vitest";
import {
  EngineError,
  FACE_DOWN,
  FACE_UP,
  addCards,
  addZone,
  createTable,
  deal,
  moveAll,
  moveCard,
  peek,
  reveal,
  shuffle,
  standardDeck,
  viewTable,
} from "../src";

function table(seed = 1) {
  let t = createTable(seed);
  for (const z of ["deck", "discard"]) t = addZone(t, z);
  t = addZone(addZone(t, "hand:a", "a"), "hand:b", "b");
  return addCards(t, "deck", standardDeck());
}
const faces = (t: ReturnType<typeof table>, zone: string) => t.zones[zone]!.cards.map((c) => c.face);

describe("table", () => {
  it("shuffles deterministically from the seed and keeps all 52 cards", () => {
    const a = shuffle(table(7), "deck");
    const b = shuffle(table(7), "deck");
    const c = shuffle(table(8), "deck");
    expect(faces(a, "deck")).toEqual(faces(b, "deck"));
    expect(faces(a, "deck")).not.toEqual(faces(c, "deck"));
    expect([...faces(a, "deck")].sort()).toEqual(standardDeck().sort());
  });

  it("gives cards new ids and hides them when shuffled", () => {
    const before = addCards(table(), "discard", ["XX"], FACE_UP);
    const after = shuffle(moveAll(before, "discard", "deck"), "deck");
    const oldIds = new Set(before.zones.deck!.cards.concat(before.zones.discard!.cards).map((c) => c.id));
    expect(after.zones.deck!.cards).toHaveLength(53);
    expect(after.zones.deck!.cards.some((c) => oldIds.has(c.id))).toBe(false);
    expect(after.zones.deck!.cards.every((c) => c.visibleTo.length === 0)).toBe(true);
  });

  it("deals the top card and does not change the input state", () => {
    const t = table();
    const top = t.zones.deck!.cards.at(-1)!;
    const { table: next, cardId } = deal(t, "deck", "hand:a", ["a"]);
    expect(cardId).toBe(top.id);
    expect(next.zones["hand:a"]!.cards).toEqual([{ ...top, visibleTo: ["a"] }]);
    expect(next.zones.deck!.cards).toHaveLength(51);
    expect(t.zones.deck!.cards).toHaveLength(52);
  });

  it("moves a card to the top or the bottom, keeping visibility unless told otherwise", () => {
    let { table: t, cardId } = deal(table(), "deck", "hand:a", ["a"]);
    t = moveCard(t, cardId, "deck", { toBottom: true });
    expect(t.zones.deck!.cards[0]).toMatchObject({ id: cardId, visibleTo: ["a"] });
    t = moveCard(t, cardId, "discard", { visibleTo: FACE_UP });
    expect(t.zones.discard!.cards.at(-1)).toMatchObject({ id: cardId, visibleTo: "all" });
  });

  it("rejects unknown zones, unknown cards and dealing from an empty zone", () => {
    const t = table();
    expect(() => deal(t, "discard", "hand:a", FACE_DOWN)).toThrow(EngineError);
    expect(() => deal(t, "nope", "hand:a", FACE_DOWN)).toThrow(EngineError);
    expect(() => moveCard(t, "c999", "discard")).toThrow(EngineError);
    expect(() => addZone(t, "deck")).toThrow(EngineError);
  });
});

describe("visibility", () => {
  it("shows a private card only to its viewer, and nothing hidden to spectators", () => {
    const { table: t, cardId } = deal(table(), "deck", "hand:a", ["a"]);
    const card = (viewer: string | null) => viewTable(t, viewer).zones["hand:a"]!.cards[0]!;
    expect(card("a").face).not.toBeNull();
    expect(card("b")).toEqual({ id: cardId, face: null, faceUp: false });
    expect(card(null).face).toBeNull();
    expect(viewTable(t, "a").zones.deck!.cards.every((c) => c.face === null)).toBe(true);
  });

  it("peek adds one viewer; reveal shows everyone", () => {
    let { table: t, cardId } = deal(table(), "deck", "hand:a", FACE_DOWN);
    const seenBy = (viewer: string | null) => viewTable(t, viewer).zones["hand:a"]!.cards[0]!.face !== null;
    expect(seenBy("a")).toBe(false);
    t = peek(t, cardId, "a");
    expect([seenBy("a"), seenBy("b"), seenBy(null)]).toEqual([true, false, false]);
    t = reveal(t, cardId);
    expect([seenBy("a"), seenBy("b"), seenBy(null)]).toEqual([true, true, true]);
    expect(viewTable(t, null).zones["hand:a"]!.cards[0]!.faceUp).toBe(true);
  });

  it("never includes hidden faces or the random state in a view", () => {
    const { table: t } = deal(shuffle(table(), "deck"), "deck", "hand:a", ["a"]);
    const hidden = t.zones["hand:a"]!.cards[0]!.face;
    const json = JSON.stringify(viewTable(t, "b"));
    expect(json).not.toContain(`"${hidden}"`);
    expect(json).not.toContain("rng");
  });
});
