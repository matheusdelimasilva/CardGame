/**
 * Where every card on the table is and how it looks, from the game model,
 * the viewer's local placement and the current beat. This is the design
 * mock's renderVals(): the components only draw what it returns, so later
 * rules (bets, steals) change this function and its tests, not the markup.
 */
import { DEAL_STAGGER_MS, type Beat } from "./choreography";
import {
  DISCARD_EXIT,
  MYSTERY_DEAL,
  MYSTERY_HOME,
  feltTimeline,
  handCardWithGap,
  handSlot,
  miniTimeline,
  opponentSpots,
} from "./layout";
import {
  describeGap,
  revealedPlacement,
  statusText,
  timelineOf,
} from "./model";
import { shownPlacement, type PlacementState } from "./placement";
import type {
  GameModel,
  Point,
  Pose,
  SongCardView,
  StatusText,
  TablePlayer,
} from "./types";
import type { SongFace } from "./cards";

/** Cards waiting in the deck sit on its centre, turned a little each, as in the design. */
const DECK_CENTRE: Point = { x: 36, y: 28.5 };
const UNDEALT_HAND_SCALE = 0.6;
/** The design's seat tilts, repeated for six and seven opponents. */
const SEAT_TILTS = [-3, 2, -2, 3, -1, 2, -2];
/** A held card is lifted a little; over the hand it straightens. */
const HELD_SCALE = 1.08;
const HELD_TILT = 5;
/** While a gap is open under the held card, each card further from it moves a beat later. */
const PART_STAGGER_MS = 35;
/** Hovering a mini card enlarges it: a lot at a seat, a little on the felt. */
const SEAT_ZOOM = 2.4;
const FELT_ZOOM = 1.25;

export interface HandCardScene {
  song: SongCardView;
  pose: Pose;
  scale: number;
  /** False while the card is still in the deck (intro): it is hidden there. */
  dealt: boolean;
  /** How the card gets to its pose: flown from the deck, or slid along the hand. */
  motion: "deal" | "move";
  delayMs: number;
}

export interface MysteryScene {
  /** One card per turn: a new key is a new card from the deck. */
  key: string;
  /** "held": following the pointer, which the drag code tracks outside React. */
  pose: Pose | "held";
  /** Tilt while held. */
  heldTilt: number;
  scale: number;
  visible: boolean;
  /** Turned over to show `face`. */
  face: SongFace | null;
  correct: boolean;
  /** The viewer's own unsent card: it can be dragged and moved with the keys. */
  draggable: boolean;
  motion: "move" | "held" | "discard" | "none";
  title: string | null;
  artist: string | null;
}

export interface SeatScene {
  player: TablePlayer;
  count: number;
  /** Centre of the seat card. */
  at: Point;
  scale: number;
  active: boolean;
  tilt: number;
}

export interface MiniScene {
  /** The song's id, so a card moving between its seat and the felt keeps its element. */
  key: string;
  /** null: face down ("?"). */
  year: number | null;
  pose: Pose;
  scale: number;
  glow: boolean;
  /** Stacking: seat cards under the felt's, the placed card on top. */
  layer: "seat" | "felt" | "placed";
  dealt: boolean;
  motion: "deal" | "move" | "discard";
  delayMs: number;
  /** How much hovering enlarges it. */
  zoom: number;
}

/** The active opponent's timeline as it lies on the felt. */
export interface FeltScene {
  player: TablePlayer;
  /** Their cards on the felt, oldest first, without a card being revealed. */
  line: SongCardView[];
  /** The gap their card was placed in, while it is shown there. */
  placedAt: number | null;
}

export interface Scene {
  status: StatusText;
  /** Which side of the felt the status sits on (see STATUS_BOX). */
  statusBox: "mine" | "opponent";
  lock: "hidden" | "ready" | "sending";
  shuffling: boolean;
  /** null when the viewer is not playing. */
  hand: HandCardScene[] | null;
  mystery: MysteryScene;
  dropZone: { visible: boolean; over: boolean; slot: Pose | null };
  seats: SeatScene[];
  minis: MiniScene[];
  felt: FeltScene | null;
  plate: { active: boolean; count: number };
}

export interface SceneInput {
  model: GameModel;
  beat: Beat;
  placement: PlacementState;
}

/** How many cards the deal moves: everyone's starting timeline. */
export function dealCount(model: GameModel): number {
  const everyone = model.me ? [model.me, ...model.opponents] : model.opponents;
  return everyone.reduce((n, p) => n + timelineOf(model, p.id).length, 0);
}

const at = (p: Point, r = 0): Pose => ({ x: p.x, y: p.y, r });

/** The viewer's hand: which cards, and the gap the mystery card opens in it. */
function handLine(
  { model, beat, placement }: SceneInput,
  line: SongCardView[],
): { line: SongCardView[]; gap: number | null } {
  const stage = model.stage;
  if (stage.kind === "placing" && model.whose === "mine")
    return {
      line,
      gap: placement.held ? placement.held.index : placement.index,
    };
  if (stage.kind === "revealing" && model.whose === "mine") {
    // Once settled, a right card is simply part of the hand; a wrong one has gone.
    if (beat !== "flip") return { line, gap: null };
    const reveal = revealedPlacement(model)!;
    return {
      line: reveal.line,
      // A skipped turn's card stays wherever the viewer had left it.
      gap: reveal.placedAt ?? placement.index,
    };
  }
  return { line, gap: null };
}

function handScene(input: SceneInput): {
  cards: HandCardScene[];
  gap: number | null;
  count: number;
} {
  const { model, beat, placement } = input;
  const own = timelineOf(model, model.me!.id);
  const { line, gap } = handLine(input, own);
  const n = line.length;
  const parting = placement.held !== null && gap !== null;
  const cards = line.map((song, i): HandCardScene => {
    if (beat === "undealt")
      return {
        song,
        pose: { ...DECK_CENTRE, r: i * 40 },
        scale: UNDEALT_HAND_SCALE,
        dealt: false,
        motion: "move",
        delayMs: 0,
      };
    const pose = { ...handCardWithGap(i, n, gap) };
    let delayMs = 0;
    if (parting) {
      // The design's parting: neighbours lean away from the gap, further cards follow later.
      delayMs = Math.abs(i - gap + (i < gap ? 1 : 0)) * PART_STAGGER_MS;
      pose.x += i < gap ? -0.7 : 0.7;
      if (i === gap - 1) pose.r -= 6;
      if (i === gap) pose.r += 6;
      if (i === gap - 1 || i === gap) pose.y -= 0.9;
    }
    return {
      song,
      pose,
      scale: 1,
      dealt: true,
      motion: beat === "dealing" ? "deal" : "move",
      delayMs: beat === "dealing" ? i * DEAL_STAGGER_MS : delayMs,
    };
  });
  return { cards, gap, count: n };
}

function mysteryScene(
  input: SceneInput,
  handCount: number,
  handGap: number | null,
): MysteryScene {
  const { model, beat, placement } = input;
  const stage = model.stage;
  const base: MysteryScene = {
    key: String(model.turnNumber),
    pose: at(MYSTERY_DEAL),
    heldTilt: 0,
    scale: 1,
    visible: false,
    face: null,
    correct: false,
    draggable: false,
    motion: "none",
    title: null,
    artist: null,
  };
  if (stage.kind === "placing") {
    if (beat === "dealing") return base;
    const shown = {
      ...base,
      visible: true,
      motion: "move" as const,
      title: stage.song.title,
      artist: stage.song.artist,
    };
    // Someone else's card rests face down on the deck.
    if (model.whose !== "mine") return shown;
    const draggable = placement.sent === null;
    if (placement.held)
      return {
        ...shown,
        pose: "held",
        heldTilt: placement.held.index === null ? HELD_TILT : 0,
        scale: HELD_SCALE,
        draggable,
        motion: "held",
      };
    return {
      ...shown,
      // Just dealt, it waits off the deck for a moment before sliding home.
      pose:
        placement.index !== null
          ? handSlot(placement.index, handCount + 1)
          : beat === "arrive"
            ? at(MYSTERY_DEAL)
            : MYSTERY_HOME,
      draggable,
    };
  }
  if (stage.kind !== "revealing") return base;
  const { turn } = stage;
  const mine = model.whose === "mine";
  // An opponent's placed card is drawn as a mini card in their timeline instead.
  if (!mine && turn.outcome !== "passed") return base;
  const correct = turn.outcome === "correct";
  let pose: Pose = at(MYSTERY_DEAL);
  if (mine)
    pose = handGap === null ? MYSTERY_HOME : handSlot(handGap, handCount + 1);
  if (beat === "settle" && mine && correct) return base;
  return {
    ...base,
    pose: beat === "settle" ? DISCARD_EXIT : pose,
    visible: true,
    face: turn.song,
    correct: correct && beat === "flip",
    motion: beat === "settle" ? "discard" : "move",
  };
}

/** The opponent whose timeline lies on the felt, if any. */
function feltPlayer({ model, beat }: SceneInput): TablePlayer | null {
  if (model.whose !== "opponent") return null;
  if (model.stage.kind === "placing") return model.active;
  if (model.stage.kind === "revealing" && beat !== "return")
    return model.active;
  return null;
}

function opponentsScene(input: SceneInput, firstDeal: number) {
  const { model, beat } = input;
  const spots = opponentSpots(model.opponents.length);
  const onFelt = feltPlayer(input);
  const reveal = revealedPlacement(model);
  const turn = model.stage.kind === "revealing" ? model.stage.turn : null;
  const seats: SeatScene[] = [];
  const minis: MiniScene[] = [];
  let felt: FeltScene | null = null;
  let dealt = firstDeal;
  for (const [i, player] of model.opponents.entries()) {
    const spot = spots[i]!;
    const full = timelineOf(model, player.id);
    const isFelt = onFelt?.id === player.id;
    const revealing = isFelt && reveal !== null && reveal.player === player.id;
    const placedAt = revealing ? reveal.placedAt : null;
    const line = revealing ? reveal.line : full;
    seats.push({
      player,
      count: full.length,
      at: spot.seat,
      scale: spot.scale,
      active: model.active?.id === player.id,
      tilt: SEAT_TILTS[i % SEAT_TILTS.length]!,
    });
    if (isFelt) felt = { player, line, placedAt };
    const row = isFelt ? feltTimeline(line.length, placedAt) : null;
    const seatRow = miniTimeline(spot, line.length);
    line.forEach((song, j) => {
      const order = dealt++;
      if (beat === "undealt") {
        minis.push({
          key: song.id,
          year: song.year,
          pose: at(DECK_CENTRE),
          scale: spot.scale,
          glow: false,
          layer: "seat",
          dealt: false,
          motion: "move",
          delayMs: 0,
          zoom: SEAT_ZOOM,
        });
        return;
      }
      const slot = row
        ? row[placedAt !== null && j >= placedAt ? j + 1 : j]!
        : null;
      minis.push({
        key: song.id,
        year: song.year,
        pose: at(slot ?? seatRow[j]!),
        scale: slot ? slot.scale : spot.scale,
        glow: false,
        layer: slot ? "felt" : "seat",
        dealt: true,
        motion: beat === "dealing" ? "deal" : "move",
        delayMs: beat === "dealing" ? order * DEAL_STAGGER_MS : 0,
        zoom: slot ? FELT_ZOOM : SEAT_ZOOM,
      });
    });
    // The placed card, until it joins the line (right) or has flown off (wrong).
    if (revealing && placedAt !== null && row && turn) {
      const correct = turn.outcome === "correct";
      const slot = row[placedAt]!;
      const launched = beat === "launch";
      minis.push({
        key: correct ? full[placedAt]!.id : `placed-${turn.turnNumber}`,
        year: beat === "flip" || beat === "settle" ? turn.song.year : null,
        pose: launched
          ? at(DECK_CENTRE)
          : beat === "settle" && !correct
            ? DISCARD_EXIT
            : at(slot),
        scale: launched ? 1 : slot.scale,
        glow: correct && (beat === "flip" || beat === "settle"),
        layer: "placed",
        dealt: true,
        motion: beat === "settle" && !correct ? "discard" : "move",
        delayMs: 0,
        zoom: FELT_ZOOM,
      });
    }
  }
  return { seats, minis, felt };
}

/** Everything the stage draws. */
export function scene(input: SceneInput): Scene {
  const { model, beat, placement } = input;
  const stage = model.stage;
  const placingMine = stage.kind === "placing" && model.whose === "mine";
  const hand = model.me ? handScene(input) : null;
  const handCount = hand?.count ?? 0;
  const own = model.me ? timelineOf(model, model.me.id) : [];
  const { seats, minis, felt } = opponentsScene(input, own.length);

  let status = statusText(
    model,
    placingMine ? shownPlacement(placement) : null,
  );
  if (beat === "dealing") status = { headline: "Dealing…", sub: "" };
  else if (placingMine && placement.sent && placement.index !== null)
    status = {
      headline: describeGap(own, placement.index) ?? "Start your timeline",
      sub: "Locked in. Checking the year…",
    };
  else if (
    felt &&
    felt.placedAt !== null &&
    (beat === "launch" || beat === "show")
  )
    status = {
      headline: `${felt.player.name} placed it`,
      sub: `${describeGap(felt.line, felt.placedAt) ?? "First card"}.`,
    };

  const held = placingMine ? placement.held : null;
  const over = held !== null && held.index !== null;
  return {
    status,
    statusBox: felt ? "opponent" : "mine",
    lock:
      placingMine && !placement.held && placement.index !== null
        ? placement.sent
          ? "sending"
          : "ready"
        : "hidden",
    shuffling: beat === "undealt",
    hand: hand?.cards ?? null,
    mystery: mysteryScene(input, handCount, hand?.gap ?? null),
    dropZone: {
      visible: held !== null,
      over,
      slot: over ? handSlot(held.index!, handCount + 1) : null,
    },
    seats,
    minis,
    felt,
    plate: {
      active:
        model.whose === "mine" &&
        (stage.kind === "placing" || stage.kind === "revealing"),
      count: handCount,
    },
  };
}
