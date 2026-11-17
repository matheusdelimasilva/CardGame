/**
 * The table itself, drawn from a Scene: the felt, the deck, the status, the
 * opponents and their timelines, the viewer's hand and the mystery card.
 * Everything is placed in stage units; nothing here decides where a card
 * goes, it only draws where scene() put it.
 */
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Deck, MiniCard, MysteryCard, SeatCard, SongCard } from "./cards";
import {
  CHAT_BOX,
  DECK_BOX,
  DROP_ZONE,
  GOAL_LABEL_BOX,
  HAND_CARD,
  MINI_CARD,
  SEAT_CARD,
  STATUS_BOX,
  TABLE_BOX,
  TIMELINE_ARROW_BOX,
  boxStyle,
  placeAt,
  u,
} from "./layout";
import type {
  FeltScene,
  HandCardScene,
  MiniScene,
  MysteryScene,
  Scene,
} from "./scene";
import type { TablePlayer } from "./types";
import { useMysteryDrag } from "./useMysteryDrag";
import "./stage.css";

const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

/** What the viewer can do with the mystery card. */
export interface MysteryActions {
  onGrab: () => void;
  onHover: (index: number | null) => void;
  onDrop: (index: number | null) => void;
  /** Left or Right: the next slot that way. */
  onStep: (direction: -1 | 1) => void;
  /** Escape: back home. */
  onHome: () => void;
  onLock: () => void;
  /** Pause or resume the song. */
  onTap: () => void;
}

/** The oval table: black rail, red pinstripe, felt with a dashed inner line. */
function Table() {
  return (
    <div className="gs-table" style={boxStyle(TABLE_BOX)} aria-hidden="true">
      <div className="gs-rail" />
      <div className="gs-pinstripe" />
      <div className="gs-felt">
        <div className="gs-felt-line" />
      </div>
    </div>
  );
}

function Status({ scene, onLock }: { scene: Scene; onLock: () => void }) {
  const box = STATUS_BOX[scene.statusBox];
  return (
    <div
      className="gs-status"
      style={{ left: u(box.x), top: u(box.y), width: u(box.w) }}
      aria-live="polite"
    >
      <h1>{scene.status.headline}</h1>
      {scene.status.sub && <p>{scene.status.sub}</p>}
      {scene.lock !== "hidden" && (
        <button
          className="tl-button tl-gold gs-lock"
          disabled={scene.lock === "sending"}
          onClick={onLock}
        >
          Lock it in
        </button>
      )}
    </div>
  );
}

function Seats({
  scene,
  goal,
  onSeat,
}: {
  scene: Scene;
  goal: number;
  onSeat?: (player: TablePlayer) => void;
}) {
  return scene.seats.map((seat) => (
    <SeatCard
      key={seat.player.id}
      className="gs-placed gs-stage-seat"
      style={{ transform: placeAt(seat.at, SEAT_CARD, seat.scale) }}
      player={seat.player}
      count={seat.count}
      goal={goal}
      active={seat.active}
      tilt={seat.tilt}
      onClick={onSeat ? () => onSeat(seat.player) : undefined}
    />
  ));
}

function Minis({ minis }: { minis: MiniScene[] }) {
  // Seat cards say how many cards each player has; FeltTimeline reads the active one out.
  return (
    <div aria-hidden="true">
      {minis.map((mini) => (
        <div
          key={mini.key}
          className={cx(
            "gs-placed gs-mini-slot",
            `is-${mini.layer}`,
            `is-${mini.motion}`,
            !mini.dealt && "is-undealt",
          )}
          style={
            {
              transform: placeAt(mini.pose, MINI_CARD, mini.scale),
              "--gs-delay": `${mini.delayMs}ms`,
              "--gs-zoom": mini.zoom,
            } as CSSProperties
          }
        >
          <MiniCard year={mini.year} glow={mini.glow} />
        </div>
      ))}
    </div>
  );
}

/**
 * The active opponent's timeline on the felt. The cards themselves are
 * drawn with every other mini card (so they glide between the seat and the
 * felt); this is the felt's own layer, where things that belong to that
 * timeline alone (later, the betting gaps) go.
 */
function FeltTimeline({ felt }: { felt: FeltScene }) {
  return (
    <ol
      className="gs-visually-hidden"
      aria-label={`${felt.player.name}'s timeline`}
    >
      {felt.line.map((song) => (
        <li key={song.id}>{song.year}</li>
      ))}
    </ol>
  );
}

function Hand({ cards }: { cards: HandCardScene[] }) {
  return (
    <div role="list" aria-label="Your timeline, oldest first">
      {cards.map((card) => (
        <div
          key={card.song.id}
          role="listitem"
          className={cx(
            "gs-placed gs-hand-card",
            `is-${card.motion}`,
            !card.dealt && "is-undealt",
          )}
          style={
            {
              transform: placeAt(card.pose, HAND_CARD, card.scale),
              "--gs-delay": `${card.delayMs}ms`,
            } as CSSProperties
          }
        >
          <SongCard song={card.song} />
        </div>
      ))}
    </div>
  );
}

function DropZone({ zone }: { zone: Scene["dropZone"] }) {
  return (
    <>
      <div
        className={cx(
          "gs-drop-zone",
          zone.visible && "is-visible",
          zone.over && "is-over",
        )}
        style={boxStyle(DROP_ZONE)}
        aria-hidden="true"
      />
      <div
        className={cx("gs-placed gs-slot", zone.slot && "is-visible")}
        style={
          zone.slot ? { transform: placeAt(zone.slot, HAND_CARD) } : undefined
        }
        aria-hidden="true"
      />
    </>
  );
}

const HELD_TRANSFORM = (tilt: number, scale: number) =>
  `translate(calc(var(--u) * (var(--gs-held-x) - ${HAND_CARD.w / 2})), calc(var(--u) * (var(--gs-held-y) - ${HAND_CARD.h / 2}))) rotate(${tilt}deg) scale(${scale})`;

function mysteryLabel(mystery: MysteryScene, playing: boolean): string {
  const sound = playing ? "Tap to pause the song." : "Tap to play the song.";
  if (mystery.face)
    return `${mystery.face.title}, ${mystery.face.artist}, ${mystery.face.year}. ${sound}`;
  const known = [mystery.title, mystery.artist].filter(Boolean).join(", ");
  const card = known ? `Mystery song: ${known}.` : "Mystery song card.";
  return mystery.draggable
    ? `${card} Drag it into your timeline, or use the arrow keys to choose a spot and Enter to lock it in. Escape takes it back. ${sound}`
    : `${card} ${sound}`;
}

function Mystery({
  mystery,
  playing,
  handCount,
  canLock,
  stage,
  actions,
}: {
  mystery: MysteryScene;
  playing: boolean;
  handCount: number;
  canLock: boolean;
  stage: RefObject<HTMLDivElement>;
  actions: MysteryActions;
}) {
  const drag = useMysteryDrag({
    stage,
    draggable: mystery.draggable,
    handCount,
    onGrab: actions.onGrab,
    onHover: actions.onHover,
    onDrop: actions.onDrop,
    onTap: actions.onTap,
  });
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key;
    if (mystery.draggable && (key === "ArrowLeft" || key === "ArrowRight")) {
      event.preventDefault();
      actions.onStep(key === "ArrowLeft" ? -1 : 1);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (mystery.draggable && canLock) actions.onLock();
      else actions.onTap();
    } else if (mystery.draggable && key === "Escape") {
      event.preventDefault();
      actions.onHome();
    }
  };
  const transform =
    mystery.pose === "held"
      ? HELD_TRANSFORM(mystery.heldTilt, mystery.scale)
      : placeAt(mystery.pose, HAND_CARD, mystery.scale);
  return (
    <MysteryCard
      key={mystery.key}
      className={cx(
        "gs-placed gs-stage-mystery",
        `is-${mystery.motion}`,
        !mystery.visible && "is-hidden",
      )}
      style={{ transform }}
      song={mystery.face}
      revealed={mystery.face !== null}
      playing={playing && mystery.face === null}
      title={mystery.title}
      artist={mystery.artist}
      interactive={mystery.draggable}
      dragging={mystery.pose === "held"}
      correct={mystery.correct}
      role="button"
      tabIndex={mystery.visible ? 0 : -1}
      aria-hidden={mystery.visible ? undefined : true}
      aria-label={mysteryLabel(mystery, playing)}
      aria-keyshortcuts={
        mystery.draggable
          ? "ArrowLeft ArrowRight Enter Escape Space"
          : "Enter Space"
      }
      onKeyDown={onKeyDown}
      {...drag}
    />
  );
}

export interface StageProps {
  scene: Scene;
  goal: number;
  /** The song is audible: the face-down record spins. */
  playing: boolean;
  actions: MysteryActions;
  /** The host's player menu, from an opponent's seat card. */
  onSeat?: (player: TablePlayer) => void;
  chat: ReactNode;
  /** The viewer's plate in the bottom-left corner. */
  plate: ReactNode;
}

export function Stage({
  scene,
  goal,
  playing,
  actions,
  onSeat,
  chat,
  plate,
}: StageProps) {
  const stage = useRef<HTMLDivElement>(null);
  const handCount = scene.hand?.length ?? 0;
  return (
    <div className="gs-stage" ref={stage}>
      <Table />
      <Deck
        shuffling={scene.shuffling}
        className="gs-boxed"
        style={boxStyle(DECK_BOX)}
      />
      <div className="gs-goal" style={boxStyle(GOAL_LABEL_BOX)}>
        FIRST TO {goal}
      </div>
      <Status scene={scene} onLock={actions.onLock} />
      <Seats scene={scene} goal={goal} onSeat={onSeat} />
      <Minis minis={scene.minis} />
      {scene.felt && <FeltTimeline felt={scene.felt} />}
      {scene.hand && (
        <div
          className="gs-ruler"
          style={boxStyle(TIMELINE_ARROW_BOX)}
          aria-hidden="true"
        >
          <span>← older</span>
          <span className="gs-ruler-line" />
          <span>newer →</span>
        </div>
      )}
      <DropZone zone={scene.dropZone} />
      {scene.hand && <Hand cards={scene.hand} />}
      <Mystery
        mystery={scene.mystery}
        playing={playing}
        handCount={handCount}
        canLock={scene.lock === "ready"}
        stage={stage}
        actions={actions}
      />
      <div className="gs-chat-spot" style={boxStyle(CHAT_BOX)}>
        {chat}
      </div>
      <div className="gs-plate-spot">{plate}</div>
    </div>
  );
}
