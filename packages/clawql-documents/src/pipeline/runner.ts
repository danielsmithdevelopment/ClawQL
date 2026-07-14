/**
 * Automated multi-hop IDP pipeline runner ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)).
 * Public Promise API; orchestration is native Effect.gen in {@link runIdpPipelineEffect}.
 */

import { Effect } from "effect";
import type { McpToolResult } from "clawql-core";
import type { DocumentsPluginExecuteParams } from "../plugin/deps.js";
import { runIdpPipelineEffect } from "../effect/idp-pipeline-effect.js";
import type { IdpPipelineStage, IdpPipelineStep } from "./idp-pipeline.js";

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
  document_url?: string;
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

/** Promise façade over {@link runIdpPipelineEffect} (tests + legacy callers). */
export async function runIdpPipeline(
  input: RunIdpPipelineInput,
  options: RunIdpPipelineOptions
): Promise<RunIdpPipelineResult> {
  return Effect.runPromise(runIdpPipelineEffect(input, options));
}
