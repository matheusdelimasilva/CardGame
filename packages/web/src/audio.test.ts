import { createElement, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackAudio, type TrackAudio } from "./audio";
import { storage } from "./storage";

vi.mock("./storage", () => ({
  storage: { get: vi.fn(() => null), set: vi.fn() },
}));

class FakeAudio extends EventTarget {
  preload = "";
  paused = true;
  ended = false;
  sources: string[] = [];
  private position = 0;

  set src(url: string) {
    this.sources.push(url);
    this.currentTime = 0;
    this.paused = true;
  }

  get currentTime() {
    return this.position;
  }
  set currentTime(value: number) {
    this.position = value;
    this.ended = false;
  }

  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}

let renderer: ReactTestRenderer | undefined;
let track: TrackAudio;
let audio: FakeAudio;

function Harness({ url }: { url: string | null }) {
  const value = useTrackAudio(url);
  useEffect(() => {
    track = value;
  }, [value]);
  return null;
}

async function render(url: string | null) {
  await act(async () => {
    if (renderer) renderer.update(createElement(Harness, { url }));
    else renderer = create(createElement(Harness, { url }));
  });
}

beforeEach(() => {
  vi.mocked(storage.get).mockReturnValue(null);
  audio = new FakeAudio();
  vi.stubGlobal(
    "Audio",
    class {
      constructor() {
        return audio;
      }
    },
  );
  vi.stubGlobal("document", new EventTarget());
});

afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("track audio", () => {
  it("stays idle without a recording and automatically plays a new URL from zero", async () => {
    await render(null);
    expect(track.status).toBe("idle");
    await act(async () => track.toggle());
    expect(audio.play).not.toHaveBeenCalled();
    await render("/first");
    expect(track.status).toBe("playing");
    expect(audio.currentTime).toBe(0);
    audio.currentTime = 12;
    await render("/second");
    expect(audio.sources).toEqual(["/first", "/second"]);
    expect(audio.currentTime).toBe(0);
    expect(track.status).toBe("playing");
    await render(null);
    expect(track.status).toBe("idle");
    expect(audio.paused).toBe(true);
  });

  it("pauses and resumes at the same position without reloading", async () => {
    await render("/track");
    audio.currentTime = 12.5;
    await act(async () => track.toggle());
    expect(track.status).toBe("paused");
    expect(audio.paused).toBe(true);
    expect(audio.currentTime).toBe(12.5);
    await act(async () => track.toggle());
    expect(track.status).toBe("playing");
    expect(audio.currentTime).toBe(12.5);
    expect(audio.sources).toEqual(["/track"]);
  });

  it("distinguishes ended playback and replays it from zero", async () => {
    await render("/track");
    audio.currentTime = 30;
    audio.ended = true;
    audio.paused = true;
    await act(async () => {
      audio.dispatchEvent(new Event("ended"));
    });
    expect(track.status).toBe("ended");
    await act(async () => track.toggle());
    expect(track.status).toBe("playing");
    expect(audio.currentTime).toBe(0);
    expect(audio.sources).toEqual(["/track"]);
  });

  it("resumes the same recording across repeated mute changes", async () => {
    await render("/track");
    for (const position of [8.75, 17]) {
      audio.currentTime = position;
      await act(async () => track.setMuted(true));
      expect(track.status).toBe("idle");
      expect(audio.paused).toBe(true);
      const plays = audio.play.mock.calls.length;
      await act(async () => track.toggle());
      expect(audio.play).toHaveBeenCalledTimes(plays);
      await act(async () => track.setMuted(false));
      expect(track.status).toBe("playing");
      expect(audio.currentTime).toBe(position);
    }
    expect(audio.sources).toEqual(["/track"]);
  });

  it("starts a new recording from zero when unmuted, including an initially muted listener", async () => {
    vi.mocked(storage.get).mockReturnValue("1");
    await render("/first");
    expect(audio.play).not.toHaveBeenCalled();
    await act(async () => track.setMuted(false));
    audio.currentTime = 9;
    await act(async () => track.setMuted(true));
    await render("/second");
    expect(audio.paused).toBe(true);
    await act(async () => track.setMuted(false));
    expect(track.status).toBe("playing");
    expect(audio.currentTime).toBe(0);
    expect(audio.sources).toEqual(["/first", "/second"]);
  });

  it("does not unlock blocked playback while muted", async () => {
    audio.play.mockRejectedValueOnce(
      new DOMException("Tap required", "NotAllowedError"),
    );
    await render("/track");
    expect(track.status).toBe("blocked");
    await act(async () => track.setMuted(true));
    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    expect(audio.play).toHaveBeenCalledOnce();
    await act(async () => track.setMuted(false));
    expect(track.status).toBe("playing");
    expect(audio.sources).toEqual(["/track"]);
  });

  it("reports a playback error", async () => {
    audio.play.mockRejectedValueOnce(
      new DOMException("Unavailable", "NotSupportedError"),
    );
    await render("/track");
    expect(track.status).toBe("error");
  });

  it("ignores a pending play resolution after pausing", async () => {
    let resolve!: () => void;
    audio.play.mockImplementationOnce(() => {
      audio.paused = false;
      return new Promise<void>((done) => {
        resolve = done;
      });
    });
    await render("/track");
    await act(async () => track.toggle());
    expect(track.status).toBe("paused");
    await act(async () => resolve());
    expect(track.status).toBe("paused");
  });
});
