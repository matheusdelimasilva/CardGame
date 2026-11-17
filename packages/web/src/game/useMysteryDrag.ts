import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { StageLayout } from "./layout";
import { crossedDragThreshold, dropTarget } from "./placement";
import type { Point } from "./types";
import type { HandScroller } from "./useHandScroll";

export interface MysteryDragOptions {
  /** The .gs-stage element: pointer positions are converted to its units. */
  stage: RefObject<HTMLElement>;
  layout: StageLayout;
  /** The hand's scroll, which a card held near the hand's edge moves. */
  scroller: HandScroller;
  /** False: a press can only be a tap. */
  draggable: boolean;
  /** Cards in the viewer's hand, for the slot under the card. */
  handCount: number;
  onGrab: () => void;
  /** The held card moved over another slot, or off the hand (null). */
  onHover: (index: number | null) => void;
  /** Let go over a slot, or elsewhere (null), or the drag was cancelled (null). */
  onDrop: (index: number | null) => void;
  /** A press that did not move: pause or resume the song. */
  onTap: () => void;
}

interface Press {
  pointer: number;
  card: HTMLElement;
  start: { x: number; y: number };
  /** The pointer's offset from the card's centre, in stage units. */
  offset: Point;
  dragging: boolean;
  target: number | null;
  /** The held card's centre, in stage units. */
  centre: Point;
  /** Auto-scroll speed while held near the hand's edge, units per second. */
  speed: number;
  frame: number | null;
}

/** Client coordinates in stage units, from the stage's box (the design's toU). */
function toStage(
  stage: HTMLElement,
  stageWidth: number,
  x: number,
  y: number,
): Point {
  const box = stage.getBoundingClientRect();
  const unit = box.width / stageWidth;
  return { x: (x - box.left) / unit, y: (y - box.top) / unit };
}

/** Frames longer than this (a background tab, a stall) scroll as if they were this long. */
const MAX_FRAME_MS = 50;

/**
 * Pointer handling for the mystery card, for mouse, touch and pen alike.
 * The held card follows the pointer through two custom properties on the
 * card itself (--gs-held-x/y, in stage units), so a move re-renders nothing;
 * React hears only when the card is picked up, crosses into another slot,
 * and is let go. Held over the hand near the edge of a hand that scrolls,
 * the card scrolls it, and the slot under the card follows.
 */
export function useMysteryDrag(options: MysteryDragOptions) {
  const press = useRef<Press | null>(null);
  // The auto-scroll loop outlives the render that started it.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const follow = (card: HTMLElement, centre: Point) => {
    card.style.setProperty("--gs-held-x", String(centre.x));
    card.style.setProperty("--gs-held-y", String(centre.y));
  };

  /** Re-reads the slot under the held card, for a move or a scroll under it. */
  const retarget = (current: Press) => {
    const { layout, handCount, scroller, onHover } = latest.current;
    const target = dropTarget(
      current.centre,
      handCount,
      layout,
      scroller.get(),
    );
    if (target !== current.target) {
      current.target = target;
      onHover(target);
    }
  };

  const stopScrolling = (current: Press) => {
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    current.frame = null;
  };

  const autoScroll = (current: Press) => {
    if (current.speed === 0) return stopScrolling(current);
    if (current.frame !== null) return;
    let last: number | null = null;
    const step = (now: number) => {
      if (press.current !== current || current.speed === 0) {
        current.frame = null;
        return;
      }
      const dt = Math.min(MAX_FRAME_MS, last === null ? 16 : now - last);
      last = now;
      latest.current.scroller.by((current.speed * dt) / 1000);
      retarget(current);
      current.frame = requestAnimationFrame(step);
    };
    current.frame = requestAnimationFrame(step);
  };

  const end = (event: ReactPointerEvent<HTMLElement>, dropped: boolean) => {
    const current = press.current;
    if (current?.pointer !== event.pointerId) return;
    press.current = null;
    stopScrolling(current);
    const card = event.currentTarget;
    if (card.hasPointerCapture?.(event.pointerId))
      card.releasePointerCapture(event.pointerId);
    if (current.dragging) options.onDrop(dropped ? current.target : null);
    else if (dropped) options.onTap();
  };

  // A card taken away mid-press (a new turn) lets go of the pointer and stops scrolling.
  useEffect(
    () => () => {
      const current = press.current;
      if (!current) return;
      press.current = null;
      stopScrolling(current);
      if (current.card.hasPointerCapture?.(current.pointer))
        current.card.releasePointerCapture(current.pointer);
    },
    [],
  );

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      const stage = options.stage.current;
      if (!event.isPrimary || event.button !== 0 || press.current || !stage)
        return;
      const card = event.currentTarget;
      const width = options.layout.stage.w;
      // Focus for the keys, without the keyboard focus ring a pointer does not need.
      card.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      card.setPointerCapture(event.pointerId);
      const box = card.getBoundingClientRect();
      const centre = toStage(
        stage,
        width,
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      const at = toStage(stage, width, event.clientX, event.clientY);
      press.current = {
        pointer: event.pointerId,
        card,
        start: { x: event.clientX, y: event.clientY },
        offset: { x: at.x - centre.x, y: at.y - centre.y },
        dragging: false,
        target: null,
        centre,
        speed: 0,
        frame: null,
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const current = press.current;
      const stage = options.stage.current;
      if (current?.pointer !== event.pointerId || !stage) return;
      const grabbing =
        !current.dragging &&
        options.draggable &&
        crossedDragThreshold(
          event.clientX - current.start.x,
          event.clientY - current.start.y,
        );
      if (!current.dragging && !grabbing) return;
      const at = toStage(
        stage,
        options.layout.stage.w,
        event.clientX,
        event.clientY,
      );
      current.centre = {
        x: at.x - current.offset.x,
        y: at.y - current.offset.y,
      };
      // Position first, so the card is already under the pointer when React draws it held.
      follow(event.currentTarget, current.centre);
      if (grabbing) {
        current.dragging = true;
        options.scroller.stop();
        options.onGrab();
      }
      retarget(current);
      // The pointer, not the card, is what the player pushes against the edge.
      current.speed =
        current.target === null ? 0 : options.layout.hand.edgeSpeed(at.x);
      autoScroll(current);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      end(event, true);
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      end(event, false);
    },
    onLostPointerCapture(event: ReactPointerEvent<HTMLElement>) {
      end(event, false);
    },
  };
}
