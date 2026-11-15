import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "./storage";

const MUTED_KEY = "cg:muted";

export type AudioStatus =
  /** Nothing to play right now. */
  | "idle"
  | "loading"
  | "playing"
  /** Stopped by the listener, or the recording reached its end. Tap to hear it again. */
  | "paused"
  /** The browser refused to start sound without a tap. The next tap anywhere starts it. */
  | "blocked"
  /** The recording could not be loaded. */
  | "error";

export interface TrackAudio {
  status: AudioStatus;
  muted: boolean;
  /** Pause if playing; otherwise play from the start. Call it from a tap. */
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
  // The URL the element was last told to play, so stale callbacks can tell they are stale.
  const current = useRef<string | null>(null);

  const play = useCallback((fromStart: boolean) => {
    const audio = element.current;
    const playing = current.current;
    if (!audio || !playing) return;
    if (fromStart) audio.currentTime = 0;
    setStatus("loading");
    audio.play().then(
      () => current.current === playing && setStatus("playing"),
      (err: DOMException) => {
        if (current.current !== playing || err.name === "AbortError") return; // a newer recording took over
        setStatus(err.name === "NotAllowedError" ? "blocked" : "error");
      },
    );
  }, []);

  useEffect(() => {
    const audio = (element.current ??= new Audio());
    audio.preload = "auto";
    const onEnded = () => setStatus("paused");
    const onError = () => current.current && setStatus("error");
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
    };
  }, []);

  // A new recording starts playing by itself; no recording, or muted, means silence.
  useEffect(() => {
    const audio = element.current!;
    if (!url || muted) {
      current.current = null;
      audio.pause();
      return;
    }
    current.current = url;
    audio.src = url;
    play(false);
  }, [url, muted, play]);

  // While the browser is refusing to start sound, the next tap anywhere on the page starts it.
  useEffect(() => {
    if (status !== "blocked") return;
    const unlock = () => play(false);
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [status, play]);

  const toggle = useCallback(() => {
    const audio = element.current;
    if (!audio || !current.current) return;
    if (!audio.paused && !audio.ended) {
      audio.pause();
      setStatus("paused");
    } else {
      play(audio.ended || status === "paused");
    }
  }, [play, status]);

  const setMuted = useCallback((next: boolean) => {
    storage.set(MUTED_KEY, next ? "1" : null);
    setMutedState(next);
  }, []);

  return { status: !url || muted ? "idle" : status, muted, toggle, setMuted };
}
