/**
 * Default Wonder / Reflect / Executor / Evaluator for Ouroboros when no LLM wiring exists yet (#141).
 * Executor returns structured JSON; evaluator checks for a synthetic error marker.
 */

import type { Evaluator, Executor, ReflectEngine, Seed, WonderEngine } from "clawql-ouroboros";

type ToolTextResponse = { content?: Array<{ type?: string; text?: string }> };

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

function routeHintsFromSeed(seed: Seed): {
  operationId?: string;
  args?: Record<string, unknown>;
  fields?: string[];
  searchQuery?: string;
  searchLimit?: number;
} {
  const refs = seed.brownfield_context?.context_references ?? [];
  for (const ref of refs) {
    const rec = asRecord(ref);
    if (!rec) continue;

    const exec = asRecord(rec.clawql_execute);
    if (exec) {
      const operationId = exec.operationId;
      if (typeof operationId === "string" && operationId) {
        return {
          operationId,
          args: asRecord(exec.args) ?? {},
          fields: asStringArray(exec.fields),
        };
      }
    }

    const search = asRecord(rec.clawql_search);
    if (search) {
      const searchQuery = search.query;
      if (typeof searchQuery === "string" && searchQuery) {
        return {
          searchQuery,
          searchLimit:
            typeof search.limit === "number" && Number.isFinite(search.limit)
              ? search.limit
              : undefined,
        };
      }
    }
  }

  const metadata = asRecord(seed.metadata);
  return {
    operationId: typeof metadata?.operationId === "string" ? metadata.operationId : undefined,
    args: asRecord(metadata?.args) ?? undefined,
    fields: asStringArray(metadata?.fields),
    searchQuery: typeof metadata?.searchQuery === "string" ? metadata.searchQuery : undefined,
    searchLimit:
      typeof metadata?.searchLimit === "number" && Number.isFinite(metadata.searchLimit)
        ? metadata.searchLimit
        : undefined,
  };
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
      const operationId = hints.operationId;
      if (typeof operationId === "string" && operationId && bridge?.execute) {
        const args = hints.args ?? {};
        const fields = hints.fields;
        const response = await bridge.execute({ operationId, args, fields });
        return JSON.stringify({
          kind: "clawql-ouroboros-default-execute",
          route: "execute",
          goal: seed.goal,
          operationId,
          args,
          fields,
          result: firstText(response),
        });
      }

      const searchQuery = hints.searchQuery;
      if (typeof searchQuery === "string" && searchQuery && bridge?.search) {
        const searchLimitRaw = hints.searchLimit;
        const searchLimit =
          typeof searchLimitRaw === "number" && Number.isFinite(searchLimitRaw)
            ? Math.min(Math.max(Math.floor(searchLimitRaw), 1), 50)
            : 5;
        const response = await bridge.search(searchQuery, searchLimit);
        return JSON.stringify({
          kind: "clawql-ouroboros-default-execute",
          route: "search",
          goal: seed.goal,
          searchQuery,
          searchLimit,
          result: firstText(response),
        });
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
      const ac_results = seed.acceptance_criteria.map((c, i) => ({
        ac_index: i,
        ac_content: c,
        passed: !failed && executionOutput.length > 0,
        evidence: failed
          ? "default evaluator: error-like output"
          : "default evaluator: non-empty output",
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
