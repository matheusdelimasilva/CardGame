import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { SongCardView } from "@cardgame/games";

// Card colours and layout follow docs/design/song-cards.html (the Vinyl design and its deck back).
const DECADES: [number, string][] = [
  [1950, "#ef4a3c"],
  [1960, "#ff8a3d"],
  [1970, "#ffd84a"],
  [1980, "#ff6fae"],
  [1990, "#3b8cf0"],
  [2000, "#45c486"],
  [2010, "#9b7bff"],
  [2020, "#33cccc"],
];
function decadeColor(year: number): string {
  let color = DECADES[0]![1];
  for (const [decade, c] of DECADES) if (year >= decade) color = c;
  return color;
}

/** "A featuring B" -> main artist plus a smaller "feat. B" line. */
export function Artist({ name }: { name: string }) {
  const m = /\s+(?:featuring|feat\.?|ft\.?)\s+/i.exec(name);
  if (!m) return <>{name}</>;
  return (
    <>
      {name.slice(0, m.index)}
      <span className="feat">feat. {name.slice(m.index + m[0].length)}</span>
    </>
  );
}

/** Shrinks the text in every .fit box of a card until it fits, so long titles get smaller instead of clipping. */
function useFitText(deps: unknown[]) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const fit = () =>
      ref.current?.querySelectorAll<HTMLElement>(".fit").forEach((el) => {
        el.style.fontSize = "";
        const base = parseFloat(getComputedStyle(el).fontSize);
        let size = base;
        while (
          (el.scrollHeight > el.clientHeight + 1 ||
            el.scrollWidth > el.clientWidth + 1) &&
          size > base * 0.45
        ) {
          size *= 0.93;
          el.style.fontSize = `${size}px`;
        }
      });
    fit();
    // Text is measured again once the web fonts load and when the window is resized.
    void document.fonts?.ready.then(fit);
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** A face-up song card: the Vinyl design, coloured by decade. */
export function SongCard({
  song,
  fresh,
}: {
  song: SongCardView;
  fresh?: boolean;
}) {
  const ref = useFitText([song.title, song.artist]);
  // Bring a card you have just won into view in a long timeline.
  useEffect(() => {
    if (fresh)
      ref.current?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }, [fresh, ref]);
  return (
    <span
      ref={ref}
      className={`sc md v-vinyl${fresh ? " fresh" : ""}`}
      style={{ "--acc": decadeColor(song.year) } as CSSProperties}
      role="img"
      aria-label={`${song.title}, ${song.artist}, ${song.year}`}
    >
      <span className="vn-rec">
        <span className="vn-disc">
          <span className="vn-print" />
        </span>
        <span className="vn-lbl">{song.year}</span>
      </span>
      <span className="vn-plate">
        <span className="fit vn-title">{song.title}</span>
        <span className="fit vn-artist">
          <Artist name={song.artist} />
        </span>
      </span>
    </span>
  );
}

/**
 * A face-down song card. The label is always gold so its colour cannot give
 * the decade away. `playing` spins the record and shows the equalizer bars;
 * it is for when the song is actually audible.
 */
export function SongBack({
  playing,
  timeline,
  onTap,
  tapLabel,
}: {
  playing?: boolean;
  timeline?: boolean;
  onTap?: () => void;
  tapLabel?: string;
}) {
  const card = (
    <span
      className={`sc ${timeline ? "md" : "back-size"} v-vinyl v-back${playing ? " playing" : ""}`}
      role="img"
      aria-label="Face-down song card"
    >
      <span className="vn-rec">
        <span className="vn-disc">
          <span className="vn-print" />
        </span>
        <span className="vn-lbl">
          <span className="vn-hole" />
        </span>
      </span>
      <span className="vn-plate">
        <span className="vn-mystery">???</span>
        <span className="vn-eq">
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
    </span>
  );
  return onTap ? (
    <button className="song-back-button" onClick={onTap} aria-label={tapLabel}>
      {card}
    </button>
  ) : (
    card
  );
}
