import type { RoomView } from "@cardgame/protocol";
import type { ReactNode } from "react";
import type { FixtureOptions, ScenarioName } from "./fixtures";

/** What the gallery hands every section: the scenario picked in its toolbar or URL. */
export interface GalleryContext {
  scenario: ScenarioName;
  options: Required<Omit<FixtureOptions, "showSongInfo">> & {
    showSongInfo: boolean;
  };
  /** scenarios[scenario](options), built once per change. */
  room: RoomView;
}

/**
 * A gallery section. Put one in `game/dev/<name>.gallery.tsx` as its default
 * export and it appears at /dev/game; `/dev/game?only=<name>` shows it alone,
 * filling the window. Scenario and options come from the URL as well:
 * `scenario`, `players` (2–8), `goal` (5, 8 or 10), `timelines`
 * (short, long or mixed) and `songInfo` (1 to show the current title) and `code` (the table code).
 */
export interface GallerySection {
  title: string;
  /**
   * Returns the preview. It is called during render, so it must not call
   * hooks itself: return a component element that does.
   */
  render(context: GalleryContext): ReactNode;
  /**
   * The section draws the whole screen (its own .gs-stage and anything
   * around it). Otherwise its preview is centred on the felt.
   */
  fullscreen?: boolean;
}
