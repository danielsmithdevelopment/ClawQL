/**
 * Native Effect.gen staging for {@link runIdpPipeline}:
 * prep → per-hop skip/dry-run/execute (+retry) → Merkle → onHop.
 * IO (execute, sleep, Merkle, hooks) stays behind {@link documentsFromPromise} / Effect.sleep.
 */

import { Duration, Effect, Either } from "effect";
import type { McpToolResult } from "clawql-core";
import {
  DEFAULT_IDP_PIPELINE,
  pipelineStepsForDashboard,
  type IdpPipelineStep,
} from "../pipeline/idp-pipeline.js";
import {
  idpPipelineMaxRetries,
  idpPipelineRetryDelayMs,
  merklePerHopEnabled,
} from "../pipeline/env.js";
import { resolveArgsTemplate, type ArgsTemplateContext } from "../pipeline/args-template.js";
import type {
  PipelineHopMerkleSnapshot,
  PipelineHopResult,
  RunIdpPipelineInput,
  RunIdpPipelineOptions,
  RunIdpPipelineResult,
} from "../pipeline/runner.js";
import { DocumentsError } from "./documents-errors.js";
import { documentsFromPromise } from "./documents-effect-utils.js";

export function sleepMs(ms: number): Effect.Effect<void> {
  return ms > 0 ? Effect.sleep(Duration.millis(ms)) : Effect.void;
}

export function parseExecuteText(text: string): { ok: boolean; error?: string; excerpt: string } {
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

export function loadMerkleSnapshotEffect(): Effect.Effect<
  PipelineHopMerkleSnapshot | null | undefined,
  DocumentsError
> {
  return documentsFromPromise(async () => {
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
  });
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

function mcpResultText(result: McpToolResult): string {
  return result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
}

function invokeOnHop(
  options: RunIdpPipelineOptions,
  input: RunIdpPipelineInput,
  hop: PipelineHopResult,
  pipeline: IdpPipelineStep[]
): Effect.Effect<void, DocumentsError> {
  if (!options.onHop) return Effect.void;
  const onHop = options.onHop;
  return documentsFromPromise(async () => {
    await onHop({ correlation_id: input.correlation_id, hop, pipeline });
  });
}

/**
 * IDP hop loop as Effect.gen. Hop execute failures are caught and retried;
 * the Effect succeeds with {@link RunIdpPipelineResult} (including `ok: false`).
 */
export function runIdpPipelineEffect(
  input: RunIdpPipelineInput,
  options: RunIdpPipelineOptions
): Effect.Effect<RunIdpPipelineResult, DocumentsError> {
  return Effect.gen(function* () {
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
      document_url: input.document_url,
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
        yield* invokeOnHop(options, input, hop, pipeline);
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
        yield* invokeOnHop(options, input, hop, pipeline);
        continue;
      }

      let attempts = 0;
      let ok = false;
      let error: string | undefined;
      let excerpt: string | undefined;
      const started = Date.now();

      while (attempts <= maxRetries) {
        attempts++;
        const execEither = yield* Effect.either(
          documentsFromPromise(() =>
            options.execute({
              operationId: step.operationId,
              args,
            })
          )
        );

        if (Either.isRight(execEither)) {
          const text = mcpResultText(execEither.right);
          const parsed = parseExecuteText(text);
          if (parsed.ok) {
            ok = true;
            excerpt = parsed.excerpt;
            break;
          }
          error = parsed.error ?? "execute returned error payload";
          excerpt = parsed.excerpt;
        } else {
          const cause = execEither.left.cause;
          error = cause instanceof Error ? cause.message : String(cause ?? execEither.left.reason);
        }

        if (attempts <= maxRetries && retryDelayMs > 0) {
          yield* sleepMs(retryDelayMs * attempts);
        }
      }

      const merkle_snapshot = ok ? yield* loadMerkleSnapshotEffect() : undefined;
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
      yield* invokeOnHop(options, input, hop, pipeline);

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
    } satisfies RunIdpPipelineResult;
  });
}
