/**
 * Ensure Executor 1.x (stable) has the CF curated OpenAPI integration + no-auth
 * connection pointed at the replay mock. Uses CLI `openapi.addSpec` +
 * `connections.create` with auto-resume of approval pauses.
 *
 * Spec is passed as `kind: "blob"` (daemon cannot fetch ephemeral host URLs from
 * the approval sandbox). Requires: EXECUTOR_BIN (v1.6+), local daemon.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { prepareExecutorOpenapiDocument } from "./ensure-executor-openapi-app.mjs";

const DEFAULT_SLUG = "cf-zone-audit-mock";
const DEFAULT_CONN = "cf-mock";

function executorBin() {
  return (
    process.env.EXECUTOR_V1_BIN ||
    process.env.EXECUTOR_BIN ||
    (existsSync("/tmp/executor-try/node_modules/.bin/executor")
      ? "/tmp/executor-try/node_modules/.bin/executor"
      : "executor")
  );
}

function executorCwd() {
  return (
    process.env.EXECUTOR_V1_CWD ||
    process.env.EXECUTOR_CWD ||
    (existsSync("/tmp/executor-try/package.json") ? "/tmp/executor-try" : process.cwd())
  );
}

function assertOk(parsed, label) {
  if (parsed && typeof parsed === "object" && parsed.ok === false) {
    const err = parsed.error;
    const msg =
      typeof err === "string"
        ? err
        : err?.message || JSON.stringify(err || parsed).slice(0, 500);
    throw new Error(`${label}: ${msg}`);
  }
  return parsed;
}

function runCli(args, { json = false } = {}) {
  const bin = executorBin();
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    cwd: executorCwd(),
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").trim();
  const combined = `${out}\n${err}`;
  const eid = combined.match(/exec_[a-f0-9-]+/)?.[0];
  if (eid && /Execution paused/i.test(combined)) {
    const resume = spawnSync(
      bin,
      [
        "resume",
        "--execution-id",
        eid,
        "--base-url",
        process.env.EXECUTOR_V1_BASE_URL || "http://localhost:4788",
        "--action",
        "accept",
        "--content",
        "{}",
      ],
      {
        encoding: "utf8",
        cwd: executorCwd(),
        env: process.env,
        maxBuffer: 32 * 1024 * 1024,
      }
    );
    const rout = (resume.stdout || "").trim();
    if (resume.status !== 0) {
      throw new Error(
        `executor resume ${eid} failed: ${(resume.stderr || rout).slice(0, 1500)}`
      );
    }
    if (!json) return rout;
    let parsed;
    try {
      parsed = JSON.parse(rout);
    } catch {
      throw new Error(`executor resume non-JSON: ${rout.slice(0, 500)}`);
    }
    return assertOk(parsed, `executor resume ${args.slice(0, 4).join(" ")}`);
  }
  if (r.status !== 0 && !/already exists/i.test(combined)) {
    throw new Error(
      `executor(${bin}) ${args.join(" ").slice(0, 200)} failed status=${r.status}: ${combined.slice(0, 2000)}`
    );
  }
  if (!json) return out || combined;
  try {
    return assertOk(JSON.parse(out), `executor ${args.slice(0, 4).join(" ")}`);
  } catch (e) {
    if (e.message?.startsWith("executor ")) throw e;
    // soft success messages
    if (/already exists/i.test(combined)) return { alreadyExists: true, raw: combined };
    throw new Error(`executor non-JSON: ${out.slice(0, 500)}`);
  }
}

/**
 * @param {{ mockBase: string, openapiDoc: object, slug?: string, connectionName?: string }} opts
 */
export async function ensureExecutorV1Openapi({
  mockBase,
  openapiDoc,
  slug = process.env.EXECUTOR_V1_APP_SLUG || DEFAULT_SLUG,
  connectionName = process.env.EXECUTOR_V1_CONNECTION || DEFAULT_CONN,
}) {
  const { document, origin } = prepareExecutorOpenapiDocument(openapiDoc, mockBase);

  // Fresh point at this mock: drop prior connection/integration if present.
  for (const name of [connectionName, "cfMock", "cf-mock"]) {
    try {
      runCli(
        [
          "call",
          "executor",
          "coreTools",
          "connections",
          "remove",
          JSON.stringify({ owner: "user", name, integration: slug }),
        ],
        { json: true }
      );
    } catch {
      /* missing ok */
    }
  }
  try {
    runCli(
      ["call", "executor", "coreTools", "integrations", "remove", JSON.stringify({ slug })],
      { json: true }
    );
  } catch {
    /* missing ok */
  }

  // Blob avoids daemon fetch of ephemeral host URLs (sandbox cannot reach them).
  const addArg = JSON.stringify({
    spec: { kind: "blob", value: JSON.stringify(document) },
    slug,
    name: "CF Zone Audit Mock",
    baseUrl: origin,
    authenticationTemplate: [],
  });
  const added = runCli(["call", "executor", "openapi", "addSpec", addArg], { json: true });
  const toolCount = added?.data?.toolCount ?? added?.toolCount;
  if (toolCount == null || Number(toolCount) < 1) {
    throw new Error(
      `executor openapi.addSpec returned no tools: ${JSON.stringify(added).slice(0, 500)}`
    );
  }

  // connections.create camelCases "cf-mock" → "cfMock"
  const created = runCli(
    [
      "call",
      "executor",
      "coreTools",
      "connections",
      "create",
      JSON.stringify({
        owner: "user",
        name: connectionName,
        integration: slug,
        template: "none",
      }),
    ],
    { json: true }
  );
  const connName = created?.data?.name || created?.name || "cfMock";

  // Sanity: tool path must resolve after create.
  const probe = runCli(
    ["call", `${slug}.user.${connName}.zone.zonesGet`, "{}"],
    { json: true }
  );
  if (probe?.ok === false) {
    throw new Error(
      `executor_v1 probe zonesGet failed after ensure: ${JSON.stringify(probe.error || probe).slice(0, 400)}`
    );
  }

  return {
    slug,
    connectionName: connName,
    origin,
    runtimeVersion: "1.6.10",
    transport: "stdio",
    bin: executorBin(),
    cwd: executorCwd(),
    toolPathPrefix: `${slug}.user.${connName}`,
    toolCount: Number(toolCount),
  };
}
