import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "./storage";

const MUTED_KEY = "cg:muted";

export type AudioStatus =
  /** Nothing to play right now. */
  | "idle"
  | "loading"
  | "playing"
  /** Paused by the listener. Tap to continue from this position. */
  | "paused"
  /** The recording reached its end. Tap to play it from the start. */
  | "ended"
  /** The browser refused to start sound without a tap. The next tap anywhere starts it. */
  | "blocked"
  /** The recording could not be loaded. */
  | "error";

export interface TrackAudio {
  status: AudioStatus;
  muted: boolean;
  /** Pause if playing; otherwise resume, or replay an ended recording. */
  toggle(): void;
  setMuted(muted: boolean): void;
}

/**
 * Plays the table's current recording on this device. One audio element is
 * reused for every recording: phones only let a page start sound on its own
 * after the listener has started it once on that same element.
 */
export function useTrackAudio(url: string | null): TrackAudio {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [muted, setMutedState] = useState(() => storage.get(MUTED_KEY) === "1");
  const element = useRef<HTMLAudioElement | null>(null);
  // The URL currently loaded in the element.
  const current = useRef<string | null>(null);
  const attempt = useRef(0);

  const play = useCallback((fromStart: boolean) => {
    const audio = element.current;
    const playing = current.current;
    if (!audio || !playing) return;
    const request = ++attempt.current;
    if (fromStart) audio.currentTime = 0;
    setStatus("loading");
    audio.play().then(
      () => attempt.current === request && setStatus("playing"),
      (err: DOMException) => {
        if (attempt.current !== request || err.name === "AbortError") return;
        setStatus(err.name === "NotAllowedError" ? "blocked" : "error");
      },
    );
  }, []);

  useEffect(() => {
    const audio = (element.current ??= new Audio());
    audio.preload = "auto";
    const cancelPendingPlay = () => {
      attempt.current++;
    };
    const onEnded = () => {
      cancelPendingPlay();
      setStatus("ended");
    };
    const onError = () => current.current && setStatus("error");
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      cancelPendingPlay();
      audio.pause();
    };
  }, []);

  // A new recording starts playing by itself; no recording, or muted, means silence.
  useEffect(() => {
    const audio = element.current!;
    attempt.current++;
    const changed = current.current !== url;
    current.current = url;
    if (url && changed) audio.src = url;
    if (!url || muted) {
      audio.pause();
      return;
    }
    play(changed || audio.ended);
  }, [url, muted, play]);

  // While the browser is refusing to start sound, the next tap anywhere on the page starts it.
  useEffect(() => {
    if (status !== "blocked" || muted || !url) return;
    const unlock = () => play(false);
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [status, play, muted, url]);

  const toggle = useCallback(() => {
    const audio = element.current;
    if (!audio || !current.current || muted) return;
    if (!audio.paused && !audio.ended) {
      audio.pause();
      attempt.current++;
      setStatus("paused");
    } else {
      play(audio.ended);
    }
  }, [play, muted]);

  const setMuted = useCallback((next: boolean) => {
    storage.set(MUTED_KEY, next ? "1" : null);
    setMutedState(next);
  }, []);

  return { status: !url || muted ? "idle" : status, muted, toggle, setMuted };
}
