import fs from "node:fs/promises";
import path from "node:path";
import type { CodeGraphDocument } from "../types.js";

export interface CodeGraphStorage {
  get(graphId: string): Promise<CodeGraphDocument | null>;
  put(doc: CodeGraphDocument): Promise<void>;
}

export function defaultCodeGraphStoragePath(base?: string): string {
  const root = base?.trim() || process.cwd();
  return path.join(root, "codegraph.db.json");
}

export class FileCodeGraphStorage implements CodeGraphStorage {
  constructor(private readonly filePath: string) {}

  async get(graphId: string): Promise<CodeGraphDocument | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { graphs?: Record<string, CodeGraphDocument> };
      return parsed.graphs?.[graphId] ?? null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async put(doc: CodeGraphDocument): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    let graphs: Record<string, CodeGraphDocument> = {};
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { graphs?: Record<string, CodeGraphDocument> };
      graphs = parsed.graphs ?? {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    graphs[doc.graphId] = doc;
    await fs.writeFile(this.filePath, JSON.stringify({ graphs }, null, 2), "utf8");
  }
}

export function storageFromPath(storagePath?: string): FileCodeGraphStorage {
  const envPath = process.env.CLAWQL_CODEGRAPH_PATH?.trim();
  const resolved =
    storagePath ?? (envPath ? defaultCodeGraphStoragePath(envPath) : "./data/codegraph.db.json");
  return new FileCodeGraphStorage(resolved);
}
