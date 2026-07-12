import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { InMemoryInferenceStore } from "./in-memory.js";
import type { InferenceListQuery, InferenceRecord, InferenceStore, SpendRow } from "./types.js";

async function loadJsonlRecords(filePath: string): Promise<InferenceRecord[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as InferenceRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Append-only JSONL store for local durability without Postgres.
 * Default path: `$CLAWQL_HOME/Inference/calls.jsonl` when set.
 */
export class JsonlInferenceStore implements InferenceStore {
  private cache: InferenceRecord[] | null = null;

  constructor(private readonly filePath: string) {}

  private async load(): Promise<InferenceRecord[]> {
    if (!this.cache) {
      this.cache = await loadJsonlRecords(this.filePath);
    }
    return this.cache;
  }

  async append(record: InferenceRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    if (this.cache) {
      this.cache.push(record);
    }
  }

  async list(query: InferenceListQuery = {}): Promise<InferenceRecord[]> {
    const memory = new InMemoryInferenceStore();
    for (const record of await this.load()) {
      await memory.append(record);
    }
    return memory.list(query);
  }

  async getByCorrelationId(correlationId: string): Promise<InferenceRecord[]> {
    const memory = new InMemoryInferenceStore();
    for (const record of await this.load()) {
      await memory.append(record);
    }
    return memory.getByCorrelationId(correlationId);
  }

  async spendRollup(
    options: {
      since?: Date;
      groupBy?: import("./types.js").SpendGroupBy;
    } = {}
  ): Promise<SpendRow[]> {
    const memory = new InMemoryInferenceStore();
    for (const record of await this.load()) {
      await memory.append(record);
    }
    return memory.spendRollup(options);
  }
}
