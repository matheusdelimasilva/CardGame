import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { HandGeometry } from "./layout";

/** How the drag code moves the hand while a card is held near its edge. */
export interface HandScroller {
  /** The scroll, in stage units. */
  get(): number;
  /** Scrolls by `delta` units, within the hand's range; returns the scroll after. */
  by(delta: number): number;
  /** Stops a glide or a fling, so a drag starts from a hand that holds still. */
  stop(): void;
}

/** A flung hand slows to a stop this quickly (the time constant, in ms). */
const FLING_DECAY_MS = 325;
/** Slower than this, in units per second, it stops; a release slower than FLING_MIN does not fling. */
const FLING_STOP = 2;
const FLING_MIN = 10;
/** A press that moves this many pixels sideways pans the hand. */
const PAN_THRESHOLD_PX = 6;
/** Showing a slot or settling into range glides this long. */
const GLIDE_MS = 260;

/** One frame of a fling: how far it moves and how fast it is afterwards. */
export function flingStep(
  velocity: number,
  dtMs: number,
): { delta: number; velocity: number } {
  const after = velocity * Math.exp(-dtMs / FLING_DECAY_MS);
  // The distance is the decay's integral over the frame, so frame rate does not change how far it goes.
  return {
    delta: ((velocity - after) * FLING_DECAY_MS) / 1000,
    velocity: after,
  };
}

/** The glide's ease-out, from 0 to 1 over GLIDE_MS. */
export function glideAt(elapsedMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / GLIDE_MS));
  return 1 - (1 - t) ** 3;
}

const prefersReducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Pan {
  pointer: number;
  startX: number;
  startScroll: number;
  panning: boolean;
  last: { x: number; t: number };
  /** Units per second, positive scrolling towards newer cards. */
  velocity: number;
}

/**
 * Sideways scrolling for a hand too long for its strip (HandGeometry.view;
 * a layout without one never scrolls). The scroll lives in --gs-scroll on
 * the stage element, in stage units: the hand's track and a card resting in
 * the hand subtract it, so scrolling re-renders nothing and the card in its
 * slot moves with the cards around it in the same frame. The stage also
 * carries data-scrolls while the hand is too long to fit, and
 * data-more-left / data-more-right while cards are out of view.
 *
 * `slots` is how many slots the hand is laid out in; `show`, a slot to keep
 * in view (the mystery card's, once it rests in the hand).
 */
export function useHandScroll(
  stage: RefObject<HTMLElement>,
  hand: HandGeometry,
  /** The stage's width in units, to turn pixels into units. */
  stageWidth: number,
  slots: number,
  show: number | null,
) {
  const scroll = useRef(0);
  const max = useRef(0);
  const frame = useRef<number | null>(null);
  const pan = useRef<Pan | null>(null);
  const scrolls = hand.view !== null;

  const unitPx = () => {
    const el = stage.current;
    return el ? el.getBoundingClientRect().width / stageWidth : 1;
  };
  const apply = (value: number) => {
    const el = stage.current;
    scroll.current = Math.max(0, Math.min(max.current, value));
    if (!el) return scroll.current;
    el.style.setProperty("--gs-scroll", scroll.current.toFixed(3));
    el.toggleAttribute("data-scrolls", max.current > 0);
    el.toggleAttribute("data-more-left", scroll.current > 0.05);
    el.toggleAttribute("data-more-right", scroll.current < max.current - 0.05);
    return scroll.current;
  };
  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const glideTo = (target: number) => {
    stop();
    const from = scroll.current;
    const to = Math.max(0, Math.min(max.current, target));
    if (Math.abs(to - from) < 0.01 || prefersReducedMotion()) {
      apply(to);
      return;
    }
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const k = glideAt(now - start);
      apply(from + (to - from) * k);
      frame.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  };
  const fling = (velocity: number) => {
    stop();
    if (Math.abs(velocity) < FLING_MIN || prefersReducedMotion()) return;
    let v = velocity;
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last === null ? 16 : now - last;
      last = now;
      const next = flingStep(v, dt);
      v = next.velocity;
      const before = scroll.current;
      const after = apply(before + next.delta);
      frame.current =
        Math.abs(v) > FLING_STOP && after !== before
          ? requestAnimationFrame(step)
          : null;
    };
    frame.current = requestAnimationFrame(step);
  };

  // A longer or shorter hand changes the range; slide back into it rather than jump.
  useLayoutEffect(() => {
    if (!scrolls) return;
    max.current = hand.maxScroll(slots);
    if (scroll.current > max.current) glideTo(max.current);
    else apply(scroll.current);
    // glideTo and apply only touch refs and the stage element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand, slots, scrolls]);

  useEffect(() => {
    if (!scrolls || show === null) return;
    glideTo(hand.scrollToShow(scroll.current, show, slots));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand, show, slots, scrolls]);

  useEffect(() => stop, []);

  const scroller: HandScroller = {
    get: () => scroll.current,
    by: (delta) => apply(scroll.current + delta),
    stop,
  };

  /** Presses on the hand's strip or its cards pan it; anything else is left alone. */
  const onHand = (target: EventTarget) =>
    target instanceof Element &&
    target.closest(".gs-hand-track, .gs-hand-band") !== null;

  const handlers = {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (!scrolls || pan.current || !event.isPrimary || event.button !== 0)
        return;
      if (!onHand(event.target)) return;
      stop();
      pan.current = {
        pointer: event.pointerId,
        startX: event.clientX,
        startScroll: scroll.current,
        panning: false,
        last: { x: event.clientX, t: event.timeStamp },
        velocity: 0,
      };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const p = pan.current;
      if (p?.pointer !== event.pointerId) return;
      const dx = event.clientX - p.startX;
      if (!p.panning) {
        if (Math.abs(dx) < PAN_THRESHOLD_PX) return;
        p.panning = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      const px = unitPx();
      apply(p.startScroll - dx / px);
      const dt = event.timeStamp - p.last.t;
      if (dt > 0) {
        const v = (-(event.clientX - p.last.x) / px / dt) * 1000;
        // Smoothed, so one uneven event does not decide the fling.
        p.velocity = p.velocity * 0.3 + v * 0.7;
        p.last = { x: event.clientX, t: event.timeStamp };
      }
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      const p = pan.current;
      if (p?.pointer !== event.pointerId) return;
      pan.current = null;
      // A pause before letting go means no fling.
      if (p.panning && event.timeStamp - p.last.t < 80) fling(p.velocity);
    },
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      if (pan.current?.pointer === event.pointerId) pan.current = null;
    },
    onWheel(event: ReactWheelEvent<HTMLElement>) {
      if (!scrolls || !onHand(event.target)) return;
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      // Lines rather than pixels: a line is about 16px.
      const px = event.deltaMode === 1 ? delta * 16 : delta;
      stop();
      apply(scroll.current + px / unitPx());
    },
  };

  return { scroller, handlers };
}
