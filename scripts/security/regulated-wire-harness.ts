/**
 * Shared harness for regulated wire-level e2e (spawn dist/server-http.js).
 * Tokens and keys are minted per run — never committed.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  PutObjectLockConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { exportSPKI, generateKeyPair, importPKCS8, SignJWT, type KeyLike } from "jose";
import { readFileSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const SERVER_HTTP_JS = join(ROOT, "dist", "server-http.js");
export const INFERENCE_BIN = join(
  ROOT,
  "packages",
  "clawql-inference",
  "bin",
  "clawql-inference.mjs"
);
export const PETSTORE_PATCH_SPEC = join(
  ROOT,
  "scripts",
  "security",
  "fixtures",
  "petstore-patch.json"
);

/** D5 in-cluster mode: hit a deployed MCP instead of spawning dist/server-http.js. */
export function isWireRemote(): boolean {
  return process.env.CLAWQL_WIRE_TARGET?.trim().toLowerCase() === "remote";
}

export async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

export type SinkRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

export type RequestSink = {
  baseUrl: string;
  requests: SinkRequest[];
  close: () => Promise<void>;
};

/** Loopback HTTP sink that records every request (inference / SSRF target). */
export async function startRequestSink(): Promise<RequestSink> {
  const requests: SinkRequest[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
    server.on("error", reject);
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((r) => {
        server.close(() => r());
      }),
  };
}

export type MintedOidc = {
  issuer: string;
  audience: string;
  /** RS256 (local PEM spawn) or ES256 (kind JWKS remote). */
  alg: "RS256" | "ES256";
  /** kid for JWKS-backed minting (optional). */
  kid?: string;
  pemPath: string;
  privateKey: KeyLike;
  publicPem: string;
  mint: (claims?: Record<string, unknown> & { scope?: string[]; exp?: string }) => Promise<string>;
};

export type MintOidcOptions = {
  issuer?: string;
  audience?: string;
  /** Load an existing PKCS8 private key (EC P-256 → ES256) instead of generating RS256. */
  privateKeyPemPath?: string;
  /**
   * Always generate a fresh key pair (ignore `privateKeyPemPath` and
   * `CLAWQL_WIRE_OIDC_PRIVATE_KEY_PEM_PATH`). Required for the bad-signature row in
   * remote mode, where the env PEM is the server's verifying key.
   */
  forceGenerateKey?: boolean;
  kid?: string;
  alg?: "RS256" | "ES256";
};

export async function mintOidcMaterial(
  dir: string,
  opts: MintOidcOptions = {}
): Promise<MintedOidc> {
  const issuer =
    opts.issuer?.trim() ||
    process.env.CLAWQL_WIRE_OIDC_ISSUER?.trim() ||
    "https://idp.wire-test.clawql.invalid";
  const audience =
    opts.audience?.trim() || process.env.CLAWQL_WIRE_OIDC_AUDIENCE?.trim() || "clawql-mcp-wire";
  const keyPath = opts.forceGenerateKey
    ? ""
    : opts.privateKeyPemPath?.trim() ||
      process.env.CLAWQL_WIRE_OIDC_PRIVATE_KEY_PEM_PATH?.trim() ||
      "";
  const kid = opts.kid?.trim() || process.env.CLAWQL_WIRE_OIDC_KID?.trim() || undefined;

  let privateKey: KeyLike;
  let publicPem: string;
  let pemPath: string;
  let alg: "RS256" | "ES256";

  if (keyPath) {
    alg = opts.alg ?? "ES256";
    privateKey = await importPKCS8(readFileSync(keyPath, "utf8"), alg);
    // Public PEM is unused when the MCP verifies via JWKS; keep a placeholder path.
    pemPath = keyPath;
    publicPem = "";
  } else {
    alg = opts.alg ?? "RS256";
    const { publicKey, privateKey: genPriv } = await generateKeyPair(alg, {
      extractable: true,
    });
    privateKey = genPriv;
    publicPem = await exportSPKI(publicKey);
    pemPath = join(dir, "oidc-public.pem");
    await writeFile(pemPath, publicPem, "utf8");
  }

  return {
    issuer,
    audience,
    alg,
    kid,
    pemPath,
    privateKey,
    publicPem,
    mint: async (claims = {}) => {
      const scope = claims.scope ?? ["execute", "search", "memory"];
      const exp = claims.exp ?? "2h";
      const { scope: _s, exp: _e, ...rest } = claims;
      const header: { alg: "RS256" | "ES256"; kid?: string } = { alg };
      if (kid) header.kid = kid;
      return new SignJWT({
        atr: { sub: "wire-agent", role: "operator", scope },
        ...rest,
      })
        .setProtectedHeader(header)
        .setSubject(typeof rest.sub === "string" ? rest.sub : "wire-agent")
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(privateKey);
    },
  };
}

/** Remote sink that reads hit counts from fixtures/wire-sink-server.mjs. */
export type RemoteRequestSink = {
  baseUrl: string;
  /** Snapshot length compatible with local RequestSink.requests.length checks. */
  requests: { length: number };
  refresh: () => Promise<number>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
};

export async function connectRemoteRequestSink(baseUrl: string): Promise<RemoteRequestSink> {
  const base = baseUrl.replace(/\/$/, "");
  const state = { length: 0 };
  const refresh = async () => {
    const res = await fetch(`${base}/_count`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`remote sink /_count failed: ${res.status}`);
    const body = (await res.json()) as { n?: number };
    state.length = Number(body.n ?? 0);
    return state.length;
  };
  await refresh();
  return {
    baseUrl: base,
    requests: state,
    refresh,
    reset: async () => {
      await fetch(`${base}/_reset`, { method: "POST", signal: AbortSignal.timeout(5_000) });
      state.length = 0;
    },
    close: async () => undefined,
  };
}
export type S3Endpoints = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function s3FromEnv(): S3Endpoints | null {
  const endpoint =
    process.env.CLAWQL_WORM_S3_ENDPOINT?.trim() ||
    process.env.CLAWQL_WORM_S3_IT_ENDPOINT?.trim() ||
    "";
  if (!endpoint) return null;
  return {
    endpoint,
    accessKeyId:
      process.env.CLAWQL_WORM_S3_ACCESS_KEY_ID?.trim() ||
      process.env.CLAWQL_WORM_S3_IT_ACCESS_KEY?.trim() ||
      "test",
    secretAccessKey:
      process.env.CLAWQL_WORM_S3_SECRET_ACCESS_KEY?.trim() ||
      process.env.CLAWQL_WORM_S3_IT_SECRET_KEY?.trim() ||
      "test",
  };
}

export function s3Client(ep: S3Endpoints): S3Client {
  return new S3Client({
    endpoint: ep.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: ep.accessKeyId,
      secretAccessKey: ep.secretAccessKey,
    },
    requestChecksumCalculation: "WHEN_SUPPORTED",
  });
}

export async function createObjectLockBucket(
  client: S3Client,
  bucket: string,
  mode: "GOVERNANCE" | "COMPLIANCE" = "COMPLIANCE"
): Promise<void> {
  await client.send(
    new CreateBucketCommand({
      Bucket: bucket,
      ObjectLockEnabledForBucket: true,
    })
  );
  await client.send(
    new PutObjectLockConfigurationCommand({
      Bucket: bucket,
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled",
        Rule: {
          DefaultRetention: {
            Mode: mode,
            Days: 1,
          },
        },
      },
    })
  );
}

/** Bucket without Object Lock (for boot refusal row 2). */
export async function createPlainBucket(client: S3Client, bucket: string): Promise<void> {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
}

export type SpawnedServer = {
  port: number;
  pid: number | undefined;
  stderr: string;
  stdout: string;
  child: ChildProcessWithoutNullStreams;
  exitCode: Promise<number | null>;
  waitListening: (timeoutMs?: number) => Promise<void>;
  waitExit: (timeoutMs?: number) => Promise<number | null>;
  kill: () => Promise<void>;
};

export async function spawnServer(
  env: NodeJS.ProcessEnv,
  opts?: { entry?: string }
): Promise<SpawnedServer> {
  const port = Number.parseInt(env.PORT || env.MCP_PORT || "0", 10) || (await pickFreePort());
  const childEnv: NodeJS.ProcessEnv = {
    ...env,
    PORT: String(port),
    MCP_PORT: String(port),
    MCP_HOST: env.MCP_HOST || "127.0.0.1",
  };
  const entry = opts?.entry || SERVER_HTTP_JS;
  const child = spawn(process.execPath, [entry], {
    env: childEnv,
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const handle: SpawnedServer = {
    port,
    pid: child.pid,
    stderr: "",
    stdout: "",
    child,
    exitCode: Promise.resolve(null),
    waitListening: async () => undefined,
    waitExit: async () => null,
    kill: async () => undefined,
  };
  child.stderr.on("data", (d: Buffer) => {
    handle.stderr += d.toString("utf8");
  });
  child.stdout.on("data", (d: Buffer) => {
    handle.stdout += d.toString("utf8");
  });
  handle.exitCode = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  handle.waitListening = async (timeoutMs = 45_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(
          `server exited before listen (code=${child.exitCode})\nstderr:\n${handle.stderr}\nstdout:\n${handle.stdout}`
        );
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
          signal: AbortSignal.timeout(500),
        });
        if (res.ok || res.status === 401 || res.status === 403) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(
      `server did not listen on ${port} within ${timeoutMs}ms\nstderr:\n${handle.stderr}`
    );
  };

  handle.waitExit = async (timeoutMs = 20_000) => {
    const raced = await Promise.race([
      handle.exitCode,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (raced === null && child.exitCode === null) {
      throw new Error(`server still running after ${timeoutMs}ms\nstderr:\n${handle.stderr}`);
    }
    return child.exitCode;
  };

  handle.kill = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    const done = await Promise.race([
      handle.exitCode.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
    ]);
    if (!done && child.exitCode === null) {
      child.kill("SIGKILL");
      await handle.exitCode;
    }
  };

  return handle;
}

/** Assert TCP connect to port fails (port never accepted a connection). */
export async function assertPortClosed(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const s = createNetServer();
    s.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`port ${port} is in use (server unexpectedly listening)`));
      } else {
        reject(err);
      }
    });
    s.listen(port, "127.0.0.1", () => {
      s.close(() => resolve());
    });
  });
}

export async function makeWorkDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function writePatchPetstore(dir: string, apiBase: string): Promise<string> {
  const spec = {
    openapi: "3.0.3",
    info: { title: "PetstoreWire", version: "1" },
    servers: [{ url: apiBase }],
    paths: {
      "/pets/{id}": {
        patch: {
          operationId: "patchItem",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "ok" } },
        },
        get: {
          operationId: "getItem",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  };
  await mkdir(dir, { recursive: true });
  const path = join(dir, "petstore-patch.json");
  await writeFile(path, `${JSON.stringify(spec, null, 2)}\n`);
  return path;
}

export function regulatedBaseEnv(args: {
  home: string;
  oidc: MintedOidc;
  s3: S3Endpoints;
  bucket: string;
  specPath: string;
  wormHttpPort?: number;
  auditApiKey?: string;
  extra?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const instanceSpec = {
    // Match CLAWQL_TIER=regulated so the suite does not mix local preset + regulated env.
    tier: "regulated",
    memory: { enabled: false },
    documents: { enabled: false },
    sandbox: { enabled: false },
    data: { enabled: false },
    automation: {
      schedule: { enabled: false },
      notify: { enabled: false },
      workflow: { enabled: false },
      argocd: { enabled: false },
      hitlLabelStudio: { enabled: true },
    },
  };
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    LANG: process.env.LANG,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "test",
    CLAWQL_HOME: args.home,
    CLAWQL_TIER: "regulated",
    CLAWQL_WORM_ENABLED: "1",
    CLAWQL_WORM_REQUIRED: "1",
    CLAWQL_WORM_LOCAL: "sqlite",
    CLAWQL_WORM_REMOTE: "s3",
    CLAWQL_WORM_S3_ENDPOINT: args.s3.endpoint,
    CLAWQL_WORM_S3_BUCKET: args.bucket,
    CLAWQL_WORM_S3_ACCESS_KEY_ID: args.s3.accessKeyId,
    CLAWQL_WORM_S3_SECRET_ACCESS_KEY: args.s3.secretAccessKey,
    CLAWQL_WORM_S3_FORCE_PATH_STYLE: "1",
    CLAWQL_WORM_S3_REGION: "us-east-1",
    CLAWQL_WORM_S3_OBJECT_LOCK: "compliance",
    CLAWQL_WORM_S3_OBJECT_LOCK_DAYS: "1",
    CLAWQL_WORM_S3_VERIFY_OBJECT_LOCK: "1",
    CLAWQL_AUTH_MODE: "oidc",
    CLAWQL_AUTH_OIDC_PUBLIC_KEY_PEM_PATH: args.oidc.pemPath,
    CLAWQL_AUTH_OIDC_ISSUER: args.oidc.issuer,
    CLAWQL_AUTH_OIDC_AUDIENCE: args.oidc.audience,
    CLAWQL_SPEC_PATH: args.specPath,
    CLAWQL_INSTANCE_SPEC: JSON.stringify(instanceSpec),
    CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
    CLAWQL_HTTP_SKIP_PAYMENTS: "1",
    CLAWQL_HTTP_SKIP_GRAPHQL: "1",
    CLAWQL_PENDING_STORE: "sqlite",
    CLAWQL_SECRET_STORE: "memory",
    ...(args.wormHttpPort
      ? {
          CLAWQL_WORM_HTTP_PORT: String(args.wormHttpPort),
          CLAWQL_AUDIT_API_KEY: args.auditApiKey || "wire-audit-key",
        }
      : {}),
    ...args.extra,
  };
}

export async function mcpInitialize(
  base: string,
  token: string
): Promise<{
  sessionId: string;
  rpc: (body: unknown) => Promise<{ status: number; body: unknown }>;
}> {
  const initRes = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "regulated-wire", version: "1.0.0" },
      },
    }),
  });
  const sessionId = initRes.headers.get("mcp-session-id") || "";
  const initBody = await parsePossiblySse(initRes);
  if (!initRes.ok) {
    throw new Error(`initialize failed ${initRes.status}: ${JSON.stringify(initBody)}`);
  }

  // MCP Streamable HTTP: notify initialized before tools/call.
  await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });

  const rpc = async (body: unknown) => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await parsePossiblySse(res) };
  };
  return { sessionId, rpc };
}

/** Extract tool result text from a tools/call JSON-RPC / SSE body. */
export function toolResultText(rpcBody: unknown): string {
  if (!rpcBody || typeof rpcBody !== "object") return String(rpcBody ?? "");
  const body = rpcBody as {
    result?: { content?: { text?: string }[]; isError?: boolean };
    error?: { message?: string };
  };
  if (body.result?.content?.[0]?.text) return body.result.content[0].text;
  if (body.error?.message) return body.error.message;
  return JSON.stringify(rpcBody);
}

export async function parsePossiblySse(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("text/event-stream") || text.startsWith("event:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1];
    if (!last) return { raw: text };
    return JSON.parse(last.slice(5).trim());
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function newBucketName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
