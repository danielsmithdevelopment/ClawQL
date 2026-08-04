import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenBenchTraceV1 } from "../schema/types.js";
import { TraceWriter } from "../writer/trace-writer.js";
import { LocalFsBackend } from "../backends/types.js";
import { scrubJsonValue, scrubTextLocal } from "../scrub/local.js";

export type CollectFromResultsOptions = {
  artifactDir: string;
  runId: string;
  taskId?: string;
  model?: string;
  phase?: number;
  clawqlVersion?: string;
};

type TrialDetail = {
  trial?: number;
  arm?: string;
  workdir?: string;
  agent?: Record<string, unknown>;
  checker?: Record<string, unknown>;
};

function armBucket(armLabel: string): "on" | "off" {
  const label = (armLabel || "").toLowerCase();
  if (label.endsWith("-off") || label.includes("off")) return "off";
  return "on";
}

function extractToolCalls(logText: string): OpenBenchTraceV1["tool_calls"] {
  const tools: OpenBenchTraceV1["tool_calls"] = [];
  const seen = new Set<string>();
  for (const line of logText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const part = obj.part as Record<string, unknown> | undefined;
      if (!part || typeof part.tool !== "string" || !part.tool || part.tool === "invalid") continue;
      const state = (part.state as Record<string, unknown> | undefined) ?? {};
      const key = `${part.tool}:${JSON.stringify(state.input ?? "").slice(0, 200)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry: OpenBenchTraceV1["tool_calls"][number] = { tool: part.tool };
      if ("input" in state) entry.input = state.input;
      if ("output" in state) entry.output = state.output;
      tools.push(entry);
    } catch {
      /* skip */
    }
  }
  return tools;
}

async function readMaybe(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function correlationMatches(
  correlationId: string | undefined,
  armLabel: string,
  trial: number,
  runId: string
): boolean {
  if (!correlationId) return false;
  const needle = `openbench/${armLabel}/${trial}/${runId}`;
  const alt = `openbench|${armLabel}|${trial}|${runId}`;
  return correlationId.includes(needle) || correlationId.includes(alt) || correlationId.includes(armLabel);
}

/**
 * Build OpenBenchTrace pack under `$artifactDir/dataset/` from OpenBench results.json.
 */
export async function collectFromResults(opts: CollectFromResultsOptions): Promise<{
  datasetDir: string;
  traceCount: number;
  suitableCount: number;
  callStoreRecords: number;
  manifestId: string;
}> {
  const resultsPath = join(opts.artifactDir, "results.json");
  const results = JSON.parse(await readFile(resultsPath, "utf8")) as Record<string, unknown>;
  const taskId = opts.taskId || String(results.task || "unknown");
  const model = opts.model || String(results.model || "unknown");
  const harness = String(results.harness || "opencode");
  const trials = (results.trials_detail as TrialDetail[]) || [];
  if (!trials.length) {
    throw new Error("results.json has no trials_detail");
  }

  const callStorePath =
    process.env.CLAWQL_INFERENCE_STORE_PATH?.trim() ||
    join(opts.artifactDir, "call-store", "calls.jsonl");
  const callRaw = await readMaybe(callStorePath);
  const callRecords: Array<Record<string, unknown>> = [];
  for (const line of callRaw.split("\n")) {
    if (!line.trim()) continue;
    try {
      callRecords.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      /* skip */
    }
  }

  const datasetDir = join(opts.artifactDir, "dataset");
  const localRoot = datasetDir;
  const backend = new LocalFsBackend(localRoot);
  // Writer keys are absolute under backend root — use empty day prefix layout locally:
  // we write traces/ and manifests via a thin adapter.
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  const writer = new TraceWriter(
    {
      name: "local-pack",
      async putObject(key: string, body: string | Buffer, contentType?: string) {
        // Remap raw/.../file → traces/file and manifests → MANIFEST.json
        if (key.includes("/manifests/") || key.startsWith("manifests/")) {
          await backend.putObject("MANIFEST.json", body, contentType);
          return;
        }
        const base = key.split("/").pop() || key;
        await backend.putObject(join("traces", base), body, contentType);
      },
    },
    { dayPrefix: day, runId: opts.runId, taskId }
  );

  const manifestId = `ob-manifest-${opts.runId}-${taskId}`;
  let suitableCount = 0;

  for (const trial of trials) {
    const armLabel = String(trial.arm || "");
    const arm = armBucket(armLabel);
    const trialN = Number(trial.trial || 1);
    const agent = trial.agent || {};
    const checker = trial.checker || {};
    const score = Number(checker.score ?? 0);
    const success = checker.success === true || score >= 0.99;
    let logText = "";
    if (typeof agent.log_path === "string") {
      logText = await readMaybe(agent.log_path);
    }
    if (!logText && agent.output_tail) logText = String(agent.output_tail);

    let instruction = "";
    if (trial.workdir) {
      instruction = await readMaybe(join(String(trial.workdir), ".openbench_instruction.md"));
    }

    const corrIds = callRecords
      .filter((r) =>
        correlationMatches(String(r.correlationId || ""), armLabel, trialN, opts.runId)
      )
      .map((r) => String(r.id || ""))
      .filter(Boolean);

    // Prefer arm-matched call messages; else instruction + log fallback (no cross-arm leak).
    const matchedCalls = callRecords.filter((r) =>
      correlationMatches(String(r.correlationId || ""), armLabel, trialN, opts.runId)
    );
    const messages: OpenBenchTraceV1["messages"] = [];
    if (instruction.trim()) messages.push({ role: "user", content: instruction.trim() });
    for (const rec of matchedCalls) {
      for (const m of (rec.messages as OpenBenchTraceV1["messages"]) || []) {
        if (m?.role) messages.push({ role: m.role, content: m.content });
      }
      if (typeof rec.response === "string" && rec.response.trim()) {
        messages.push({ role: "assistant", content: rec.response });
      }
    }
    if (messages.length <= 1 && logText.trim()) {
      messages.push({ role: "assistant", content: logText.slice(-12000) });
    }

    const suitable = Boolean(agent.completed) && success && !agent.timed_out;
    if (suitable) suitableCount += 1;

    await writer.writeTrace({
      runId: opts.runId,
      taskId,
      armLabel,
      arm,
      trial: trialN,
      phase: opts.phase ?? 1,
      model,
      harness,
      clawqlVersion: opts.clawqlVersion || process.env.GITHUB_SHA || "unknown",
      messages,
      toolCalls: extractToolCalls(logText),
      score,
      turns: typeof agent.turns === "number" ? agent.turns : null,
      elapsedMs:
        typeof agent.wall_s === "number" ? Math.round(Number(agent.wall_s) * 1000) : null,
      totalTokens: typeof agent.tokens === "number" ? agent.tokens : null,
      hitTurnCap: Boolean(agent.timed_out),
      hitTimeCap: Boolean(agent.timed_out),
      hitTokenCap: false,
      suitableForTraining: suitable,
      inferenceCallIds: corrIds.slice(0, 200),
      manifestId,
    });
  }

  await writer.writeManifest({ model, clawqlVersion: opts.clawqlVersion });

  // Scrubbed companion call-store
  await mkdir(join(datasetDir, "call-store"), { recursive: true });
  const fields = new Set<string>();
  const scrubbedLines = callRecords.map((rec) => {
    const scrubbed = scrubJsonValue(rec, fields);
    return JSON.stringify(scrubbed);
  });
  await writeFile(
    join(datasetDir, "call-store", "calls.jsonl"),
    scrubbedLines.length ? scrubbedLines.join("\n") + "\n" : "",
    "utf8"
  );

  // Ship schema copy
  const schemaSrc = join(dirname(fileURLToPath(import.meta.url)), "../../schema/openbench-trace.v1.json");
  await mkdir(join(datasetDir, "schema"), { recursive: true });
  try {
    await copyFile(schemaSrc, join(datasetDir, "schema", "openbench-trace.v1.json"));
  } catch {
    /* optional */
  }

  await writeFile(
    join(opts.artifactDir, "trace-session-labels.json"),
    JSON.stringify(
      {
        schema: "clawql.openbench.trace-session-labels.v2",
        manifest_id: manifestId,
        task: taskId,
        run_id: opts.runId,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return {
    datasetDir,
    traceCount: trials.length,
    suitableCount,
    callStoreRecords: callRecords.length,
    manifestId,
  };
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

void scrubTextLocal; // keep import used for tree-shaking clarity in scrub path
