import { useEffect, useState } from "react";

/** The home scene is designed on a fixed 1200 x 760 stage. */
const STAGE_W = 1200;
const STAGE_H = 760;
/** Below this the stage's text gets too small to read; the screens stack. */
const MIN_SCALE = 0.62;
const MAX_SCALE = 1.35;

const measure = () => {
  const scale = Math.min(
    innerWidth / STAGE_W,
    innerHeight / STAGE_H,
    MAX_SCALE,
  );
  return { stage: innerWidth >= 760 && scale >= MIN_SCALE, scale };
};

/**
 * Whether the window is big enough for the staged, animated layout, and the
 * scale that fits the stage in it. Small and short screens get a stacked,
 * scrolling layout instead.
 */
export function useStage() {
  const [fit, setFit] = useState(measure);
  useEffect(() => {
    const update = () =>
      setFit((cur) => {
        const next = measure();
        return next.stage === cur.stage && next.scale === cur.scale
          ? cur
          : next;
      });
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, []);
  return fit;
}
