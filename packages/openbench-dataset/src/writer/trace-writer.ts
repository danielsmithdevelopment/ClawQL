import { createHash, randomUUID } from "node:crypto";
import type { OpenBenchTraceV1 } from "../schema/types.js";
import { assertOpenBenchTraceShape, sha256Json } from "../schema/validate.js";
import { LOCAL_REDACTION_POLICY_ID, redactionPolicyHash, scrubJsonValue } from "../scrub/local.js";
import type { DatasetBackend } from "../backends/types.js";

export type TraceWriterInput = {
  runId: string;
  taskId: string;
  armLabel: string;
  arm: "on" | "off";
  trial: number;
  phase?: number;
  model: string;
  harness: string;
  clawqlVersion: string;
  messages: OpenBenchTraceV1["messages"];
  toolCalls: OpenBenchTraceV1["tool_calls"];
  score: number;
  turns?: number | null;
  elapsedMs?: number | null;
  totalTokens?: number | null;
  hitTurnCap?: boolean;
  hitTimeCap?: boolean;
  hitTokenCap?: boolean;
  suitableForTraining: boolean;
  inferenceCallIds?: string[];
  collectedAt?: string;
  manifestId: string;
};

export type WormBatchManifest = {
  schema: "clawql.openbench.worm-manifest.v1";
  manifest_id: string;
  schema_version: "1.0";
  created_at: string;
  run_id: string;
  task_id: string;
  redaction: {
    policy_id: string;
    policy_hash: string;
    engine: string;
  };
  traces: Array<{
    file: string;
    trace_id: string;
    arm: string;
    trial: number;
    verdict: string;
    score: number;
    content_hash: string;
    redacted_hash: string;
  }>;
  batch_content_hash: string;
};

function scoreToVerdict(score: number): OpenBenchTraceV1["verdict"] {
  if (score >= 0.99) return "pass";
  if (score <= 0.01) return "fail";
  return "partial";
}

export class TraceWriter {
  private readonly traces: WormBatchManifest["traces"] = [];

  constructor(
    private readonly backend: DatasetBackend,
    private readonly opts: { dayPrefix: string; runId: string; taskId: string }
  ) {}

  async writeTrace(input: TraceWriterInput): Promise<OpenBenchTraceV1> {
    const collectedAt = input.collectedAt ?? new Date().toISOString();
    const policyHash = redactionPolicyHash();
    const pre: OpenBenchTraceV1 = {
      schema_version: "1.0",
      trace_id: randomUUID(),
      run_id: input.runId,
      task_id: input.taskId,
      arm: input.arm,
      arm_label: input.armLabel,
      phase: input.phase ?? 1,
      model: input.model,
      harness: input.harness,
      clawql_version: input.clawqlVersion,
      messages: input.messages,
      tool_calls: input.toolCalls,
      verdict: scoreToVerdict(input.score),
      verdict_source: "grader",
      score: input.score,
      grader_id: `openbench/${input.taskId}/checker.sh`,
      turns: input.turns ?? null,
      elapsed_ms: input.elapsedMs ?? null,
      total_tokens: input.totalTokens ?? null,
      hit_turn_cap: Boolean(input.hitTurnCap),
      hit_time_cap: Boolean(input.hitTimeCap),
      hit_token_cap: Boolean(input.hitTokenCap),
      presidio_version: LOCAL_REDACTION_POLICY_ID,
      redaction_policy_hash: policyHash,
      pii_fields_redacted: [],
      content_hash: "",
      redacted_hash: "",
      manifest_id: input.manifestId,
      collected_at: collectedAt,
      suitable_for_training: input.suitableForTraining,
      inference_call_ids: input.inferenceCallIds,
    };

    const forHash = { ...pre };
    delete (forHash as { content_hash?: string }).content_hash;
    delete (forHash as { redacted_hash?: string }).redacted_hash;
    delete (forHash as { pii_fields_redacted?: string[] }).pii_fields_redacted;
    const contentHash = sha256Json(forHash);

    const fields = new Set<string>();
    const scrubbed = scrubJsonValue(pre, fields) as OpenBenchTraceV1;
    scrubbed.content_hash = contentHash;
    scrubbed.pii_fields_redacted = [...fields].sort();
    const line = JSON.stringify(scrubbed);
    scrubbed.redacted_hash = createHash("sha256").update(line).digest("hex");
    const finalLine = JSON.stringify(scrubbed);
    assertOpenBenchTraceShape(scrubbed);

    const file = `${input.taskId}-${input.arm}-${String(input.trial).padStart(3, "0")}.jsonl`;
    const key = `raw/${this.opts.dayPrefix}/run-${this.opts.runId}/${this.opts.taskId}/${file}`;
    await this.backend.putObject(key, `${finalLine}\n`, "application/x-ndjson");

    this.traces.push({
      file,
      trace_id: scrubbed.trace_id,
      arm: scrubbed.arm,
      trial: input.trial,
      verdict: scrubbed.verdict,
      score: scrubbed.score,
      content_hash: scrubbed.content_hash,
      redacted_hash: scrubbed.redacted_hash,
    });
    return scrubbed;
  }

  async writeManifest(extra: { model?: string; clawqlVersion?: string } = {}): Promise<WormBatchManifest> {
    const createdAt = new Date().toISOString();
    const manifest: WormBatchManifest = {
      schema: "clawql.openbench.worm-manifest.v1",
      manifest_id: `ob-manifest-${this.opts.runId}-${this.opts.taskId}`,
      schema_version: "1.0",
      created_at: createdAt,
      run_id: this.opts.runId,
      task_id: this.opts.taskId,
      redaction: {
        policy_id: LOCAL_REDACTION_POLICY_ID,
        policy_hash: redactionPolicyHash(),
        engine: LOCAL_REDACTION_POLICY_ID,
      },
      traces: this.traces,
      batch_content_hash: sha256Json(this.traces),
    };
    void extra;
    const key = `manifests/${this.opts.dayPrefix}/run-${this.opts.runId}-${this.opts.taskId}.json`;
    await this.backend.putObject(key, `${JSON.stringify(manifest, null, 2)}\n`, "application/json");
    return manifest;
  }
}
