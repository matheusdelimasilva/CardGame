import {
  useLayoutEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  crossedDragThreshold,
  dropIndex,
  edgeScroll,
} from "./hitster-placement";

interface PlacementRefs {
  card: RefObject<HTMLButtonElement>;
  home: RefObject<HTMLDivElement>;
  timeline: RefObject<HTMLDivElement>;
  gap: RefObject<HTMLDivElement>;
}

/** Captured pointers move the card; React owns only the tentative and preview boundaries. */
export function useSongPlacement(
  refs: PlacementRefs,
  selected: number | null,
  setSelected: Dispatch<SetStateAction<number | null>>,
  setPreview: Dispatch<SetStateAction<number | null>>,
  setDragging: Dispatch<SetStateAction<boolean>>,
  onTap: () => void,
) {
  const latest = useRef(selected);
  const tap = useRef(onTap);
  const reposition = useRef<(() => void) | null>(null);
  const {
    card: cardRef,
    home: homeRef,
    timeline: timelineRef,
    gap: gapRef,
  } = refs;
  useLayoutEffect(() => {
    latest.current = selected;
    tap.current = onTap;
  }, [selected, onTap]);
  useLayoutEffect(() => {
    const card = cardRef.current;
    const timeline = timelineRef.current;
    if (!card || !timeline) return;
    let drag: {
      id: number;
      x: number;
      y: number;
      dx: number;
      dy: number;
      startX: number;
      startY: number;
      active: boolean;
    } | null = null;
    let frame: number | null = null;
    let until = 0;
    let previous = 0;
    let suppressPointerClick = false;
    let clickReset: ReturnType<typeof setTimeout> | null = null;
    const position = (x: number, y: number) => {
      card.style.setProperty("--drag-x", `${x}px`);
      card.style.setProperty("--drag-y", `${y}px`);
    };
    const inside = (x: number, y: number) => {
      const box = timeline.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    };
    const indexAt = (x: number) =>
      dropIndex(
        x,
        [...timeline.querySelectorAll<HTMLElement>("[data-timeline-card]")].map(
          (el) => {
            const box = el.getBoundingClientRect();
            return box.left + box.width / 2;
          },
        ),
      );
    const align = () => {
      const anchor = latest.current === null ? homeRef.current : gapRef.current;
      if (!anchor) return;
      const box = anchor.getBoundingClientRect();
      position(box.left, box.top);
      const bounds = timeline.getBoundingClientRect();
      card.style.clipPath =
        latest.current === null
          ? "none"
          : `inset(-18px ${Math.max(0, box.right - bounds.right)}px -18px ${Math.max(0, bounds.left - box.left)}px)`;
    };
    const tick = (time: number) => {
      frame = null;
      if (drag?.active) {
        position(drag.x - drag.dx, drag.y - drag.dy);
        const over = inside(drag.x, drag.y);
        if (over) {
          const bounds = timeline.getBoundingClientRect();
          timeline.scrollLeft +=
            (edgeScroll(drag.x, bounds.left, bounds.right) *
              Math.min(32, time - previous || 16)) /
            16;
        }
        setPreview(over ? indexAt(drag.x) : null);
      } else align();
      previous = time;
      if (drag?.active || time < until) frame = requestAnimationFrame(tick);
    };
    const animate = () => {
      until = performance.now() + 650;
      if (frame === null) frame = requestAnimationFrame(tick);
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      event.preventDefault();
      card.focus({ preventScroll: true });
      const box = card.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dx: event.clientX - box.left,
        dy: event.clientY - box.top,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      };
      card.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (
        !drag.active &&
        crossedDragThreshold(drag.x - drag.startX, drag.y - drag.startY)
      ) {
        drag.active = true;
        card.classList.add("is-dragging");
        card.classList.remove("is-returning");
        card.style.clipPath = "none";
        setDragging(true);
        animate();
      }
    };
    const finish = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      if (event.type === "pointerup") move(event);
      suppressPointerClick = true;
      if (clickReset !== null) clearTimeout(clickReset);
      clickReset = setTimeout(() => {
        suppressPointerClick = false;
        clickReset = null;
      }, 0);
      const placed =
        drag.active &&
        event.type === "pointerup" &&
        inside(event.clientX, event.clientY);
      const tapped = !drag.active && event.type === "pointerup";
      if (drag.active) setSelected(placed ? indexAt(event.clientX) : null);
      drag = null;
      setPreview(null);
      setDragging(false);
      card.classList.remove("is-dragging");
      card.classList.toggle("is-returning", !placed);
      if (card.hasPointerCapture(event.pointerId))
        card.releasePointerCapture(event.pointerId);
      if (tapped) tap.current();
      animate();
    };
    const suppressClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!suppressPointerClick || event.detail === 0) tap.current();
      suppressPointerClick = false;
    };
    card.addEventListener("click", suppressClick);
    card.addEventListener("pointerdown", down);
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);
    card.addEventListener("lostpointercapture", finish);
    reposition.current = animate;
    window.addEventListener("scroll", animate, true);
    window.addEventListener("resize", animate);
    align();
    card.getBoundingClientRect();
    card.classList.add("is-ready");
    animate();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (clickReset !== null) clearTimeout(clickReset);
      card.removeEventListener("pointerdown", down);
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", finish);
      card.removeEventListener("pointercancel", finish);
      card.removeEventListener("lostpointercapture", finish);
      card.removeEventListener("click", suppressClick);
      reposition.current = null;
      window.removeEventListener("scroll", animate, true);
      window.removeEventListener("resize", animate);
      card.classList.remove("is-ready", "is-dragging");
      if (drag && card.hasPointerCapture(drag.id))
        card.releasePointerCapture(drag.id);
    };
  }, [
    cardRef,
    homeRef,
    timelineRef,
    gapRef,
    setSelected,
    setPreview,
    setDragging,
  ]);
  useLayoutEffect(() => {
    reposition.current?.();
  }, [selected]);
}
