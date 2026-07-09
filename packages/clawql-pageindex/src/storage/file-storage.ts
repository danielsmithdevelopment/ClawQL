import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { PageIndexDocument } from "../types.js";

export interface PageIndexStorage {
  put(doc: PageIndexDocument): Promise<void>;
  get(docId: string): Promise<PageIndexDocument | null>;
  list(): Promise<string[]>;
  delete(docId: string): Promise<boolean>;
}

type StoreFile = {
  version: 1;
  documents: Record<string, PageIndexDocument>;
};

/**
 * JSON file-backed storage (Phase 1). Single file `pageindex.db.json` by default.
 */
export class FilePageIndexStorage implements PageIndexStorage {
  constructor(private readonly filePath: string) {}

  private async readStore(): Promise<StoreFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      if (parsed?.version === 1 && parsed.documents) return parsed;
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw e;
    }
    return { version: 1, documents: {} };
  }

  private async writeStore(store: StoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }

  async put(doc: PageIndexDocument): Promise<void> {
    const store = await this.readStore();
    store.documents[doc.docId] = doc;
    await this.writeStore(store);
  }

  async get(docId: string): Promise<PageIndexDocument | null> {
    const store = await this.readStore();
    return store.documents[docId] ?? null;
  }

  async list(): Promise<string[]> {
    const store = await this.readStore();
    return Object.keys(store.documents);
  }

  async delete(docId: string): Promise<boolean> {
    const store = await this.readStore();
    if (!store.documents[docId]) return false;
    delete store.documents[docId];
    await this.writeStore(store);
    return true;
  }
}

export function defaultPageIndexStoragePath(baseDir: string): string {
  return join(baseDir, "pageindex.db.json");
}
