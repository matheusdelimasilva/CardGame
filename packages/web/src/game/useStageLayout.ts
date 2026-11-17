import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { landscapeLayout, type StageLayout } from "./layout";
import { portraitLayout, stageShape, type StageShape } from "./portrait";

/**
 * The one place the screen's shape is decided: the game screen's own box
 * (not the window, so the dev gallery's frames get the shape they show) is
 * measured before paint and on every resize, and picks the landscape or
 * the portrait stage. Without a box to measure (tests) it is landscape.
 */
export function useStageLayout(
  root: RefObject<HTMLElement>,
  opponents: number,
): { shape: StageShape; layout: StageLayout } {
  // The window's size is the first guess (the screen fills it outside the
  // gallery): measuring the box would make the browser style the landscape
  // stage first, and its cards would then glide to their portrait places.
  const [size, setSize] = useState<{ w: number; h: number } | null>(() =>
    typeof window === "undefined"
      ? null
      : { w: window.innerWidth, h: window.innerHeight },
  );
  useLayoutEffect(() => {
    const el = root.current;
    if (!el?.getBoundingClientRect) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize((prev) => {
        if (prev && prev.w === width && prev.h === height) return prev;
        // A phone's keyboard shrinks the window while the chat is typed in:
        // the table holds still, and the keyboard covers its bottom anyway.
        const focused = document.activeElement;
        const typing = focused?.tagName === "INPUT" && el.contains(focused);
        if (prev && typing && prev.w === width && height < prev.h) return prev;
        return { w: width, h: height };
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);
  const shape: StageShape = size
    ? stageShape(size.w, size.h, opponents)
    : { kind: "landscape" };
  const portraitHeight = shape.kind === "portrait" ? shape.height : null;
  const layout = useMemo(
    () =>
      portraitHeight === null
        ? landscapeLayout(opponents)
        : portraitLayout(portraitHeight, opponents),
    [portraitHeight, opponents],
  );
  return { shape, layout };
}
