/** Outlines every position game/layout.ts computes, so the geometry can be reviewed by eye. */
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  CHAT_BOX,
  DECK_BOX,
  DISCARD_EXIT,
  DROP_ZONE,
  GOAL_LABEL_BOX,
  HAND_BAND,
  HAND_CARD,
  MAX_OPPONENTS,
  MINI_CARD,
  MYSTERY_DEAL,
  MYSTERY_HOME,
  PLATE,
  SEAT_CARD,
  STAGE,
  STATUS_BOX,
  TABLE_BOX,
  TIMELINE_ARROW_BOX,
  boxStyle,
  decadeColor,
  feltGapBox,
  feltLayout,
  feltTimeline,
  handCardWithGap,
  handSlot,
  miniTimeline,
  opponentSpots,
  placeAt,
  u,
} from "../layout";
import type { Box, Point } from "../types";
import type { GallerySection } from "./types";

const YEARS = [
  1958, 1965, 1972, 1977, 1983, 1988, 1995, 2003, 2011, 2019, 2022,
];

function Outline({
  box,
  color,
  label,
  dashed,
}: {
  box: Box;
  color: string;
  label?: string;
  dashed?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        ...boxStyle(box),
        boxSizing: "border-box",
        border: `1px ${dashed ? "dashed" : "solid"} ${color}`,
        color,
        font: `400 ${u(1.1)}/1 var(--mono)`,
        padding: u(0.2),
        overflow: "hidden",
      }}
    >
      {label}
    </div>
  );
}

/** A card outline centred on `at`, the way components will place cards. */
function CardOutline({
  at,
  size,
  scale = 1,
  color,
  label,
  fill,
}: {
  at: Point & { r?: number };
  size: { w: number; h: number };
  scale?: number;
  color: string;
  label: ReactNode;
  fill?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: u(size.w),
        height: u(size.h),
        boxSizing: "border-box",
        border: `2px solid ${color}`,
        borderRadius: u(0.4),
        background: fill ?? "rgba(20, 22, 23, 0.35)",
        display: "grid",
        placeItems: "center",
        color: "#141617",
        font: `400 ${u(1.1)}/1 var(--mono)`,
        transform: placeAt(at, size, scale),
      }}
    >
      {label}
    </div>
  );
}

function VLine({
  x,
  color,
  label,
}: {
  x: number;
  color: string;
  label: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: u(x),
        top: 0,
        height: u(STAGE.h),
        borderLeft: `1px dotted ${color}`,
        color,
        font: `400 ${u(1)}/1 var(--mono)`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

const panel: CSSProperties = {
  position: "absolute",
  left: 8,
  bottom: 8,
  zIndex: 10,
  display: "grid",
  gridTemplateColumns: "auto auto auto",
  gap: "4px 8px",
  alignItems: "center",
  padding: "8px 10px",
  background: "rgba(20, 22, 23, 0.85)",
  color: "#fffaf0",
  borderRadius: 6,
  font: "500 12px/1.2 Rubik, sans-serif",
};

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <span>{value}</span>
    </>
  );
}

function LayoutPreview() {
  const [opponents, setOpponents] = useState(5);
  const [hand, setHand] = useState(9);
  const [gap, setGap] = useState(-1);
  const [activeLength, setActiveLength] = useState(9);
  const [otherLength, setOtherLength] = useState(9);
  const [placed, setPlaced] = useState(true);

  const spots = opponentSpots(opponents);
  const handGap = gap < 0 ? null : Math.min(gap, hand);
  const felt = feltTimeline(
    activeLength,
    placed ? Math.min(activeLength, 3) : null,
  );
  const feltRange = feltLayout(activeLength).range;
  const status = feltLayout(activeLength).status;

  return (
    <>
      <div className="gs-stage" style={{ outline: "1px solid #fffaf088" }}>
        <Outline box={TABLE_BOX} color="#14161788" label="table" />
        <Outline box={DECK_BOX} color="#ef4a3c" label="deck" />
        <Outline box={GOAL_LABEL_BOX} color="#fffaf0" label="goal label" />
        <Outline box={DROP_ZONE} color="#ffd84a" label="drop zone" dashed />
        <Outline
          box={TIMELINE_ARROW_BOX}
          color="#fffaf0"
          label="older → newer"
        />
        <Outline box={CHAT_BOX} color="#9b7bff" label="chat" />
        <Outline
          box={{
            x: PLATE.x,
            y: STAGE.h - PLATE.bottom - 6,
            w: PLATE.w,
            h: 6,
          }}
          color="#fffaf0"
          label="plate (widest)"
          dashed
        />
        <Outline
          box={{ ...STATUS_BOX.mine, y: STATUS_BOX.mine.y - 5, h: 10 }}
          color="#45c486"
          label="status: mine"
          dashed
        />
        {status === "opponent" ? (
          <Outline
            box={{
              ...STATUS_BOX.opponent,
              y: STATUS_BOX.opponent.y - 5,
              h: 10,
            }}
            color="#33cccc"
            label="status: opponent"
            dashed
          />
        ) : (
          <Outline
            box={{ ...STATUS_BOX.under, h: 8 }}
            color="#33cccc"
            label="status: under the felt line"
            dashed
          />
        )}
        <VLine x={HAND_BAND.min} color="#ffd84a" label="hand min" />
        <VLine x={HAND_BAND.max} color="#ffd84a" label="hand max" />
        <VLine x={feltRange.min} color="#ff6fae" label="felt min" />
        <VLine x={feltRange.max} color="#ff6fae" label="felt max" />

        <CardOutline
          at={MYSTERY_HOME}
          size={HAND_CARD}
          color="#fffaf0"
          label="mystery"
        />
        <CardOutline
          at={MYSTERY_DEAL}
          size={HAND_CARD}
          color="#fffaf0"
          label="deal"
        />
        <CardOutline
          at={DISCARD_EXIT}
          size={HAND_CARD}
          color="#ef4a3c"
          label="exit"
        />

        {spots.map((spot, i) => {
          const active = i === 0;
          return (
            <div key={i}>
              <Outline box={spot.lane} color="#fffaf055" dashed />
              <CardOutline
                at={spot.seat}
                size={SEAT_CARD}
                scale={spot.scale * (active ? 1.12 : 1)}
                color={active ? "#ffd84a" : "#fffaf0"}
                fill="#fffaf0"
                label={`seat ${i + 1}`}
              />
              <Outline
                box={{
                  x: spot.tokens.x,
                  y: spot.tokens.y,
                  w: 1.7 * 4 * spot.scale,
                  h: 1.7 * spot.scale,
                }}
                color="#ffd84a"
                dashed
              />
              {!active &&
                miniTimeline(spot, otherLength).map((p, j) => (
                  <CardOutline
                    key={j}
                    at={p}
                    size={MINI_CARD}
                    scale={spot.scale}
                    color="#141617"
                    fill={decadeColor(YEARS[j]!)}
                    label={j + 1}
                  />
                ))}
            </div>
          );
        })}

        {!placed &&
          Array.from({ length: activeLength + 1 }, (_, g) => (
            <Outline
              key={g}
              box={feltGapBox(g, activeLength)}
              color="#fffaf0"
              dashed
            />
          ))}
        {felt.map((p, k) => {
          const isPlaced = placed && k === Math.min(activeLength, 3);
          return (
            <CardOutline
              key={k}
              at={p}
              size={MINI_CARD}
              scale={p.scale}
              color={isPlaced ? "#ffd84a" : "#141617"}
              fill={
                isPlaced ? "#1c1e20" : decadeColor(YEARS[k % YEARS.length]!)
              }
              label={isPlaced ? "?" : k + 1}
            />
          );
        })}

        {Array.from({ length: hand }, (_, i) => {
          const at = handCardWithGap(i, hand, handGap);
          return (
            <CardOutline
              key={i}
              at={at}
              size={HAND_CARD}
              scale={at.scale}
              color="#141617"
              fill={decadeColor(YEARS[i]!)}
              label={i + 1}
            />
          );
        })}
        {handGap !== null && (
          <CardOutline
            at={handSlot(handGap, hand + 1)}
            size={HAND_CARD}
            scale={handSlot(handGap, hand + 1).scale}
            color="#ffd84a"
            fill="rgba(255, 216, 74, 0.25)"
            label="slot"
          />
        )}
      </div>
      <div style={panel}>
        <Slider
          label="Opponents"
          value={opponents}
          min={1}
          max={MAX_OPPONENTS}
          onChange={setOpponents}
        />
        <Slider
          label="Hand cards"
          value={hand}
          min={0}
          max={10}
          onChange={setHand}
        />
        <Slider
          label="Insert at (-1 none)"
          value={gap}
          min={-1}
          max={hand}
          onChange={setGap}
        />
        <Slider
          label="Active timeline"
          value={activeLength}
          min={0}
          max={10}
          onChange={setActiveLength}
        />
        <Slider
          label="Other timelines"
          value={otherLength}
          min={0}
          max={10}
          onChange={setOtherLength}
        />
        <span>Placed card</span>
        <input
          type="checkbox"
          checked={placed}
          onChange={(e) => setPlaced(e.target.checked)}
          aria-label="Show the placed card on the felt"
        />
        <span />
      </div>
    </>
  );
}

const section: GallerySection = {
  title: "Layout: every computed position",
  fullscreen: true,
  render: () => <LayoutPreview />,
};
export default section;
