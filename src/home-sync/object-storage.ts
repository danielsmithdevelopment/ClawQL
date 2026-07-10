import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import {
  loadResolvedHomeSyncConfig,
  resolveSyncCredentials,
  resolveSyncEndpoint,
} from "./config.js";
import { syncProviderProfile } from "./providers.js";
import type { ResolvedHomeSyncConfig, SyncManifest } from "./types.js";

export type ObjectStorageClient = {
  getJson<T>(key: string): Promise<T | null>;
  putJson(key: string, body: unknown): Promise<void>;
  getBytes(key: string): Promise<Buffer | null>;
  putBytes(key: string, body: Buffer, contentType?: string): Promise<void>;
};

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);
  const stream = body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createObjectStorageClient(config: ResolvedHomeSyncConfig): ObjectStorageClient {
  const creds = resolveSyncCredentials(config);
  const endpoint = resolveSyncEndpoint(config);
  const profile = syncProviderProfile(config.provider);
  const clientConfig: S3ClientConfig = {
    credentials: creds,
    region: config.region ?? profile.defaultRegion ?? "us-east-1",
  };
  if (endpoint) {
    clientConfig.endpoint = endpoint;
    clientConfig.forcePathStyle = profile.forcePathStyle;
  }
  const client = new S3Client(clientConfig);

  return {
    async getJson<T>(key: string): Promise<T | null> {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        const buf = await streamToBuffer(res.Body);
        if (!buf.length) return null;
        return JSON.parse(buf.toString("utf8")) as T;
      } catch (e: unknown) {
        const name = (e as { name?: string })?.name;
        const code = (e as { Code?: string; $metadata?: { httpStatusCode?: number } })?.Code;
        const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode;
        if (name === "NoSuchKey" || code === "NoSuchKey" || status === 404) return null;
        throw e;
      }
    },
    async putJson(key: string, body: unknown): Promise<void> {
      const payload = Buffer.from(`${JSON.stringify(body, null, 2)}\n`, "utf8");
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: payload,
          ContentType: "application/json",
        })
      );
    },
    async getBytes(key: string): Promise<Buffer | null> {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        return await streamToBuffer(res.Body);
      } catch (e: unknown) {
        const name = (e as { name?: string })?.name;
        const code = (e as { Code?: string })?.Code;
        const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode;
        if (name === "NoSuchKey" || code === "NoSuchKey" || status === 404) return null;
        throw e;
      }
    },
    async putBytes(
      key: string,
      body: Buffer,
      contentType = "application/octet-stream"
    ): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
    },
  };
}

export async function createDefaultObjectStorageClient(): Promise<{
  client: ObjectStorageClient;
  config: ResolvedHomeSyncConfig;
}> {
  const config = await loadResolvedHomeSyncConfig();
  return { client: createObjectStorageClient(config), config };
}

export async function fetchRemoteManifest(
  client: ObjectStorageClient,
  config: ResolvedHomeSyncConfig
): Promise<SyncManifest | null> {
  const raw = await client.getJson<SyncManifest>(config.manifestKey);
  if (!raw || raw.version !== 1 || typeof raw.files !== "object") return null;
  return raw;
}

export function contentTypeForRelPath(relPath: string): string {
  if (relPath.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (relPath.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}
