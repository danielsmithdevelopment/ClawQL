import { createHash } from "node:crypto";
import { Effect, Layer } from "effect";
import { loadClawqlAuditEffect, processWormEnvLikelyEnabled } from "../audit/clawql-audit-lazy.js";
import { ExecuteService } from "../execute-service.js";
import { loadSpec } from "../spec/spec-loader.js";
import type { LoadSpecFn } from "../search/search-core.js";
import { executeClawqlOperationEffect } from "./execute-core.js";

function wormAppendRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CLAWQL_TIER?.trim().toLowerCase() === "regulated") return true;
  const raw = env.CLAWQL_WORM_REQUIRED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function errorBodyAuditDetail(rawDetail: string): string {
  const hash = createHash("sha256").update(rawDetail).digest("hex").slice(0, 16);
  return `error_body_sha256_16=${hash};len=${rawDetail.length}`;
}

function executeResultLooksOk(content: { type: "text"; text: string }[]): boolean {
  const text = content[0]?.text ?? "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      if ("error" in o) return false;
      if (o.ok === false) return false;
      if (
        o.status === "mandate_required" ||
        o.status === "blocked" ||
        o.status === "pending_approval"
      ) {
        return false;
      }
    }
  } catch {
    /* non-JSON success payloads are treated as ok */
  }
  return true;
}

/** Build an ExecuteService layer; optional `loadSpecFn` for tests and MCP overrides. */
export function makeExecuteLive(loadSpecFn: LoadSpecFn = loadSpec): Layer.Layer<ExecuteService> {
  return Layer.succeed(
    ExecuteService,
    ExecuteService.of({
      execute: (input) =>
        Effect.gen(function* () {
          const args = input.args ?? {};
          if (processWormEnvLikelyEnabled()) {
            const wormWrite = Effect.gen(function* () {
              const audit = yield* loadClawqlAuditEffect();
              const attempt = yield* audit.wormInputFromToolAttempt({
                operationId: input.operationId,
                argKeys: Object.keys(args),
              });
              yield* audit.appendProcessWormEffect(attempt);
            });
            // Regulated / CLAWQL_WORM_REQUIRED: refuse the action if the attempt cannot be recorded.
            if (wormAppendRequired()) {
              yield* wormWrite;
            } else {
              yield* wormWrite.pipe(Effect.catch(() => Effect.void));
            }
          }

          const content = yield* executeClawqlOperationEffect(
            {
              operationId: input.operationId,
              args,
              fields: input.fields,
              where: input.where,
              approvedExecutionId: input.approvedExecutionId,
            },
            loadSpecFn
          );

          const ok = executeResultLooksOk(content);
          if (processWormEnvLikelyEnabled()) {
            const wormWrite = Effect.gen(function* () {
              const audit = yield* loadClawqlAuditEffect();
              // Prefer body hash over raw failure text (audit 3.09).
              const rawDetail = ok ? undefined : content[0]?.text;
              const detail = rawDetail ? errorBodyAuditDetail(rawDetail) : undefined;
              const result = yield* audit.wormInputFromToolResult({
                operationId: input.operationId,
                ok,
                detail,
              });
              yield* audit.appendProcessWormEffect(result);
            });
            if (wormAppendRequired()) {
              yield* wormWrite;
            } else {
              yield* wormWrite.pipe(Effect.catch(() => Effect.void));
            }
          }

          return { content };
        }),
    })
  );
}

export type { LoadSpecFn };
