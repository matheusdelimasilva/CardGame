import { readFileSync } from "node:fs";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { DATA_VERSION, ROOM_VERSION, migrateData } from "./migrations";
import { BufferedStore } from "./persistence";
import { PostgresStore } from "./postgres-store";

export type { Session } from "./migrations";
export type { Store } from "./persistence";
export { PostgresStore };

/** Local snapshots use atomic, serialized asynchronous writes; null is memory-only. */
export class JsonStore extends BufferedStore {
  readonly ready = Promise.resolve();

  constructor(private readonly file: string | null) {
    super();
    if (!file) return;
    try {
      const input = JSON.parse(readFileSync(file, "utf8"));
      this.data = migrateData(input);
      if (
        input.version !== DATA_VERSION ||
        input.rooms?.some(
          (room: { version?: number }) => room.version !== ROOM_VERSION,
        )
      )
        this.save({ metadata: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new Error(`Cannot load JSON snapshot ${file}: ${String(err)}`, {
        cause: err,
      });
    }
  }

  protected async write(): Promise<void> {
    if (!this.file) return;
    const contents = JSON.stringify(this.data);
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, contents);
    await rename(temp, this.file);
  }
}

/** Explicit in-memory options take precedence over the process environment. */
export function createStore(
  dataFile: string | null,
  databaseUrl = process.env.DATABASE_URL,
) {
  return dataFile !== null && databaseUrl
    ? new PostgresStore(databaseUrl)
    : new JsonStore(dataFile);
}
