import { emptyData, type Data } from "./migrations";

export interface Changes {
  rooms?: Iterable<string>;
  sessions?: Iterable<string>;
  history?: Iterable<string>;
  metadata?: boolean;
}

export interface Store {
  data: Data;
  ready: Promise<void>;
  save(changes: Changes): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export const dirtyKeys = () => ({
  rooms: new Set<string>(),
  sessions: new Set<string>(),
  history: new Set<string>(),
  metadata: false,
});
export type Dirty = ReturnType<typeof dirtyKeys>;

/** Debounced dirty keys and a failure-safe queue shared by both persistence backends. */
export abstract class BufferedStore implements Store {
  data = emptyData();
  abstract readonly ready: Promise<void>;
  private dirty = dirtyKeys();
  private timer: NodeJS.Timeout | null = null;
  private writes: Promise<void> = Promise.resolve();
  private closing = false;

  save(changes: Changes): void {
    for (const table of ["rooms", "sessions", "history"] as const)
      for (const id of changes[table] ?? []) this.dirty[table].add(id);
    this.dirty.metadata ||= changes.metadata ?? false;
    this.schedule();
  }

  private schedule(): void {
    if (this.closing || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch((err) => {
        console.error("Saving data failed; retrying:", err);
        this.schedule();
      });
    }, 300);
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const write = this.writes
      .catch(() => {})
      .then(async () => {
        await this.ready;
        const batch = this.dirty;
        this.dirty = dirtyKeys();
        if (
          !batch.metadata &&
          !batch.rooms.size &&
          !batch.sessions.size &&
          !batch.history.size
        )
          return;
        try {
          await this.write(batch);
        } catch (err) {
          this.save(batch);
          throw err;
        }
      });
    this.writes = write;
    return write;
  }

  protected abstract write(changes: Dirty): Promise<void>;

  async close(): Promise<void> {
    this.closing = true;
    await this.flush();
  }
}
