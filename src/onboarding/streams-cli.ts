/**
 * `clawql streams celld` — celld v0.4.0 fleet helpers for ClawQL Streams.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CELLD_DEFAULT_VERSION = "v0.4.0";
export const CELLD_WORKER_LIMIT_BYTES = 64 * 1024 * 1024;

export type StreamsCelldCliOptions = {
  version?: string;
  project?: string;
  bucket?: string;
  endpoint?: string;
  region?: string;
  listen?: string;
  advertise?: string;
  internalListen?: string;
  json?: boolean;
};

function findRepoRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, "examples", "streams-celld", "wrangler.jsonc")) &&
      existsSync(join(dir, "package.json"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function defaultProjectDir(): string {
  const fromEnv = process.env.CLAWQL_STREAMS_CELLD_PROJECT?.trim();
  if (fromEnv && existsSync(join(fromEnv, "wrangler.jsonc"))) {
    return resolve(fromEnv);
  }
  const root = findRepoRoot();
  if (root) {
    return join(root, "examples", "streams-celld");
  }
  return process.cwd();
}

function requireCelld(): string {
  const which = spawnSync("celld", ["--version"], { encoding: "utf8" });
  if (which.status !== 0) {
    console.error(
      "celld not found. Run: clawql streams celld install (or CELLD_VERSION=v0.4.0 curl -fsSL https://celld.dev/install.sh | sh)"
    );
    process.exitCode = 1;
    throw new Error("celld missing");
  }
  return which.stdout.trim();
}

function runCelld(args: string[], opts?: { cwd?: string }): number {
  const res = spawnSync("celld", args, {
    cwd: opts?.cwd,
    stdio: "inherit",
    env: process.env,
  });
  return res.status ?? 1;
}

function bucketArgs(opts: StreamsCelldCliOptions): string[] {
  const bucket = opts.bucket ?? process.env.CELLD_BUCKET?.trim();
  if (!bucket) {
    console.error("Missing --bucket or CELLD_BUCKET");
    process.exitCode = 1;
    throw new Error("bucket required");
  }
  const out = ["--bucket", bucket];
  const endpoint = opts.endpoint ?? process.env.S3_ENDPOINT?.trim();
  const region = opts.region ?? process.env.AWS_REGION?.trim() ?? "auto";
  if (endpoint) out.push("--endpoint", endpoint);
  if (region) out.push("--region", region);
  return out;
}

export async function runStreamsCelldInstall(opts: StreamsCelldCliOptions): Promise<number> {
  const version = opts.version ?? process.env.CELLD_VERSION ?? CELLD_DEFAULT_VERSION;
  const res = spawnSync("bash", ["-lc", "curl -fsSL https://celld.dev/install.sh | sh"], {
    stdio: "inherit",
    env: { ...process.env, CELLD_VERSION: version },
  });
  if (res.status !== 0) return res.status ?? 1;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, version, hint: "add ~/.local/bin to PATH" }));
  } else {
    console.log(`Installed celld ${version}. Verify: celld --version`);
  }
  return 0;
}

export async function runStreamsCelldDeploy(opts: StreamsCelldCliOptions): Promise<number> {
  requireCelld();
  const project = resolve(opts.project ?? defaultProjectDir());
  if (!existsSync(join(project, "wrangler.jsonc"))) {
    console.error(`No wrangler.jsonc in ${project}`);
    return 1;
  }
  return runCelld(["deploy", ".", ...bucketArgs(opts)], { cwd: project });
}

export async function runStreamsCelldStart(opts: StreamsCelldCliOptions): Promise<number> {
  requireCelld();
  const listen = opts.listen ?? process.env.CELLD_ADDR ?? "0.0.0.0:8080";
  const internal = opts.internalListen ?? process.env.CELLD_INTERNAL_ADDR ?? "0.0.0.0:8081";
  const advertise = opts.advertise ?? process.env.CELLD_ADVERTISE;
  const args = [...bucketArgs(opts), "--listen", listen, "--internal-listen", internal];
  if (advertise) args.push("--advertise", advertise);
  return runCelld(args);
}

export async function runStreamsCelldDiagnose(opts: StreamsCelldCliOptions): Promise<number> {
  requireCelld();
  return runCelld(["diagnose", ...bucketArgs(opts)]);
}

export async function runStreamsCelldBundleCheck(opts: StreamsCelldCliOptions): Promise<number> {
  const project = resolve(opts.project ?? defaultProjectDir());
  const script = join(project, "scripts", "bundle-check.mjs");
  if (!existsSync(script)) {
    console.error(`Missing ${script}`);
    return 1;
  }
  const res = spawnSync(process.execPath, [script], {
    cwd: project,
    stdio: "inherit",
  });
  return res.status ?? 1;
}

export async function runStreamsCelldDev(
  opts: StreamsCelldCliOptions & { port?: number }
): Promise<number> {
  requireCelld();
  const project = resolve(opts.project ?? defaultProjectDir());
  const port = opts.port ?? 9876;
  return runCelld(["dev", "--port", String(port)], { cwd: project });
}
