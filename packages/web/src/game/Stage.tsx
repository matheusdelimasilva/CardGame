/**
 * The table itself, drawn from a Scene: the felt, the deck, the status, the
 * opponents and their timelines, the viewer's hand and the mystery card.
 * Everything is placed in stage units; nothing here decides where a card
 * goes, it only draws where scene() put it.
 */
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Deck,
  MiniCard,
  MysteryCard,
  SeatCard,
  SongCard,
  useFitText,
} from "./cards";
import {
  HAND_CARD,
  MINI_CARD,
  SEAT_CARD,
  boxStyle,
  placeAt,
  u,
  type StageLayout,
} from "./layout";
import type {
  FeltScene,
  HandCardScene,
  MiniScene,
  MysteryScene,
  Scene,
} from "./scene";
import type { Box, TablePlayer } from "./types";
import { useHandScroll, type HandScroller } from "./useHandScroll";
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
function Table({ box }: { box: Box }) {
  return (
    <div className="gs-table" style={boxStyle(box)} aria-hidden="true">
      <div className="gs-rail" />
      <div className="gs-pinstripe" />
      <div className="gs-felt">
        <div className="gs-felt-line" />
      </div>
    </div>
  );
}

function Status({
  scene,
  layout,
  onLock,
}: {
  scene: Scene;
  layout: StageLayout;
  onLock: () => void;
}) {
  const place = scene.statusBox;
  const spot = layout.status[place];
  const { headline, sub } = scene.status;
  // The spot's position is in the key: text is measured again where it moves to.
  const where = `${layout.kind}\n${place}`;
  const headlineRef = useFitText<HTMLHeadingElement>(
    `${where}\n${headline}`,
    spot.lines.headline,
    0.6,
  );
  const subRef = useFitText<HTMLParagraphElement>(
    `${where}\n${sub}`,
    spot.lines.sub,
    0.75,
  );
  return (
    <div
      className={cx("gs-status", `is-${spot.anchor}`, `is-${spot.align}`)}
      style={{ left: u(spot.x), top: u(spot.y), width: u(spot.w) }}
      aria-live="polite"
    >
      <h1 ref={headlineRef}>{headline}</h1>
      {sub && <p ref={subRef}>{sub}</p>}
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

function DropZone({ zone, box }: { zone: Scene["dropZone"]; box: Box }) {
  return (
    <div
      className={cx(
        "gs-drop-zone",
        zone.visible && "is-visible",
        zone.over && "is-over",
      )}
      style={boxStyle(box)}
      aria-hidden="true"
    />
  );
}

/** The gold outline of the slot under a held card; in the hand's track, so it scrolls with it. */
function Slot({ slot }: { slot: Scene["dropZone"]["slot"] }) {
  return (
    <div
      className={cx("gs-placed gs-slot", slot && "is-visible")}
      style={
        slot ? { transform: placeAt(slot, HAND_CARD, slot.scale) } : undefined
      }
      aria-hidden="true"
    />
  );
}

/**
 * The strip a scrolling hand lies on, which a press pans; its edges fade
 * and point the way while cards are out of view (useHandScroll).
 */
function HandBand({ box }: { box: Box }) {
  return (
    <>
      <div className="gs-hand-band" style={boxStyle(box)} aria-hidden="true" />
      <div
        className="gs-hand-edge is-left"
        style={{ ...boxStyle(box), width: u(3) }}
        aria-hidden="true"
      >
        ‹
      </div>
      <div
        className="gs-hand-edge is-right"
        style={{ ...boxStyle(box), left: u(box.x + box.w - 3), width: u(3) }}
        aria-hidden="true"
      >
        ›
      </div>
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
  layout,
  scroller,
  actions,
}: {
  mystery: MysteryScene;
  playing: boolean;
  handCount: number;
  canLock: boolean;
  stage: RefObject<HTMLDivElement>;
  layout: StageLayout;
  scroller: HandScroller;
  actions: MysteryActions;
}) {
  const drag = useMysteryDrag({
    stage,
    layout,
    scroller,
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
    // The carrier scrolls with the hand while the card rests in it (see stage.css).
    <div
      className={cx("gs-mystery-carrier", `is-${mystery.motion}`)}
      style={{ "--gs-in-hand": mystery.slot === null ? 0 : 1 } as CSSProperties}
    >
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
    </div>
  );
}

/**
 * The chat where the layout has no room to keep it open (StageLayout.chat
 * drawer): a card over the top of the table, opened from a button in the
 * tools that shows a dot for messages not seen yet. It stays mounted while
 * closed, so a half-written message survives, and it closes itself when the
 * viewer's turn to place begins, leaving the table and the hand clear.
 */
function useChatDrawer(count: number, placing: boolean) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(count);
  const [wasPlacing, setWasPlacing] = useState(placing);
  if (placing !== wasPlacing) {
    setWasPlacing(placing);
    if (placing) setOpen(false);
  }
  if (open && seen !== count) setSeen(count);
  return { open, setOpen, unread: !open && count > seen };
}

export interface StageProps {
  scene: Scene;
  layout: StageLayout;
  goal: number;
  /** The song is audible: the face-down record spins. */
  playing: boolean;
  actions: MysteryActions;
  /** The host's player menu, from an opponent's seat card. */
  onSeat?: (player: TablePlayer) => void;
  chat: ReactNode;
  /** Chat lines so far, for the drawer's unread dot. */
  chatCount: number;
  /** The viewer's plate in the bottom-left corner. */
  plate: ReactNode;
  /** Buttons for the layout's tools corner, if it has one. */
  tools?: ReactNode;
}

export function Stage({
  scene,
  layout,
  goal,
  playing,
  actions,
  onSeat,
  chat,
  chatCount,
  plate,
  tools,
}: StageProps) {
  const stage = useRef<HTMLDivElement>(null);
  const handCount = scene.hand?.length ?? 0;
  const { scroller, handlers } = useHandScroll(
    stage,
    layout.hand,
    layout.stage.w,
    scene.handSlots,
    scene.mystery.slot,
  );
  const drawer = useChatDrawer(chatCount, scene.mystery.draggable);
  const chatId = useId();
  const view = scene.hand ? layout.hand.view : null;
  return (
    <div
      className="gs-stage"
      ref={stage}
      style={{ width: u(layout.stage.w), height: u(layout.stage.h) }}
      {...handlers}
    >
      <Table box={layout.table} />
      <Deck
        shuffling={scene.shuffling}
        className="gs-boxed"
        style={boxStyle(layout.deck)}
      />
      <div className="gs-goal" style={boxStyle(layout.goalLabel)}>
        FIRST TO {goal}
      </div>
      <Status scene={scene} layout={layout} onLock={actions.onLock} />
      <Seats scene={scene} goal={goal} onSeat={onSeat} />
      <Minis minis={scene.minis} />
      {scene.felt && <FeltTimeline felt={scene.felt} />}
      {scene.hand && (
        <div
          className="gs-ruler"
          style={boxStyle(layout.ruler)}
          aria-hidden="true"
        >
          <span>← older</span>
          <span className="gs-ruler-line" />
          <span>newer →</span>
        </div>
      )}
      {view && <HandBand box={view} />}
      <DropZone zone={scene.dropZone} box={layout.dropZone} />
      {/* Cards scrolled out of view stay off the stage, also where the window is wider. */}
      <div className="gs-hand-clip">
        <div className="gs-hand-track">
          <Slot slot={scene.dropZone.slot} />
          {scene.hand && <Hand cards={scene.hand} />}
        </div>
      </div>
      <Mystery
        mystery={scene.mystery}
        playing={playing}
        handCount={handCount}
        canLock={scene.lock === "ready"}
        stage={stage}
        layout={layout}
        scroller={scroller}
        actions={actions}
      />
      <div
        id={chatId}
        className={cx(
          "gs-chat-spot",
          layout.chat.drawer && "is-drawer",
          layout.chat.drawer && !drawer.open && "is-closed",
        )}
        style={boxStyle(layout.chat.box)}
        onKeyDown={
          layout.chat.drawer
            ? (event) => {
                if (event.key === "Escape") drawer.setOpen(false);
              }
            : undefined
        }
      >
        {chat}
      </div>
      {layout.tools && (
        <div className="gs-tools" style={boxStyle(layout.tools)}>
          {tools}
          {layout.chat.drawer && (
            <button
              className={cx(
                "tl-button gs-chat-toggle",
                drawer.open && "tl-gold",
              )}
              aria-expanded={drawer.open}
              aria-controls={chatId}
              aria-label={drawer.unread ? "Chat, new messages" : "Chat"}
              onClick={() => drawer.setOpen(!drawer.open)}
            >
              Chat
              {drawer.unread && (
                <span className="gs-chat-dot" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      )}
      {/* Beside a hand the plate keeps to its corner, so the hand can count on its width. */}
      <div
        className="gs-plate-spot"
        style={{
          left: u(layout.plate.x),
          bottom: u(layout.plate.bottom),
          maxWidth: scene.hand || layout.tools ? u(layout.plate.w) : undefined,
        }}
      >
        {plate}
      </div>
    </div>
  );
}
