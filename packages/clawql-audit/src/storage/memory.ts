import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import type { MerkleRoot } from "../merkle.js";
import { applyWORMFilter } from "../query/filter.js";
import type { LocalStorageBackend } from "./types.js";

export type MemoryBackendOptions = {
  /**
   * Max retained entries (and outbox/roots trimmed to the same budget).
   * `0` / omitted / non-finite = unbounded (legacy test behavior).
   * Env default via {@link memoryBackendMaxEntriesFromEnv}.
   */
  readonly maxEntries?: number;
};

/** Parse `CLAWQL_WORM_MEMORY_MAX_ENTRIES` — default 10_000; `0` = unbounded. */
export function memoryBackendMaxEntriesFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_WORM_MEMORY_MAX_ENTRIES?.trim();
  if (raw === undefined || raw === "") return 10_000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 10_000;
  return n;
}

/**
 * In-memory local/remote backend (tests / non-durable).
 * When `maxEntries > 0`, drops oldest rows so dual-ack memory cannot grow without bound.
 * Not a compliance store — use sqlite/postgres/s3 for durable WORM.
 */
export class MemoryBackend implements LocalStorageBackend {
  private entries: WORMEntry[] = [];
  private outbox: WORMEntry[] = [];
  private roots: MerkleRoot[] = [];
  private readonly maxEntries: number;

  constructor(options: MemoryBackendOptions = {}) {
    const max = options.maxEntries;
    this.maxEntries = max === undefined ? 0 : max;
  }

  private trim(): void {
    const max = this.maxEntries;
    if (!max || max <= 0) return;
    if (this.entries.length > max) {
      this.entries = this.entries.slice(this.entries.length - max);
    }
    if (this.outbox.length > max) {
      this.outbox = this.outbox.slice(this.outbox.length - max);
    }
    if (this.roots.length > max) {
      this.roots = this.roots.slice(this.roots.length - max);
    }
  }

  write = (entry: WORMEntry): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.entries.push(entry);
      this.entries.sort((a, b) => a.chainIndex - b.chainIndex);
      this.trim();
    });

  writeWithOutbox = (entry: WORMEntry): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.entries.push(entry);
      this.entries.sort((a, b) => a.chainIndex - b.chainIndex);
      this.outbox.push(entry);
      this.trim();
    });

  outboxList = (): Effect.Effect<WORMEntry[], never> => Effect.sync(() => [...this.outbox]);

  outboxDelete = (id: string): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.outbox = this.outbox.filter((e) => e.id !== id);
    });

  storeMerkleRoot = (root: MerkleRoot): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.roots.push(root);
      this.trim();
    });

  listMerkleRoots = (): Effect.Effect<MerkleRoot[], never> => Effect.sync(() => [...this.roots]);

  query = (filter: WORMFilter): Effect.Effect<WORMEntry[], never> =>
    applyWORMFilter(this.entries, filter);

  all = (): Effect.Effect<WORMEntry[], never> => Effect.sync(() => [...this.entries]);

  latestEntry = (): Effect.Effect<WORMEntry | null, never> =>
    Effect.sync(() => (this.entries.length ? this.entries[this.entries.length - 1]! : null));
}
