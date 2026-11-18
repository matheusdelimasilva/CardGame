import { translate, type Locale } from "../i18n/locale";
/**
 * Where every card on the table is and how it looks, from the game model,
 * the viewer's local placement and the current beat. This is the design
 * mock's renderVals(): the components only draw what it returns, so later
 * rules (bets, steals) change this function and its tests, not the markup.
 */
import { freshBet, type BetState } from "./betting";
import { DEAL_STAGGER_MS, type Beat } from "./choreography";
import {
  HAND_CARD,
  MINI_CARD,
  PLATE_CHIP,
  SEAT_CHIP,
  handCardWithGap,
  landscapeLayout,
  stackOffset,
  type HandPose,
  type OpponentSpot,
  type StageLayout,
  type StatusPlace,
} from "./layout";
import {
  describeGap,
  playerOf,
  revealedPlacement,
  songLine,
  statusText,
  stolenCard,
  timelineOf,
} from "./model";
import { shownPlacement, type PlacementState } from "./placement";
import type {
  BetResult,
  Box,
  GameModel,
  Point,
  Pose,
  SongCardView,
  Stage,
  StatusText,
  TablePlayer,
} from "./types";
import type { SongFace } from "./cards";

/** Hand cards waiting in the deck sit on its centre this small, turned a little each, as in the design. */
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
/**
 * A wrong card waits on its slot for a beat, then flies off (see
 * .gs-stage-mystery.is-discard); the hand closes the gap once it is clear.
 */
export const DISCARD_CLEAR_MS = 1000;
/** A card stolen from the viewer flies to the thief's seat in this long (see .is-steal); the seat's card appears then. */
export const STEAL_LAND_MS = 1300;

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
  /** The hand slot the card rests in (its pose is that slot's, and scrolls with the hand), or null. */
  slot: number | null;
  /** Tilt while held. */
  heldTilt: number;
  scale: number;
  visible: boolean;
  /** Turned over to show `face`. */
  face: SongFace | null;
  correct: boolean;
  /** The viewer's own unsent card: it can be dragged and moved with the keys. */
  draggable: boolean;
  /** "steal": flies to the thief's seat after a beat, shrinking, and fades there. */
  motion: "move" | "held" | "discard" | "steal" | "none";
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
  /** Tokens to draw beside the seat card. */
  chips: number;
  /** Top-left of the chips' row. */
  chipsAt: Point;
  /** They have bet this turn: the seat card's "BET" tag. */
  bet: boolean;
}

export interface MiniScene {
  /** The song's id, so a card moving between its seat and the felt keeps its element. */
  key: string;
  /** null: face down ("?"). */
  year: number | null;
  pose: Pose;
  scale: number;
  glow: boolean;
  /** Stacking: a pile behind its seat card, seat cards under the felt's, the placed card on top. */
  layer: "pile" | "seat" | "felt" | "placed";
  dealt: boolean;
  /** "land": appears where it is after `delayMs` (a stolen card that has just arrived). */
  motion: "deal" | "move" | "discard" | "land";
  delayMs: number;
  /** How much hovering enlarges it. */
  zoom: number;
  /** The pose is in hand units: the card scrolls with the hand. */
  inHand: boolean;
}

/** A bet token on the table. */
export interface BetTokenScene {
  /** One per bettor and turn. */
  key: string;
  player: TablePlayer;
  /** Its centre; in hand units when `inHand`. */
  at: Point;
  inHand: boolean;
  /** The bettor's chips, where it came from (stage units). */
  from: Point;
  /** "home": back to the bettor's chips, then gone; "vanish": shrinks away where it is. */
  motion: "move" | "home" | "vanish";
  /** Stacked on others on the same gap: higher ones are drawn over lower ones. */
  level: number;
  label: string;
}

/** A gap in the active opponent's timeline on the felt, to bet on. */
export interface GapScene {
  index: number;
  /** The dashed outline, as the design draws it. */
  box: Box;
  /** The distance to the neighbouring gaps: how wide its target may be. */
  reach: number;
  label: string;
  /** "picked": chosen, not yet confirmed; "mine": where the viewer's bet is (not a button). */
  state: "open" | "picked" | "mine";
  disabled: boolean;
}

export interface BetBarScene {
  text: string;
  /** The betting window's countdown, once the player has locked in. */
  seconds: number | null;
  canConfirm: boolean;
  /** "Confirm bet" or "Pass" was pressed and the server has not answered. */
  sending: boolean;
  /** Floating under the felt, or inside the status (layout.bets.bar). */
  place: "floating" | "status";
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
  /** Where on the felt the status sits (see STATUS_BOX). */
  statusBox: StatusPlace;
  lock: "hidden" | "ready" | "sending";
  shuffling: boolean;
  /** null when the viewer is not playing. Poses are in hand units (see HandGeometry). */
  hand: HandCardScene[] | null;
  /** Slots the hand is laid out in: its cards, and the gap if one is open. */
  handSlots: number;
  mystery: MysteryScene;
  dropZone: { visible: boolean; over: boolean; slot: HandPose | null };
  seats: SeatScene[];
  minis: MiniScene[];
  felt: FeltScene | null;
  /** Tokens drawn are the viewer's: `chips` under the plate. */
  plate: { active: boolean; count: number; chips: number };
  /** The hand slot to keep in view, if any (see useHandScroll). */
  handFocus: number | null;
  bets: BetTokenScene[];
  gaps: GapScene[];
  betBar: BetBarScene | null;
  /** The five-segment countdown under the status while others may bet on the viewer's card. */
  timer: { filled: number; total: number } | null;
}

export interface SceneInput {
  model: GameModel;
  locale?: Locale;
  beat: Beat;
  placement: PlacementState;
  /** The viewer's bet on someone else's turn, before it is confirmed. */
  bet?: BetState;
  /** Whole seconds left in the betting window, ticking locally. */
  secondsLeft?: number | null;
  /** The design's landscape stage unless given. */
  layout?: StageLayout;
}

/** SceneInput with its layout settled. */
type Input = Required<SceneInput>;

/** How many cards the deal moves: everyone's starting timeline. */
export function dealCount(model: GameModel): number {
  const everyone = model.me ? [model.me, ...model.opponents] : model.opponents;
  return everyone.reduce((n, p) => n + timelineOf(model, p.id).length, 0);
}

const at = (p: Point & { r?: number }): Pose => ({
  x: p.x,
  y: p.y,
  r: p.r ?? 0,
});
/** A hand slot as a pose and the scale to draw a card there. */
const inSlot = ({ scale, ...pose }: HandPose) => ({ pose, scale });

/** The stolen card arrives at the thief's on this beat and stays there. */
const stolenHome = (beat: Beat) => beat === "settle" || beat === "return";
/** Before this beat, refunded tokens are still on the table, not back with their owners. */
const settled = stolenHome;
/** Beats on which the revealed card lies in the gap it was placed in. */
const inGap = (beat: Beat) => beat === "bets" || beat === "flip";

/** The viewer's own line: without a card they steal until it has flown to them. */
function ownLine({ model, beat }: Input): {
  line: SongCardView[];
  stolenAt: number | null;
} {
  const line = timelineOf(model, model.me!.id);
  const stolen = stolenCard(model);
  if (!stolen || stolen.thief !== model.me!.id || beat === "return")
    return { line, stolenAt: null };
  return {
    line: line.filter((_, i) => i !== stolen.index),
    // Once it is on its way the hand makes room for it.
    stolenAt: beat === "settle" ? stolen.index : null,
  };
}

/** The viewer's placement, as the server has it once it is locked in (also after a reload). */
function myPlacement({ model, placement }: Input): PlacementState {
  const stage = model.stage;
  if (stage.kind !== "placing" || !stage.locked || stage.lockedIndex === null)
    return placement;
  return {
    ...placement,
    index: stage.lockedIndex,
    held: null,
    sent: placement.sent ?? { error: null },
  };
}

/** The viewer's hand: which cards, and the gap the mystery card opens in it. */
function handLine(
  input: Input,
  line: SongCardView[],
  stolenAt: number | null,
): { line: SongCardView[]; gap: number | null } {
  const { model, beat } = input;
  const placement = myPlacement(input);
  const stage = model.stage;
  if (stage.kind === "placing" && model.whose === "mine")
    return {
      line,
      gap: placement.held ? placement.held.index : placement.index,
    };
  if (stage.kind === "revealing" && model.whose === "mine") {
    // Once settled, a right card is simply part of the hand; a wrong one has gone.
    if (!inGap(beat)) return { line, gap: null };
    const reveal = revealedPlacement(model)!;
    return {
      line: reveal.line,
      // A skipped turn's card stays wherever the viewer had left it.
      gap: reveal.placedAt ?? placement.index,
    };
  }
  return { line, gap: stolenAt };
}

function handScene(input: Input): {
  cards: HandCardScene[];
  gap: number | null;
  count: number;
} {
  const { model, beat, layout } = input;
  const placement = myPlacement(input);
  const own = ownLine(input);
  const { line, gap } = handLine(input, own.line, own.stolenAt);
  const n = line.length;
  const parting = placement.held !== null && gap !== null;
  const stage = model.stage;
  const discarding =
    beat === "settle" &&
    stage.kind === "revealing" &&
    model.whose === "mine" &&
    stage.turn.outcome !== "correct";
  const cards = line.map((song, i): HandCardScene => {
    if (beat === "undealt")
      return {
        song,
        pose: { ...layout.deckCentre, r: i * 40 },
        scale: UNDEALT_HAND_SCALE,
        dealt: false,
        motion: "move",
        delayMs: 0,
      };
    const { scale, ...pose } = handCardWithGap(i, n, gap, layout.hand.slot);
    let delayMs = discarding ? DISCARD_CLEAR_MS : 0;
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
      scale,
      dealt: true,
      motion: beat === "dealing" ? "deal" : "move",
      delayMs: beat === "dealing" ? i * DEAL_STAGGER_MS : delayMs,
    };
  });
  return { cards, gap, count: n };
}

/** Where a card lands at an opponent's seat: in their row of `count` cards, at `index`. */
function seatPose(
  layout: StageLayout,
  spot: OpponentSpot,
  count: number,
  index: number,
): Pose {
  return at(layout.miniTimeline(spot, count)[index] ?? spot.seat);
}

function mysteryScene(
  input: Input,
  handCount: number,
  handGap: number | null,
): MysteryScene {
  const { model, beat, layout } = input;
  const placement = myPlacement(input);
  const handSlot = layout.hand.slot;
  const stage = model.stage;
  const base: MysteryScene = {
    key: String(model.turnNumber),
    pose: at(layout.mysteryDeal),
    slot: null,
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
    if (placement.held) {
      // Over the hand it straightens and takes the size of the hand's cards.
      const over = placement.held.index;
      return {
        ...shown,
        pose: "held",
        heldTilt: over === null ? HELD_TILT : 0,
        scale:
          HELD_SCALE *
          (over === null ? 1 : handSlot(over, handCount + 1).scale),
        draggable,
        motion: "held",
      };
    }
    if (placement.index !== null)
      return {
        ...shown,
        ...inSlot(handSlot(placement.index, handCount + 1)),
        slot: placement.index,
        draggable,
      };
    return {
      ...shown,
      // Just dealt, it waits off the deck for a moment before sliding home.
      pose: beat === "arrive" ? at(layout.mysteryDeal) : layout.mysteryHome,
      draggable,
    };
  }
  if (stage.kind !== "revealing") return base;
  const { turn } = stage;
  const mine = model.whose === "mine";
  // An opponent's placed card is drawn as a mini card in their timeline instead.
  if (!mine && turn.outcome !== "passed") return base;
  const correct = turn.outcome === "correct";
  let rest = { pose: at(layout.mysteryDeal), scale: 1 };
  if (mine)
    rest =
      handGap === null
        ? { pose: layout.mysteryHome, scale: 1 }
        : inSlot(handSlot(handGap, handCount + 1));
  if (beat === "settle" && mine && correct) return base;
  const shown = {
    ...base,
    scale: rest.scale,
    pose: rest.pose,
    slot: mine ? handGap : null,
    visible: true,
    // Bets come out before the card turns over.
    face: beat === "bets" ? null : turn.song,
    correct: correct && beat === "flip",
    motion: "move" as const,
  };
  if (beat !== "settle") return shown;
  const stolen = stolenCard(model);
  const thiefAt = stolen
    ? model.opponents.findIndex((p) => p.id === stolen.thief)
    : -1;
  const spot = layout.opponents[thiefAt];
  if (stolen && spot) {
    const count = timelineOf(model, stolen.thief).length;
    return {
      ...shown,
      pose: seatPose(layout, spot, count, stolen.index),
      scale: 0.3 * spot.scale,
      slot: null,
      visible: false,
      motion: "steal",
    };
  }
  // It flies off at the size it had in its slot.
  return { ...shown, pose: layout.discardExit, slot: null, motion: "discard" };
}

/** The opponent whose timeline lies on the felt, if any. */
function feltPlayer({ model, beat }: Input): TablePlayer | null {
  if (model.whose !== "opponent") return null;
  if (model.stage.kind === "placing") return model.active;
  if (model.stage.kind === "revealing" && beat !== "return")
    return model.active;
  return null;
}

/** Bets of the stage, oldest first, and the result of each once the turn is judged. */
function betsOf(stage: Stage): {
  player: string;
  index: number | null;
  result: BetResult["result"] | null;
}[] {
  if (stage.kind === "placing")
    return stage.bets.map((b) => ({ ...b, result: null }));
  if (stage.kind === "revealing") return stage.turn.bets;
  return [];
}

/** Tokens a player has on the table that will come back to them, still out before the reveal settles. */
function tokensOut(input: Input, player: string): number {
  const { model, beat } = input;
  if (model.stage.kind !== "revealing" || settled(beat)) return 0;
  return model.stage.turn.bets.filter(
    (b) => b.player === player && b.result === "refunded",
  ).length;
}

/** Chips a player has in front of them as drawn now. */
const chipsOf = (input: Input, player: string) =>
  Math.max(0, (input.model.tokens[player] ?? 0) - tokensOut(input, player));

function opponentsScene(input: Input, firstDeal: number, handCount: number) {
  const { model, beat, layout } = input;
  const spots = layout.opponents;
  const deckCentre = at(layout.deckCentre);
  const onFelt = feltPlayer(input);
  const reveal = revealedPlacement(model);
  const turn = model.stage.kind === "revealing" ? model.stage.turn : null;
  const stolen = stolenCard(model);
  const betting = new Set(betsOf(model.stage).map((b) => b.player));
  const seats: SeatScene[] = [];
  const minis: MiniScene[] = [];
  let felt: FeltScene | null = null;
  let dealt = firstDeal;
  for (const [i, player] of model.opponents.entries()) {
    const spot = spots[i]!;
    let full = timelineOf(model, player.id);
    const thief = stolen?.thief === player.id;
    // The stolen card joins the thief's line once it flies there.
    if (thief && !stolenHome(beat))
      full = full.filter((_, j) => j !== stolen.index);
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
      chips: chipsOf(input, player.id),
      chipsAt: {
        x: spot.tokens.x,
        y:
          spot.tokens.y +
          (model.active?.id === player.id
            ? layout.bets.activeChipsDrop * spot.scale
            : 0),
      },
      bet: betting.has(player.id),
    });
    if (isFelt) felt = { player, line, placedAt };
    const row = isFelt ? layout.feltTimeline(line.length, placedAt) : null;
    const seatRow = layout.miniTimeline(spot, line.length);
    const piled = spot.lane.place === "pile";
    line.forEach((song, j) => {
      const order = dealt++;
      if (beat === "undealt") {
        minis.push({
          key: song.id,
          year: song.year,
          pose: deckCentre,
          scale: spot.scale,
          glow: false,
          layer: piled ? "pile" : "seat",
          dealt: false,
          motion: "move",
          delayMs: 0,
          zoom: piled ? 1 : SEAT_ZOOM,
          inHand: false,
        });
        return;
      }
      const slot = row
        ? row[placedAt !== null && j >= placedAt ? j + 1 : j]!
        : null;
      const arriving = thief && j === stolen.index && beat === "settle";
      minis.push({
        key: song.id,
        year: song.year,
        pose: at(slot ?? seatRow[j]!),
        scale: slot ? slot.scale : spot.scale,
        glow: false,
        // Flying in from the felt, it passes over everything else.
        layer:
          arriving && model.whose !== "mine"
            ? "placed"
            : slot
              ? "felt"
              : piled
                ? "pile"
                : "seat",
        dealt: true,
        // On the viewer's own turn the card itself flies there first (see mysteryScene).
        motion:
          arriving && model.whose === "mine"
            ? "land"
            : beat === "dealing"
              ? "deal"
              : "move",
        delayMs:
          beat === "dealing"
            ? order * DEAL_STAGGER_MS
            : arriving && model.whose === "mine"
              ? STEAL_LAND_MS
              : 0,
        // A piled card is mostly hidden: the seat card tells the count.
        zoom: slot ? FELT_ZOOM : piled ? 1 : SEAT_ZOOM,
        inHand: false,
      });
    });
    // The placed card, until it joins the line (right), has flown off (wrong) or reached the thief.
    if (revealing && placedAt !== null && row && turn) {
      const correct = turn.outcome === "correct";
      const slot = row[placedAt]!;
      const launched = beat === "launch";
      const flying = beat === "settle" && !correct;
      // An opponent thief's line draws the card itself from now on.
      if (flying && stolen && stolen.thief !== model.me?.id) continue;
      const toMe = flying && stolen !== null;
      const handPose = toMe
        ? layout.hand.slot(stolen.index, handCount + 1)
        : null;
      minis.push({
        key: correct
          ? full[placedAt]!.id
          : stolen
            ? stolen.card.id
            : `placed-${turn.turnNumber}`,
        year: beat === "flip" || beat === "settle" ? turn.song.year : null,
        pose: launched
          ? deckCentre
          : handPose
            ? at(handPose)
            : flying
              ? layout.discardExit
              : at(slot),
        // Into the hand it grows to the hand's cards' size.
        scale: launched
          ? 1
          : handPose
            ? (handPose.scale * HAND_CARD.h) / MINI_CARD.h
            : slot.scale,
        glow: correct && (beat === "flip" || beat === "settle"),
        layer: "placed",
        dealt: true,
        motion: flying && !toMe ? "discard" : "move",
        delayMs: 0,
        zoom: FELT_ZOOM,
        inHand: toMe,
      });
    }
  }
  return { seats, minis, felt };
}

/** Centre of a player's chips, where their bet tokens come from and go back to. */
function chipsCentre(input: Input, player: string): Point {
  const { model, layout } = input;
  if (model.me?.id === player)
    return {
      x: layout.bets.plateChips.x + PLATE_CHIP / 2,
      y: layout.bets.plateChips.y,
    };
  const spot =
    layout.opponents[model.opponents.findIndex((p) => p.id === player)];
  if (!spot) return at(layout.deckCentre);
  const r = (SEAT_CHIP * spot.scale) / 2;
  return { x: spot.tokens.x + r, y: spot.tokens.y + r };
}

/** This turn's bet tokens: waiting in a row, then on their gaps, then going home or away. */
function betTokens(
  input: Input,
  felt: FeltScene | null,
  handCount: number,
  handGap: number | null,
): BetTokenScene[] {
  const { model, beat, layout } = input;
  const t = translate.bind(null, input.locale);
  const stage = model.stage;
  const bets = betsOf(stage);
  const geo = layout.bets;
  const mine = model.whose === "mine";
  if (stage.kind === "revealing" && beat === "return") return [];
  return bets.flatMap((bet, i): BetTokenScene[] => {
    // Every bettor plays in this game; a view that says otherwise draws nothing for them.
    const player = playerOf(model, bet.player);
    if (!player) return [];
    const token = {
      key: `${model.turnNumber}:${bet.player}`,
      player,
      from: chipsCentre(input, bet.player),
      level: 0,
      label: player.isMe
        ? t("You placed a bet.", "Você fez uma aposta.")
        : t(`${player.name} placed a bet.`, `${player.name} fez uma aposta.`),
    };
    const waiting =
      stage.kind === "placing" || beat === "launch" || beat === "show";
    if (waiting || bet.index === null || bet.result === null)
      return [
        {
          ...token,
          at: mine
            ? geo.pendingMine(i, bets.length)
            : geo.pendingFelt(i, bets.length, felt?.line.length ?? 0),
          inHand: false,
          motion: "move",
        },
      ];
    const same = bets.filter((b) => b.index === bet.index);
    const level = same.indexOf(bet);
    const spot = mine
      ? geo.handSpot(bet.index, handCount, handGap)
      : geo.feltSpot(bet.index, felt?.line.length ?? 0, felt?.placedAt ?? null);
    const landed = {
      ...token,
      level,
      at: { x: spot.x, y: spot.y - stackOffset(level, same.length) },
      inHand: mine,
    };
    if (!settled(beat)) return [{ ...landed, motion: "move" }];
    return [
      bet.result === "refunded"
        ? { ...landed, at: token.from, inHand: false, motion: "home" }
        : { ...landed, motion: "vanish" },
    ];
  });
}

/** The gap buttons on the active opponent's line and the bet bar, while the viewer may bet. */
function bettingScene(
  input: Input,
  felt: FeltScene | null,
): { gaps: GapScene[]; bar: BetBarScene | null } {
  const { model, bet, secondsLeft, layout, locale } = input;
  const t = translate.bind(null, locale);
  const stage = model.stage;
  const myBet = model.myBet;
  if (
    stage.kind !== "placing" ||
    !felt ||
    (myBet.kind !== "open" && myBet.kind !== "placed")
  )
    return { gaps: [], bar: null };
  const line = felt.line;
  const where = (g: number) =>
    describeGap(line, g, locale) ?? t("Anywhere", "Qualquer posição");
  const boxes = Array.from({ length: line.length + 1 }, (_, g) =>
    layout.feltGapBox(g, line.length),
  );
  const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const reach = (g: number) => {
    const c = centre(boxes[g]!);
    const apart = [boxes[g - 1], boxes[g + 1]]
      .filter((b): b is Box => !!b && Math.abs(centre(b).y - c.y) < 1e-6)
      .map((b) => Math.abs(centre(b).x - c.x));
    return apart.length ? Math.min(...apart) : boxes[g]!.w * 4;
  };
  if (myBet.kind === "placed")
    return {
      gaps: [
        {
          index: myBet.index,
          box: boxes[myBet.index] ?? boxes[0]!,
          reach: reach(myBet.index),
          label: t(
            `Your bet: ${where(myBet.index)}`,
            `Sua aposta: ${where(myBet.index)}`,
          ),
          state: "mine",
          disabled: true,
        },
      ],
      bar: null,
    };
  const sending = bet.sent !== null;
  return {
    gaps: boxes.map((box, g) => ({
      index: g,
      box,
      reach: reach(g),
      label: t(`Bet: ${where(g)}`, `Apostar: ${where(g)}`),
      state: bet.pick === g ? "picked" : "open",
      disabled: sending,
    })),
    bar: {
      text:
        bet.pick === null
          ? t(
              `Tap a gap in ${felt.player.name}'s timeline to bet`,
              `Toque em um espaço na linha do tempo de ${felt.player.name} para apostar`,
            )
          : t(
              `Bet 1 token: ${where(bet.pick)}`,
              `Apostar 1 ficha: ${where(bet.pick)}`,
            ),
      seconds: stage.locked ? secondsLeft : null,
      canConfirm: bet.pick !== null && !sending,
      sending,
      place: layout.bets.bar.kind,
    },
  };
}

/** The status, changed for the beats the model's state does not know about. */
function beatStatus(
  input: Input,
  felt: FeltScene | null,
  placingMine: boolean,
): StatusText {
  const { model, beat, secondsLeft, locale } = input;
  const t = translate.bind(null, locale);
  const placement = myPlacement(input);
  const stage = model.stage;
  const own = model.me ? timelineOf(model, model.me.id) : [];
  if (beat === "dealing")
    return { headline: t("Dealing…", "Distribuindo…"), sub: "" };
  if (
    placingMine &&
    stage.kind === "placing" &&
    !stage.locked &&
    placement.sent &&
    placement.index !== null
  )
    return {
      headline:
        describeGap(own, placement.index, locale) ??
        t("Start your timeline", "Comece sua linha do tempo"),
      sub: t(
        "Locked in. Checking the year…",
        "Posição confirmada. Conferindo o ano…",
      ),
    };
  if (stage.kind === "revealing") {
    const { turn } = stage;
    if (
      felt &&
      felt.placedAt !== null &&
      (beat === "launch" || beat === "show")
    )
      return {
        headline: t(
          `${felt.player.name} placed it`,
          `${felt.player.name} posicionou a carta`,
        ),
        sub: `${describeGap(felt.line, felt.placedAt, locale) ?? t("First card", "Primeira carta")}.`,
      };
    if (beat === "bets")
      return model.whose === "mine" && turn.outcome !== "passed"
        ? {
            headline: t("Locked in", "Posição confirmada"),
            sub: t(
              "Bets against you are revealed.",
              "As apostas contra você foram reveladas.",
            ),
          }
        : {
            headline: t("Bets are in", "Apostas encerradas"),
            sub: turn.bets.length ? "" : t("Nobody bet.", "Ninguém apostou."),
          };
    // The viewer's card is seen to be wrong before the thief takes it.
    if (model.whose === "mine" && turn.thief && beat === "flip")
      return {
        headline: t("Not quite", "Você errou"),
        sub: songLine(turn.song),
      };
  }
  return statusText(
    model,
    placingMine ? shownPlacement(placement) : null,
    secondsLeft,
    locale,
  );
}

/** Everything the stage draws. */
export function scene(given: SceneInput): Scene {
  const input: Input = {
    bet: freshBet(null),
    secondsLeft: null,
    ...given,
    locale: given.locale ?? "en",
    layout: given.layout ?? landscapeLayout(given.model.opponents.length),
  };
  const { model, layout } = input;
  const placement = myPlacement(input);
  const stage = model.stage;
  const placingMine = stage.kind === "placing" && model.whose === "mine";
  const hand = model.me ? handScene(input) : null;
  const handCount = hand?.count ?? 0;
  const own = model.me ? ownLine(input).line : [];
  const { seats, minis, felt } = opponentsScene(input, own.length, handCount);
  const mystery = mysteryScene(input, handCount, hand?.gap ?? null);
  const { gaps, bar } = bettingScene(input, felt);

  let status = beatStatus(input, felt, placingMine);
  // Where the bar is part of the status, its text takes the place of the line under the headline.
  if (bar?.place === "status") status = { ...status, sub: `${bar.text}.` };

  const locked = stage.kind === "placing" && stage.locked;
  const held = placingMine ? placement.held : null;
  const over = held !== null && held.index !== null;
  const total = model.timer ? Math.round(model.timer.totalMs / 1000) : 0;
  return {
    status,
    statusBox: felt
      ? bar?.place === "status"
        ? "betting"
        : layout.feltStatus(felt.line.length)
      : "mine",
    lock:
      placingMine && !locked && !placement.held && placement.index !== null
        ? placement.sent
          ? "sending"
          : "ready"
        : "hidden",
    shuffling: input.beat === "undealt",
    hand: hand?.cards ?? null,
    handSlots: hand ? hand.count + (hand.gap === null ? 0 : 1) : 0,
    mystery,
    dropZone: {
      visible: held !== null,
      over,
      slot: over ? layout.hand.slot(held.index!, handCount + 1) : null,
    },
    seats,
    minis,
    felt,
    plate: {
      active:
        model.whose === "mine" &&
        (stage.kind === "placing" || stage.kind === "revealing"),
      count: handCount,
      chips: model.me ? chipsOf(input, model.me.id) : 0,
    },
    handFocus:
      mystery.slot ?? (model.whose === "mine" ? null : (hand?.gap ?? null)),
    bets: betTokens(input, felt, handCount, hand?.gap ?? null),
    gaps,
    betBar: bar,
    timer:
      placingMine && locked && total > 0
        ? { filled: Math.min(total, input.secondsLeft ?? total), total }
        : null,
  };
}
