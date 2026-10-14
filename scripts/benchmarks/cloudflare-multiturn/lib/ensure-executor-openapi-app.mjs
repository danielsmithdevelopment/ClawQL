/**
 * Deploy / refresh the Executor OpenAPI app that fronts the CF replay mock.
 *
 * Uses liveOpenapiRouter(source: { document }, baseUrl: mock) so execute programs
 * call tools.* and the Executor host performs HTTP — QuickJS never needs fetch.
 *
 * Requires: executor CLI on PATH (or EXECUTOR_BIN), EXECUTOR_API_KEY, local serve.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_SLUG = "cf-zone-audit-mock";
const DEFAULT_NAME = "CF Zone Audit Mock";

function executorBin() {
  return (
    process.env.EXECUTOR_BIN ||
    (existsSync("/tmp/executor-v2/node_modules/.bin/executor")
      ? "/tmp/executor-v2/node_modules/.bin/executor"
      : "executor")
  );
}

function runExecutor(args, { json = true } = {}) {
  const bin = executorBin();
  const env = {
    ...process.env,
    EXECUTOR_HOST: process.env.EXECUTOR_HOST || "http://127.0.0.1:4312",
    EXECUTOR_DATA_DIR: process.env.EXECUTOR_DATA_DIR || "/tmp/executor-v2-data",
  };
  if (!env.EXECUTOR_API_KEY && existsSync("/tmp/executor-v2-data/api_key.txt")) {
    env.EXECUTOR_API_KEY = readFileSync("/tmp/executor-v2-data/api_key.txt", "utf8").trim();
  }
  if (existsSync("/tmp/executor-v2-data/enc_key.txt") && !env.EXECUTOR_ENCRYPTION_KEY) {
    env.EXECUTOR_ENCRYPTION_KEY = readFileSync("/tmp/executor-v2-data/enc_key.txt", "utf8").trim();
  }
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();
  if (r.status !== 0) {
    throw new Error(
      `executor(${bin}) ${args.join(" ")} failed status=${r.status}: ${err || out}`.slice(0, 2000)
    );
  }
  if (!json) return out;
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`executor ${args[0]} non-JSON: ${out.slice(0, 500)}`);
  }
}

/** Strip security + coerce identifier path/query schemas to string for Executor import. */
export function prepareExecutorOpenapiDocument(rawDoc, mockBase) {
  const doc = structuredClone(rawDoc);
  delete doc.security;
  const origin = new URL(mockBase).origin;
  doc.servers = [{ url: origin }];
  if (doc.components) delete doc.components.securitySchemes;

  const fixSchema = (s) => {
    if (!s || typeof s !== "object") return s;
    if (s.type === "object" && typeof s.description === "string" && s.description.startsWith("ref:#")) {
      return { type: "string", description: s.description };
    }
    return s;
  };
  const walkParams = (params) => {
    if (!Array.isArray(params)) return;
    for (const p of params) {
      if (p.schema) p.schema = fixSchema(p.schema);
    }
  };
  for (const item of Object.values(doc.paths || {})) {
    walkParams(item.parameters);
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      const op = item[method];
      if (!op) continue;
      delete op.security;
      walkParams(op.parameters);
    }
  }
  return { document: doc, origin };
}

function writeAppDir(document, origin, frameworkVersion) {
  const dir = join(tmpdir(), `cf-executor-app-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: DEFAULT_SLUG,
        private: true,
        type: "module",
        dependencies: { apps: frameworkVersion },
      },
      null,
      2
    ) + "\n"
  );
  writeFileSync(join(dir, "openapi-doc.ts"), `export const document = ${JSON.stringify(document)} as const;\n`);
  writeFileSync(
    join(dir, "index.ts"),
    `import { defineApp } from "apps";
import { liveOpenapiRouter } from "apps/openapi";
import { document } from "./openapi-doc.js";

const MOCK_ORIGIN = ${JSON.stringify(origin)};

export default defineApp({ accounts: {} }, async ({ cache, fetch, signal }) => ({
  tools: liveOpenapiRouter({
    source: { document },
    baseUrl: MOCK_ORIGIN,
    allowedOrigin: MOCK_ORIGIN,
    securitySchemes: {},
    methods: {},
    oauth: [],
    cache,
    fetch,
    signal,
  }),
}));
`
  );
  return dir;
}

/**
 * @param {object} opts
 * @param {string} opts.mockBase
 * @param {object} opts.openapiDoc curated OpenAPI document
 * @returns {{ appId: string, slug: string, deploymentId: string, origin: string }}
 */
export function ensureExecutorOpenapiApp({ mockBase, openapiDoc }) {
  const { document, origin } = prepareExecutorOpenapiDocument(openapiDoc, mockBase);
  const fw = runExecutor(["apps", "framework"]);
  const version = fw.version;
  if (!version) throw new Error("executor apps framework missing version");

  const list = runExecutor(["apps", "list"]);
  let app = (Array.isArray(list) ? list : []).find((a) => a.slug === DEFAULT_SLUG);
  const dir = writeAppDir(document, origin, version);

  if (!app) {
    app = runExecutor(["apps", "create", "--name", DEFAULT_NAME, "--files", dir]);
  }
  const deployed = runExecutor([
    "apps",
    "deploy",
    "--app",
    app.id,
    "--files",
    dir,
    "--message",
    `cf mock ${origin}`,
  ]);
  const active =
    deployed?.app?.activeDeployment || deployed?.deployment?.id || app.activeDeployment;
  return {
    appId: app.id,
    slug: DEFAULT_SLUG,
    deploymentId: active,
    origin,
    frameworkVersion: version,
  };
}
