/**
 * Default Wonder / Reflect / Executor / Evaluator for Ouroboros when no LLM wiring exists yet (#141).
 * Executor returns structured JSON; evaluator checks for a synthetic error marker.
 */

import type { Evaluator, Executor, ReflectEngine, Seed, WonderEngine } from "clawql-ouroboros";
import { isGoogleDiscoverySpecLabel } from "../auth-headers.js";

type ToolTextResponse = { content?: Array<{ type?: string; text?: string }> };
const KNOWN_PROVIDERS = ["github", "cloudflare", "slack", "jira", "gcp", "google"] as const;

export type OuroborosToolBridge = {
  search?: (query: string, limit: number) => Promise<ToolTextResponse>;
  execute?: (params: {
    operationId: string;
    args: Record<string, unknown>;
    fields?: string[];
  }) => Promise<ToolTextResponse>;
};

function firstText(response: ToolTextResponse): string | null {
  const block = response.content?.find((c) => c.type === "text" && typeof c.text === "string");
  return block?.text ?? null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length > 0 ? out : undefined;
}

function parseExecutionOutput(v: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(v));
  } catch {
    return null;
  }
}

function providersMentionedInAc(acceptanceCriteria: string[]): Set<string> {
  const providers = new Set<string>();
  for (const criterion of acceptanceCriteria) {
    const lc = criterion.toLowerCase();
    for (const provider of KNOWN_PROVIDERS) {
      if (lc.includes(provider)) providers.add(provider);
    }
  }
  return providers;
}

function mergedSpecPrefix(operationId: string): string | undefined {
  const m = operationId.match(/^([a-z0-9-]+)::/i);
  return m ? m[1].toLowerCase() : undefined;
}

function canonicalOperationId(operationId: string): string {
  const idx = operationId.indexOf("::");
  return (idx >= 0 ? operationId.slice(idx + 2) : operationId).toLowerCase();
}

function addProvidersFromMergedPrefix(operationId: string, providers: Set<string>): void {
  const prefix = mergedSpecPrefix(operationId);
  if (!prefix) return;
  if (prefix === "github") providers.add("github");
  if (prefix === "cloudflare") providers.add("cloudflare");
  if (prefix === "slack") providers.add("slack");
  if (prefix === "onyx") providers.add("onyx");
  if (prefix === "jira" || prefix === "bitbucket") providers.add("jira");
  if (isGoogleDiscoverySpecLabel(prefix)) {
    providers.add("google");
    providers.add("gcp");
  }
}

function providersCoveredByExecution(outputObj: Record<string, unknown> | null): Set<string> {
  const providers = new Set<string>();
  if (!outputObj) return providers;
  const inferByOperationId = (operationIdRaw: unknown) => {
    const raw = typeof operationIdRaw === "string" ? operationIdRaw : "";
    if (!raw) return;
    addProvidersFromMergedPrefix(raw, providers);
    const canon = canonicalOperationId(raw);
    const firstSeg = canon.split("/").filter(Boolean)[0] ?? "";
    if (firstSeg === "github") providers.add("github");
    if (firstSeg === "cloudflare") providers.add("cloudflare");
    if (
      canon.startsWith("repos/") ||
      canon.includes("/repos/") ||
      /(^|\/)(repos|issues|pulls|gists|actions)(\/|-|$)/.test(canon)
    ) {
      providers.add("github");
    }
    if (
      canon === "zones-get" ||
      canon.endsWith("/zones-get") ||
      canon.includes("dns-records") ||
      canon.includes("cloudflare")
    ) {
      providers.add("cloudflare");
    }
    // Google Cloud Discovery-style ids (e.g. run.projects.locations.services.list)
    if (/^[a-z][a-z0-9.]*\.[a-z0-9.]+$/i.test(canon)) {
      const dots = (canon.match(/\./g) ?? []).length;
      if (dots >= 2) {
        providers.add("google");
        providers.add("gcp");
      }
    }
    // Slack Web API (underscore ids; bundled ops rarely collide with other vendors)
    if (
      /^slack::/i.test(raw) ||
      (canon.startsWith("chat_") && !canon.includes("/") && !canon.includes(".")) ||
      (canon.startsWith("conversations_") && !canon.includes("/") && !canon.includes("."))
    ) {
      providers.add("slack");
    }
    if (/^onyx::/i.test(raw) || mergedSpecPrefix(raw) === "onyx") {
      providers.add("onyx");
    }
  };

  const stepsRaw = Array.isArray(outputObj.steps) ? outputObj.steps : [];
  const steps =
    stepsRaw.length > 0 ? stepsRaw : outputObj.operationId !== undefined ? [outputObj] : [];
  for (const step of steps) {
    const s = asRecord(step);
    if (!s) continue;
    inferByOperationId(s.operationId);
  }
  return providers;
}

type ExecuteRouteHint = {
  route: "execute";
  operationId: string;
  args: Record<string, unknown>;
  fields?: string[];
};

type SearchRouteHint = {
  route: "search";
  searchQuery: string;
  searchLimit?: number;
};

type RouteHint = ExecuteRouteHint | SearchRouteHint;

function routeHintsFromSeed(seed: Seed): RouteHint[] {
  const hints: RouteHint[] = [];
  const refs = seed.brownfield_context?.context_references ?? [];
  for (const ref of refs) {
    const rec = asRecord(ref);
    if (!rec) continue;

    const exec = asRecord(rec.clawql_execute);
    if (exec) {
      const operationId = exec.operationId;
      if (typeof operationId === "string" && operationId) {
        hints.push({
          route: "execute",
          operationId,
          args: asRecord(exec.args) ?? {},
          fields: asStringArray(exec.fields),
        });
      }
    }

    const search = asRecord(rec.clawql_search);
    if (search) {
      const searchQuery = search.query;
      if (typeof searchQuery === "string" && searchQuery) {
        hints.push({
          route: "search",
          searchQuery,
          searchLimit:
            typeof search.limit === "number" && Number.isFinite(search.limit)
              ? search.limit
              : undefined,
        });
      }
    }
  }

  if (hints.length > 0) {
    return hints;
  }

  const metadata = seed.metadata;
  const fallbackHints: RouteHint[] = [];
  if (typeof metadata.operationId === "string" && metadata.operationId) {
    fallbackHints.push({
      route: "execute",
      operationId: metadata.operationId,
      args: (metadata.args as Record<string, unknown> | undefined) ?? {},
      fields: metadata.fields,
    });
  }
  if (typeof metadata.searchQuery === "string" && metadata.searchQuery) {
    fallbackHints.push({
      route: "search",
      searchQuery: metadata.searchQuery,
      searchLimit:
        typeof metadata.searchLimit === "number" && Number.isFinite(metadata.searchLimit)
          ? metadata.searchLimit
          : undefined,
    });
  }
  return fallbackHints;
}

function envTruthyOnyxAfterPaperless(): boolean {
  const v = process.env.CLAWQL_OUROBOROS_ONYX_AFTER_PAPERLESS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseLooseJsonObject(text: string | null): Record<string, unknown> | null {
  if (!text || !text.trim()) return null;
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractPaperlessDocumentId(obj: Record<string, unknown>): string | number | null {
  if (typeof obj.id === "number" && Number.isFinite(obj.id)) return obj.id;
  if (typeof obj.id === "string" && obj.id.trim()) return obj.id.trim();
  const nested = obj.document;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const d = nested as Record<string, unknown>;
    if (typeof d.id === "number" && Number.isFinite(d.id)) return d.id;
    if (typeof d.id === "string" && d.id.trim()) return d.id.trim();
  }
  return null;
}

function isPaperlessExecuteOperationId(operationId: string): boolean {
  const prefix = mergedSpecPrefix(operationId);
  if (prefix === "paperless") return true;
  const canon = canonicalOperationId(operationId);
  return /paperless/i.test(canon);
}

function stablePaperlessDocKey(docId: string | number): string {
  return typeof docId === "number" ? String(docId) : docId.trim() || String(docId);
}

function buildOnyxIngestArgsFromPaperlessResult(
  docId: string | number,
  paperlessPayload: Record<string, unknown>
): Record<string, unknown> {
  const key = stablePaperlessDocKey(docId);
  const syntheticId = `paperless-${key}`;
  const title = typeof paperlessPayload.title === "string" ? paperlessPayload.title : undefined;
  const text =
    typeof paperlessPayload.content === "string"
      ? paperlessPayload.content
      : typeof paperlessPayload.title === "string"
        ? paperlessPayload.title
        : `Indexed from Paperless document ${key}`;
  return {
    document: {
      id: syntheticId,
      ...(title ? { title } : {}),
      semantic_identifier: syntheticId,
      source: "ingestion_api",
      sections: [{ text }],
    },
  };
}

async function appendOnyxIngestAfterPaperlessIfConfigured(
  seed: Seed,
  steps: Array<Record<string, unknown>>,
  bridge: OuroborosToolBridge | undefined
): Promise<void> {
  if (!bridge?.execute) return;
  if (!envTruthyOnyxAfterPaperless()) return;
  if (!seed.metadata.onyx_ingest_after_paperless) return;

  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!step || step.route !== "execute") continue;
    const operationId = typeof step.operationId === "string" ? step.operationId : "";
    if (!isPaperlessExecuteOperationId(operationId)) continue;

    const payload = parseLooseJsonObject(typeof step.result === "string" ? step.result : null);
    if (!payload) continue;
    const docId = extractPaperlessDocumentId(payload);
    if (docId === null) continue;

    const args = buildOnyxIngestArgsFromPaperlessResult(docId, payload);
    const ccRaw = process.env.CLAWQL_ONYX_CC_PAIR_ID?.trim();
    if (ccRaw && /^\d+$/.test(ccRaw)) {
      (args as { cc_pair_id?: number }).cc_pair_id = Number.parseInt(ccRaw, 10);
    }

    try {
      const response = await bridge.execute({
        operationId: "onyx::onyx_ingest_document",
        args,
      });
      steps.push({
        route: "execute",
        operationId: "onyx::onyx_ingest_document",
        args,
        result: firstText(response),
        bridge_step: "onyx_after_paperless",
      });
    } catch (err) {
      steps.push({
        route: "execute",
        operationId: "onyx::onyx_ingest_document",
        args,
        result: JSON.stringify({
          kind: "partial_failure",
          phase: "onyx_after_paperless",
          detail: err instanceof Error ? err.message : String(err),
        }),
        bridge_step: "onyx_after_paperless_failed",
      });
    }
    return;
  }
}

export function createDefaultOuroborosEngines(): {
  wonder: WonderEngine;
  reflect: ReflectEngine;
  execute: Executor;
  evaluate: Evaluator;
};
export function createDefaultOuroborosEngines(bridge: OuroborosToolBridge): {
  wonder: WonderEngine;
  reflect: ReflectEngine;
  execute: Executor;
  evaluate: Evaluator;
};
export function createDefaultOuroborosEngines(bridge?: OuroborosToolBridge): {
  wonder: WonderEngine;
  reflect: ReflectEngine;
  execute: Executor;
  evaluate: Evaluator;
} {
  const wonder: WonderEngine = {
    wonder: async (_seed, _previousEvaluation) => ({
      insights: [],
      suggested_refinements: [],
      requires_evolution: false,
    }),
  };

  const reflect: ReflectEngine = {
    reflect: async (_seed, _executionOutput, _evaluation, _wonder) => ({
      newSeedData: {},
      rationale: "clawql-mcp default reflect (no-op)",
    }),
  };

  const execute: Executor = {
    execute: async (seed: Seed) => {
      const hints = routeHintsFromSeed(seed);
      if (hints.length > 0 && bridge) {
        const steps: Array<Record<string, unknown>> = [];
        for (const hint of hints) {
          if (hint.route === "execute" && bridge.execute) {
            const response = await bridge.execute({
              operationId: hint.operationId,
              args: hint.args,
              fields: hint.fields,
            });
            steps.push({
              route: "execute",
              operationId: hint.operationId,
              args: hint.args,
              fields: hint.fields,
              result: firstText(response),
            });
            continue;
          }
          if (hint.route === "search" && bridge.search) {
            const searchLimitRaw = hint.searchLimit;
            const searchLimit =
              typeof searchLimitRaw === "number" && Number.isFinite(searchLimitRaw)
                ? Math.min(Math.max(Math.floor(searchLimitRaw), 1), 50)
                : 5;
            const response = await bridge.search(hint.searchQuery, searchLimit);
            steps.push({
              route: "search",
              searchQuery: hint.searchQuery,
              searchLimit,
              result: firstText(response),
            });
          }
        }

        await appendOnyxIngestAfterPaperlessIfConfigured(seed, steps, bridge);

        if (steps.length === 1) {
          return JSON.stringify({
            kind: "clawql-ouroboros-default-execute",
            goal: seed.goal,
            ...steps[0],
          });
        }

        if (steps.length > 1) {
          return JSON.stringify({
            kind: "clawql-ouroboros-default-execute",
            route: "multi",
            goal: seed.goal,
            steps,
          });
        }
      }

      return JSON.stringify({
        kind: "clawql-ouroboros-default-execute",
        goal: seed.goal,
        note: "No internal tool route selected. Set context_references clawql_execute/clawql_search hints (or metadata fallback for internal callers).",
      });
    },
  };

  const evaluate: Evaluator = {
    evaluate: async (executionOutput: string, seed: Seed) => {
      const failed =
        /"kind"\s*:\s*"error"/i.test(executionOutput) || /\berror\b/i.test(executionOutput);
      const coveredProviders = providersCoveredByExecution(parseExecutionOutput(executionOutput));
      const ac_results = seed.acceptance_criteria.map((c, i) => ({
        ...(() => {
          const requiredProviders = providersMentionedInAc([c]);
          const missingProviders = [...requiredProviders].filter((p) => !coveredProviders.has(p));
          const routeCoverageMissing = missingProviders.length > 0;
          return {
            passed: !failed && !routeCoverageMissing && executionOutput.length > 0,
            evidence: failed
              ? "default evaluator: error-like output"
              : routeCoverageMissing
                ? `default evaluator: missing provider evidence for [${missingProviders.join(", ")}]`
                : "default evaluator: non-empty output",
          };
        })(),
        ac_index: i,
        ac_content: c,
      }));
      const allPass = ac_results.every((a) => a.passed);
      return {
        final_approved: allPass,
        score: allPass ? 0.88 : 0.2,
        ac_results,
      };
    },
  };

  return { wonder, reflect, execute, evaluate };
}
