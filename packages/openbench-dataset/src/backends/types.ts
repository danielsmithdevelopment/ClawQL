import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Transport-agnostic durable sink for OpenBenchTrace packs. */
export interface DatasetBackend {
  readonly name: string;
  putObject(key: string, body: string | Buffer, contentType?: string): Promise<void>;
}

/** Local filesystem backend (CI workspace or laptop). */
export class LocalFsBackend implements DatasetBackend {
  readonly name = "local";
  constructor(private readonly rootDir: string) {}

  async putObject(key: string, body: string | Buffer, _contentType?: string): Promise<void> {
    const path = join(this.rootDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
}

export type S3CompatibleConfig = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
};

/**
 * Placeholder for S3/R2 — wire AWS SDK or CLI in the host environment.
 * Throws with setup instructions until implemented in a follow-up.
 */
export class S3CompatibleBackend implements DatasetBackend {
  readonly name = "s3";
  constructor(private readonly config: S3CompatibleConfig) {}

  async putObject(_key: string, _body: string | Buffer): Promise<void> {
    void this.config;
    throw new Error(
      "S3CompatibleBackend not yet implemented in openbench-dataset — use LocalFsBackend or ClawQL sync-openbench-traces-durable.sh"
    );
  }
}
