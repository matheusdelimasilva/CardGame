import {
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { crossedDragThreshold, dropTarget } from "./placement";
import type { Point } from "./types";

export interface MysteryDragOptions {
  /** The .gs-stage element: pointer positions are converted to its units. */
  stage: RefObject<HTMLElement>;
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
  start: { x: number; y: number };
  /** The pointer's offset from the card's centre, in stage units. */
  offset: Point;
  dragging: boolean;
  target: number | null;
}

/** Client coordinates in stage units, from the stage's box (the design's toU). */
function toStage(stage: HTMLElement, x: number, y: number): Point {
  const box = stage.getBoundingClientRect();
  const unit = box.width / 100;
  return { x: (x - box.left) / unit, y: (y - box.top) / unit };
}

/**
 * Pointer handling for the mystery card, for mouse, touch and pen alike.
 * The held card follows the pointer through two custom properties on the
 * card itself (--gs-held-x/y, in stage units), so a move re-renders nothing;
 * React hears only when the card is picked up, crosses into another slot,
 * and is let go.
 */
export function useMysteryDrag(options: MysteryDragOptions) {
  const press = useRef<Press | null>(null);

  const follow = (card: HTMLElement, centre: Point) => {
    card.style.setProperty("--gs-held-x", String(centre.x));
    card.style.setProperty("--gs-held-y", String(centre.y));
  };

  const end = (event: ReactPointerEvent<HTMLElement>, dropped: boolean) => {
    const current = press.current;
    if (current?.pointer !== event.pointerId) return;
    press.current = null;
    const card = event.currentTarget;
    if (card.hasPointerCapture?.(event.pointerId))
      card.releasePointerCapture(event.pointerId);
    if (current.dragging) options.onDrop(dropped ? current.target : null);
    else if (dropped) options.onTap();
  };

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      const stage = options.stage.current;
      if (!event.isPrimary || event.button !== 0 || press.current || !stage)
        return;
      const card = event.currentTarget;
      // Focus for the keys, without the keyboard focus ring a pointer does not need.
      card.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
      card.setPointerCapture(event.pointerId);
      const box = card.getBoundingClientRect();
      const centre = toStage(
        stage,
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      const at = toStage(stage, event.clientX, event.clientY);
      press.current = {
        pointer: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        offset: { x: at.x - centre.x, y: at.y - centre.y },
        dragging: false,
        target: null,
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
      const at = toStage(stage, event.clientX, event.clientY);
      const centre = { x: at.x - current.offset.x, y: at.y - current.offset.y };
      // Position first, so the card is already under the pointer when React draws it held.
      follow(event.currentTarget, centre);
      if (grabbing) {
        current.dragging = true;
        options.onGrab();
      }
      const target = dropTarget(centre, options.handCount);
      if (target !== current.target) {
        current.target = target;
        options.onHover(target);
      }
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
