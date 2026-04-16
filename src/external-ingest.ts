/**
 * MCP tool `ingest_external_knowledge` — bulk import from external systems into the vault (GitHub #40).
 * Stub only: contract + roadmap; providers are future work.
 */

import { getObsidianVaultPath } from "./vault-config.js";
import { logMcpToolShape } from "./mcp-tool-log.js";

export type ExternalIngestInput = {
  /** Target system label for future providers (e.g. notion, confluence, github). */
  source?: string;
  /** When true (default), no side effects even after providers exist. */
  dryRun?: boolean;
  /** Reserved: workspace / repo / space id for provider-specific scoping. */
  scope?: string;
};

export type ExternalIngestResult = {
  ok: boolean;
  stub: true;
  /** `CLAWQL_EXTERNAL_INGEST=1` — opt-in to preview responses; full import not implemented yet. */
  enabled: boolean;
  vaultConfigured: boolean;
  hint?: string;
  message: string;
  roadmap: string[];
  relatedIssues: number[];
};

/** Opt-in for stub/preview JSON; real providers will require this (or successor) flag. */
export function externalIngestFeatureEnabled(): boolean {
  return process.env.CLAWQL_EXTERNAL_INGEST?.trim() === "1";
}

export async function runIngestExternalKnowledge(
  input: ExternalIngestInput
): Promise<ExternalIngestResult> {
  const vaultConfigured = getObsidianVaultPath() !== null;
  const enabled = externalIngestFeatureEnabled();
  const dryRun = input.dryRun !== false;

  if (!enabled) {
    return {
      ok: false,
      stub: true,
      enabled: false,
      vaultConfigured,
      hint: "External bulk ingest is not enabled. Set CLAWQL_EXTERNAL_INGEST=1 to receive the stub roadmap JSON (still no network import). See docs/external-ingest.md.",
      message:
        "Feature disabled. This MCP tool is reserved for future bulk import (Notion, Confluence, GitHub, …) into the vault and memory.db pipeline used by memory_ingest / memory_recall.",
      roadmap: [],
      relatedIssues: [40, 24, 25, 27],
    };
  }

  const src = input.source?.trim() || "unspecified";
  return {
    ok: true,
    stub: true,
    enabled: true,
    vaultConfigured,
    message:
      `Stub preview only (no HTTP calls). source=${JSON.stringify(src)}, dryRun=${dryRun}. ` +
      "Imported Markdown would flow through the same vault layout as memory_ingest; memory.db sync and memory_recall would apply once content exists under CLAWQL_MEMORY_RECALL_SCAN_ROOT.",
    roadmap: [
      "Provider plugins behind a small interface (listDocuments, fetchBody, normalizeToMarkdown).",
      "Secrets: per-provider env vars (e.g. NOTION_TOKEN); never logged; see docs/external-ingest.md.",
      "Rate limits and backoff: caller/provider responsibility; document quotas per vendor.",
      "Dedup / membership: optional Cuckoo layer (#25) for large corpora.",
      "Orchestration: chunked writes + syncMemoryDbForVaultScanRoot + updateProviderIndexPage.",
    ],
    relatedIssues: [40, 24, 25, 27],
  };
}

export async function handleIngestExternalKnowledgeToolInput(
  params: ExternalIngestInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("ingest_external_knowledge", {
    sourceChars: params.source?.length ?? 0,
    dryRun: params.dryRun !== false,
    hasScope: Boolean(params.scope?.trim()),
  });
  const result = await runIngestExternalKnowledge(params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
