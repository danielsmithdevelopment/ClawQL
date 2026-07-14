/**
 * Native Effect.gen staging for pageindex_* MCP tools (memory plugin).
 * Parse + build/traverse stay sync where possible; storage IO via {@link memoryFromPromise}.
 */

import { Effect } from "effect";
import {
  pageindexBuildTree,
  pageindexGetContent,
  pageindexSynthesize,
  pageindexTraverse,
} from "clawql-pageindex/mcp";
import { MemoryError } from "./memory-errors.js";
import { memoryFromPromise } from "./memory-effect-utils.js";

export type PageindexMcpResult = { content: { type: "text"; text: string }[] };

function mcpJson(value: unknown): PageindexMcpResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function mcpError(error: string): PageindexMcpResult {
  return mcpJson({ ok: false, error });
}

/** Soft-wrap pageindex ops so missing docs/nodes become MCP JSON, not throws. */
function softPageindex<A>(tryFn: () => Promise<A>): Effect.Effect<PageindexMcpResult, MemoryError> {
  return Effect.gen(function* () {
    const either = yield* Effect.either(memoryFromPromise(tryFn));
    if (either._tag === "Left") {
      const cause = either.left.cause;
      const msg = cause instanceof Error ? cause.message : String(cause ?? either.left.reason);
      return mcpError(msg);
    }
    return mcpJson(either.right);
  });
}

export function executePageindexBuildTreeEffect(
  args: unknown
): Effect.Effect<PageindexMcpResult, MemoryError> {
  return softPageindex(() => pageindexBuildTree(args));
}

export function executePageindexTraverseEffect(
  args: unknown
): Effect.Effect<PageindexMcpResult, MemoryError> {
  return softPageindex(() => pageindexTraverse(args));
}

export function executePageindexSynthesizeEffect(
  args: unknown
): Effect.Effect<PageindexMcpResult, MemoryError> {
  return softPageindex(() => pageindexSynthesize(args));
}

export function executePageindexGetContentEffect(
  args: unknown
): Effect.Effect<PageindexMcpResult, MemoryError> {
  return softPageindex(() => pageindexGetContent(args));
}
