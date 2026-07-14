/**
 * Optional Onyx search inject for hybrid memory_recall (avoids clawql-documents cycle).
 */

import {
  enterpriseCitationsFromOnyxSearchToolText,
  type EnterpriseCitation,
} from "../ingest/enterprise-citations.js";
import { envFlagTruthy } from "./recall-sources.js";
import type { NormalizedRecallHit, RecallFollowUpHint } from "./recall-sources.js";

export type MemoryOnyxSearchFn = (input: {
  query: string;
  num_hits?: number;
}) => Promise<{ content: { type: "text"; text: string }[] }>;

let onyxSearchFn: MemoryOnyxSearchFn | undefined;

/** Wire from clawql-mcp / documents layer so memory can call Onyx without importing clawql-documents. */
export function configureMemoryOnyxSearch(fn: MemoryOnyxSearchFn | undefined): void {
  onyxSearchFn = fn;
}

export function getMemoryOnyxSearch(): MemoryOnyxSearchFn | undefined {
  return onyxSearchFn;
}

export function onyxHybridAvailable(): boolean {
  return Boolean(onyxSearchFn) && envFlagTruthy("CLAWQL_ENABLE_ONYX");
}

export type OnyxRecallSupplement = {
  hits: NormalizedRecallHit[];
  followUps: RecallFollowUpHint[];
  skipped?: string;
};

/** Query Onyx via injected execute when configured; otherwise return followUp only. */
export async function recallOnyxSupplement(input: {
  query: string;
  limit?: number;
}): Promise<OnyxRecallSupplement> {
  const limit = input.limit ?? envInt("CLAWQL_MEMORY_RECALL_ONYX_LIMIT", 8);
  const followUps: RecallFollowUpHint[] = [
    {
      tool: "knowledge_search_onyx",
      reason: "Deepen enterprise document recall or adjust Onyx filters.",
      args: { query: input.query, num_hits: limit },
    },
  ];

  if (!envFlagTruthy("CLAWQL_ENABLE_ONYX")) {
    return {
      hits: [],
      followUps,
      skipped: "CLAWQL_ENABLE_ONYX is not enabled",
    };
  }

  const search = getMemoryOnyxSearch();
  if (!search) {
    return {
      hits: [],
      followUps,
      skipped: "Onyx search not wired into memory (configureMemoryOnyxSearch)",
    };
  }

  try {
    const raw = await search({ query: input.query, num_hits: limit });
    const text = raw.content?.[0]?.text ?? "";
    if (!text.trim()) {
      return { hits: [], followUps };
    }
    const parsedCitations = enterpriseCitationsFromOnyxSearchToolText(text);
    if (!parsedCitations.ok) {
      return {
        hits: [],
        followUps,
        skipped: parsedCitations.error,
      };
    }
    const citations: EnterpriseCitation[] = parsedCitations.citations;
    const hits: NormalizedRecallHit[] = citations.slice(0, limit).map((c, i) => ({
      source: "onyx" as const,
      id: c.document_id ?? c.url ?? `onyx:${i}`,
      score: Math.max(1, limit - i),
      snippet: c.snippet ?? c.title ?? "",
      title: c.title,
      path: c.url,
      meta: {
        document_id: c.document_id,
        source: c.source,
        url: c.url,
      },
    }));
    return { hits, followUps };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      hits: [],
      followUps,
      skipped: `Onyx recall failed: ${msg}`,
    };
  }
}

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
