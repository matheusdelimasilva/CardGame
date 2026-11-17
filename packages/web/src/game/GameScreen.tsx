/**
 * The Hitster game screen: header, the stage, the chat, and the overlays,
 * for one running (or just finished) game. The server's state comes in as
 * `room`; the beats inside each state (choreography.ts) and the viewer's
 * unsent placement (placement.ts) are kept here and turned into a Scene.
 */
import type { ChatMessage, ClientMessage, RoomView } from "@cardgame/protocol";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { TrackAudio } from "../audio";
import { seatLook } from "../ui/seats";
import type { Connection } from "../useRoom";
import { ChatPanel, chatLines } from "./ChatPanel";
import { MePlate, ViewerPlate } from "./cards";
import { useBeat } from "./choreography";
import { GameHeader, SoundToggle } from "./Header";
import { gameModel, ranking, statusText } from "./model";
import {
  ConnectionBanner,
  FinalScores,
  PlayerMenu,
  RoundNote,
  SoundPrompt,
} from "./Overlays";
import {
  freshPlacement,
  placementReducer,
  type PlacementAction,
  type PlacementMove,
} from "./placement";
import { dealCount, scene as buildScene } from "./scene";
import { Stage, type MysteryActions } from "./Stage";
import type { GameModel } from "./types";
import { useSecondsLeft } from "./useSecondsLeft";
import { useStageLayout } from "./useStageLayout";
import "./game.css";

/** With no answer from the server this long after "Lock it in", the player may press it again. */
export const LOCK_RETRY_MS = 6000;

export interface GameScreenProps {
  room: RoomView;
  connection: Connection;
  /** The latest refusal or error from the server, cleared after a while. */
  error: string | null;
  chats: readonly ChatMessage[];
  send: (message: ClientMessage) => void;
  audio: TrackAudio;
  onLeave: () => void;
  /** "Back to lobby" on the final scores. */
  onBackToLobby: () => void;
  /** Drawn over everything, such as the name prompt. */
  children?: ReactNode;
}

/** The plate for a viewer who is not in this game. */
function viewerPlate(
  room: RoomView,
  connection: Connection,
  send: GameScreenProps["send"],
) {
  const { you } = room;
  if (!you.name) return null;
  const online = connection === "open";
  if (you.seat !== null)
    return (
      <ViewerPlate
        name={you.name}
        animal={seatLook(you.seat, true).animal}
        note="You join the next game."
        action={
          online
            ? { label: "Stand up", onClick: () => send({ type: "stand" }) }
            : null
        }
      />
    );
  const open = room.seats.findIndex((s) => s === null);
  return (
    <ViewerPlate
      name={you.name}
      animal={seatLook(null).animal}
      note={
        open < 0
          ? "Watching. The table is full."
          : "Watching. Take a seat to join the next game."
      }
      action={
        open >= 0 && online
          ? {
              label: "Take a seat",
              onClick: () => send({ type: "sit", seat: open }),
            }
          : null
      }
    />
  );
}

/** Spectators, and seated people sitting this game out. */
function watchers(room: RoomView): string[] {
  return [
    ...room.spectators.map((s) => s.name),
    ...room.seats.flatMap((s) => (s && !s.inGame ? [s.name] : [])),
  ];
}

export function GameScreen(props: GameScreenProps) {
  const model = gameModel(props.room);
  if (!model) return null;
  return <GameTable {...props} model={model} />;
}

function GameTable({
  room,
  model,
  connection,
  error,
  chats,
  send,
  audio,
  onLeave,
  onBackToLobby,
  children,
}: GameScreenProps & { model: GameModel }) {
  const game = room.game!;
  const stage = model.stage;
  const beat = useBeat(model, dealCount(model));
  const root = useRef<HTMLDivElement>(null);
  const { shape, layout } = useStageLayout(root, model.opponents.length);
  const [help, setHelp] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // The viewer's own turn, by its song: a new song starts a fresh placement.
  const turn =
    stage.kind === "placing" && model.whose === "mine" ? stage.song.id : null;
  const [stored, dispatch] = useReducer(placementReducer, null, () =>
    freshPlacement(null),
  );
  const placement =
    turn !== null && stored.turn !== turn ? freshPlacement(turn) : stored;
  const act = (action: PlacementMove) => {
    if (turn !== null) dispatch({ ...action, turn } as PlacementAction);
  };
  // Guards against a second press before React has drawn the first.
  const lockedFor = useRef<string | null>(null);

  // A refusal arrives as an error while the state stays put: unlock the card.
  const sent = placement.sent;
  useEffect(() => {
    if (!sent || turn === null) return;
    const refused = error !== null && error !== sent.error;
    const id = setTimeout(
      () => {
        lockedFor.current = null;
        dispatch({ type: "refused", turn });
      },
      refused ? 0 : LOCK_RETRY_MS,
    );
    return () => clearTimeout(id);
  }, [sent, error, turn]);

  const handCount = model.me ? (model.timelines[model.me.id]?.length ?? 0) : 0;
  const tap = () => {
    if (!audio.muted) audio.toggle();
  };
  const lock = () => {
    if (
      turn === null ||
      lockedFor.current === turn ||
      placement.index === null ||
      placement.held ||
      placement.sent
    )
      return;
    lockedFor.current = turn;
    act({ type: "send", error });
    send({ type: "move", move: { type: "place", index: placement.index } });
  };
  const actions: MysteryActions = {
    onGrab: () => act({ type: "grab" }),
    onHover: (index) => act({ type: "hover", index }),
    onDrop: (index) => act({ type: "drop", index }),
    onStep: (direction) => act({ type: "step", direction, count: handCount }),
    onHome: () => act({ type: "home" }),
    onLock: lock,
    onTap: tap,
  };

  const scene = buildScene({ model, beat, placement, layout });
  const introSeconds = useSecondsLeft(
    stage.kind === "intro" ? game.pause : null,
  );
  const menuPlayer = model.opponents.find((p) => p.id === menuFor) ?? null;
  const over = stage.kind === "over";
  const { headline, sub } = statusText(model);

  const lines = chatLines(chats);
  const toggleSound = () => audio.setMuted(!audio.muted);

  return (
    <div
      ref={root}
      className={`game-screen${shape.kind === "portrait" ? " is-portrait" : ""}`}
      style={
        shape.kind === "portrait"
          ? ({ "--u": `${shape.unit}px` } as CSSProperties)
          : undefined
      }
    >
      <GameHeader
        code={room.code}
        gameName={room.gameInfo.name}
        watchers={watchers(room)}
        soundOn={!audio.muted}
        withSound={!layout.tools}
        onLeave={onLeave}
        onToggleSound={toggleSound}
        onInstructions={() => setHelp(true)}
      />
      <Stage
        scene={scene}
        layout={layout}
        goal={model.goal}
        playing={audio.status === "playing"}
        actions={actions}
        onSeat={
          model.viewerIsHost ? (player) => setMenuFor(player.id) : undefined
        }
        chat={
          <ChatPanel
            lines={lines}
            canSend={connection === "open" && !!room.you.name}
            named={!!room.you.name}
            onSend={(text) => send({ type: "chat", text })}
          />
        }
        chatCount={lines.length}
        tools={<SoundToggle on={!audio.muted} onToggle={toggleSound} />}
        plate={
          model.me ? (
            <MePlate
              player={model.me}
              count={scene.plate.count}
              goal={model.goal}
              active={scene.plate.active}
            />
          ) : (
            viewerPlate(room, connection, send)
          )
        }
      />

      {connection === "reconnecting" && <ConnectionBanner />}
      {audio.status === "blocked" && <SoundPrompt onTurnOn={audio.toggle} />}

      {stage.kind === "intro" && (
        <RoundNote mode="intro" goal={model.goal} secondsLeft={introSeconds} />
      )}
      {help && stage.kind !== "intro" && !over && (
        <RoundNote
          mode="help"
          goal={model.goal}
          onClose={() => setHelp(false)}
        />
      )}
      {over && (
        <FinalScores
          headline={headline}
          sub={sub}
          rows={ranking(model)}
          goal={model.goal}
          isHost={room.you.isHost}
          celebrate={model.winners.some((p) => p.isMe)}
          onPlayAgain={() => send({ type: "start" })}
          onBackToLobby={onBackToLobby}
        />
      )}
      {menuPlayer && (
        <PlayerMenu
          player={menuPlayer}
          running={!over}
          playing
          theirTurn={game.active.includes(menuPlayer.id)}
          onSkip={() => send({ type: "skip", playerId: menuPlayer.id })}
          onRemove={() => send({ type: "kick", playerId: menuPlayer.id })}
          onEndGame={() => send({ type: "endGame" })}
          onClose={() => setMenuFor(null)}
        />
      )}
      {children}
      {error && (
        <div className="toast" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
