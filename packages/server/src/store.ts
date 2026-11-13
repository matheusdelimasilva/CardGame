import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { HistoryEntry } from "@cardgame/protocol";
import type { Room } from "./rooms";

interface Data {
  /** Host session token -> email. */
  sessions: Record<string, string>;
  /** Host email -> finished games, newest first. */
  history: Record<string, HistoryEntry[]>;
  rooms: Room[];
}

/**
 * Small JSON-file store. It keeps host sessions, game history and a snapshot
 * of every room, so a restart does not lose games in progress. It is meant to
 * be replaced by a real database without changing its callers.
 */
export class Store {
  data: Data = { sessions: {}, history: {}, rooms: [] };
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string | null) {
    if (!file) return;
    try {
      this.data = { ...this.data, ...JSON.parse(readFileSync(file, "utf8")) };
    } catch {
      // No file yet, or an unreadable one: start empty.
    }
  }

  /** Schedules a write; many changes close together become one write. */
  save(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 300);
  }

  flush(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}
