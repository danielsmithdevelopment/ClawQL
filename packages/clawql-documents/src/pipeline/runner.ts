/**
 * Automated multi-hop IDP pipeline runner ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)).
 * Executes `DEFAULT_IDP_PIPELINE` (or a custom step list) via injected `execute`, with per-hop retries and Merkle snapshots.
 */

import type { McpToolResult } from "clawql-core";
import type { DocumentsPluginExecuteParams } from "../plugin/deps.js";
import { resolveArgsTemplate, type ArgsTemplateContext } from "./args-template.js";
import { idpPipelineMaxRetries, idpPipelineRetryDelayMs, merklePerHopEnabled } from "./env.js";
import {
  DEFAULT_IDP_PIPELINE,
  pipelineStepsForDashboard,
  type IdpPipelineStage,
  type IdpPipelineStep,
} from "./idp-pipeline.js";

export type PipelineExecuteFn = (params: DocumentsPluginExecuteParams) => Promise<McpToolResult>;

export type PipelineHopMerkleSnapshot = {
  rootHex: string;
  leafCount: number;
  treeHeight: number;
  builtAt: string;
};

export type PipelineHopResult = {
  index: number;
  stage: IdpPipelineStage;
  operationId: string;
  label: string;
  ok: boolean;
  skipped: boolean;
  attempts: number;
  latency_ms: number;
  args: Record<string, unknown>;
  error?: string;
  response_excerpt?: string;
  merkle_snapshot?: PipelineHopMerkleSnapshot | null;
};

export type RunIdpPipelineInput = {
  dry_run?: boolean;
  pipeline?: IdpPipelineStep[];
  step_args?: Record<string, Record<string, unknown>>;
  skip_stages?: IdpPipelineStage[];
  stop_on_error?: boolean;
  max_retries?: number;
  correlation_id?: string;
  document_path?: string;
  processed_path?: string;
  from_step?: number;
  to_step?: number;
};

export type RunIdpPipelineResult = {
  ok: boolean;
  dry_run: boolean;
  correlation_id?: string;
  completed_through: number;
  halted_at_operation_id?: string;
  error?: string;
  hops: PipelineHopResult[];
  dashboard_steps: Array<{ label: string; state: "done" | "active" | "pending" }>;
};

export type PipelineHopHookEvent = {
  correlation_id?: string;
  hop: PipelineHopResult;
  pipeline: IdpPipelineStep[];
};

export type RunIdpPipelineOptions = {
  execute: PipelineExecuteFn;
  onHop?: (event: PipelineHopHookEvent) => void | Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseExecuteText(text: string): { ok: boolean; error?: string; excerpt: string } {
  const excerpt = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
      return { ok: false, error: String(parsed.error), excerpt };
    }
  } catch {
    /* non-JSON bodies may still be success for binary-ish providers */
  }
  return { ok: true, excerpt };
}

async function loadMerkleSnapshot(): Promise<PipelineHopMerkleSnapshot | null | undefined> {
  if (!merklePerHopEnabled()) return undefined;
  try {
    const { getObsidianVaultPath } = await import("clawql-memory/vault/config");
    const vault = getObsidianVaultPath();
    if (!vault) return null;
    const { loadVaultMerkleSnapshotFromDb, memoryDbSyncEnabled } =
      await import("clawql-memory/db/memory-db");
    if (!memoryDbSyncEnabled()) return null;
    const snap = await loadVaultMerkleSnapshotFromDb(vault);
    return snap ?? null;
  } catch {
    return null;
  }
}

function resolveStepArgs(
  step: IdpPipelineStep,
  input: RunIdpPipelineInput,
  ctx: ArgsTemplateContext
): Record<string, unknown> {
  const explicit = input.step_args?.[step.operationId];
  if (explicit) {
    return resolveArgsTemplate(explicit, ctx) as Record<string, unknown>;
  }
  if (step.argsTemplate) {
    return resolveArgsTemplate(step.argsTemplate, ctx) as Record<string, unknown>;
  }
  return {};
}

function slicePipeline(
  pipeline: IdpPipelineStep[],
  fromStep?: number,
  toStep?: number
): IdpPipelineStep[] {
  const from = Math.max(0, fromStep ?? 0);
  const to = toStep !== undefined ? Math.min(pipeline.length, toStep + 1) : pipeline.length;
  return pipeline.slice(from, to);
}

export async function runIdpPipeline(
  input: RunIdpPipelineInput,
  options: RunIdpPipelineOptions
): Promise<RunIdpPipelineResult> {
  const pipeline = slicePipeline(
    input.pipeline ?? DEFAULT_IDP_PIPELINE,
    input.from_step,
    input.to_step
  );
  const skip = new Set((input.skip_stages ?? []).map((s) => s.toLowerCase()));
  const dryRun = input.dry_run !== false;
  const stopOnError = input.stop_on_error !== false;
  const maxRetries = input.max_retries ?? idpPipelineMaxRetries();
  const retryDelayMs = idpPipelineRetryDelayMs();
  const ctx: ArgsTemplateContext = {
    document_path: input.document_path,
    processed_path: input.processed_path,
  };

  const hops: PipelineHopResult[] = [];
  let completedThrough = -1;
  let haltedAt: string | undefined;
  let fatalError: string | undefined;

  for (let index = 0; index < pipeline.length; index++) {
    const step = pipeline[index]!;
    const skipped = skip.has(step.stage);
    const args = resolveStepArgs(step, input, ctx);

    if (skipped) {
      const hop: PipelineHopResult = {
        index,
        stage: step.stage,
        operationId: step.operationId,
        label: step.label,
        ok: true,
        skipped: true,
        attempts: 0,
        latency_ms: 0,
        args,
      };
      hops.push(hop);
      completedThrough = index;
      if (options.onHop) {
        await options.onHop({ correlation_id: input.correlation_id, hop, pipeline });
      }
      continue;
    }

    if (dryRun) {
      const hop: PipelineHopResult = {
        index,
        stage: step.stage,
        operationId: step.operationId,
        label: step.label,
        ok: true,
        skipped: false,
        attempts: 0,
        latency_ms: 0,
        args,
        response_excerpt: "(dry run — execute not called)",
      };
      hops.push(hop);
      completedThrough = index;
      if (options.onHop) {
        await options.onHop({ correlation_id: input.correlation_id, hop, pipeline });
      }
      continue;
    }

    let attempts = 0;
    let ok = false;
    let error: string | undefined;
    let excerpt: string | undefined;
    const started = Date.now();

    while (attempts <= maxRetries) {
      attempts++;
      try {
        const result = await options.execute({
          operationId: step.operationId,
          args,
        });
        const text = result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
        const parsed = parseExecuteText(text);
        if (parsed.ok) {
          ok = true;
          excerpt = parsed.excerpt;
          break;
        }
        error = parsed.error ?? "execute returned error payload";
        excerpt = parsed.excerpt;
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      }
      if (attempts <= maxRetries && retryDelayMs > 0) {
        await sleep(retryDelayMs * attempts);
      }
    }

    const merkle_snapshot = ok ? await loadMerkleSnapshot() : undefined;
    const hop: PipelineHopResult = {
      index,
      stage: step.stage,
      operationId: step.operationId,
      label: step.label,
      ok,
      skipped: false,
      attempts,
      latency_ms: Date.now() - started,
      args,
      error,
      response_excerpt: excerpt,
      merkle_snapshot,
    };
    hops.push(hop);
    if (options.onHop) {
      await options.onHop({ correlation_id: input.correlation_id, hop, pipeline });
    }

    if (ok) {
      completedThrough = index;
      continue;
    }

    haltedAt = step.operationId;
    fatalError = error ?? `step failed: ${step.operationId}`;
    if (stopOnError) break;
  }

  const allHopsOk = hops.length === pipeline.length && hops.every((h) => h.ok);
  const pipelineSucceeded = allHopsOk && !haltedAt;
  const dashboardCompletedThrough = pipelineSucceeded
    ? pipeline.length
    : Math.max(0, completedThrough);
  const dashboard_steps = pipelineStepsForDashboard(pipeline, dashboardCompletedThrough);

  return {
    ok: pipelineSucceeded,
    dry_run: dryRun,
    correlation_id: input.correlation_id,
    completed_through: completedThrough,
    halted_at_operation_id: haltedAt,
    error: fatalError,
    hops,
    dashboard_steps,
  };
}
