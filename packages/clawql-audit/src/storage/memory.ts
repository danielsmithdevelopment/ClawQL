import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import type { MerkleRoot } from "../merkle.js";
import { applyWORMFilter } from "../query/filter.js";
import type { LocalStorageBackend } from "./types.js";

/** In-memory local backend (tests). */
export class MemoryBackend implements LocalStorageBackend {
  private entries: WORMEntry[] = [];
  private outbox: WORMEntry[] = [];
  private roots: MerkleRoot[] = [];

  write = (entry: WORMEntry): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.entries.push(entry);
      this.entries.sort((a, b) => a.chainIndex - b.chainIndex);
    });

  writeWithOutbox = (entry: WORMEntry): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.entries.push(entry);
      this.entries.sort((a, b) => a.chainIndex - b.chainIndex);
      this.outbox.push(entry);
    });

  outboxList = (): Effect.Effect<WORMEntry[], never> => Effect.sync(() => [...this.outbox]);

  outboxDelete = (id: string): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.outbox = this.outbox.filter((e) => e.id !== id);
    });

  storeMerkleRoot = (root: MerkleRoot): Effect.Effect<void, never> =>
    Effect.sync(() => {
      this.roots.push(root);
    });

  listMerkleRoots = (): Effect.Effect<MerkleRoot[], never> =>
    Effect.sync(() => [...this.roots]);

  query = (filter: WORMFilter): Effect.Effect<WORMEntry[], never> =>
    applyWORMFilter(this.entries, filter);

  all = (): Effect.Effect<WORMEntry[], never> => Effect.sync(() => [...this.entries]);

  latestEntry = (): Effect.Effect<WORMEntry | null, never> =>
    Effect.sync(() => (this.entries.length ? this.entries[this.entries.length - 1]! : null));
}
