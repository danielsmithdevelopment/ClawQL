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

export { S3CompatibleBackend, resolveR2ConfigFromEnv } from "./s3.js";
export type { ResolveR2ConfigResult } from "./s3.js";
