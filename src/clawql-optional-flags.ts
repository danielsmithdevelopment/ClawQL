/**
 * Single place to interpret optional feature flags (env → typed booleans).
 * See docs/mcp-tools.md and GitHub #79.
 */

import { z } from "zod";

/** `1`, `true`, `yes` (case-insensitive) → true; unset or other → false. */
function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

const rawOptionalFlagsSchema = z.object({
  ENABLE_GRPC: z.string().optional(),
  ENABLE_GRPC_REFLECTION: z.string().optional(),
  CLAWQL_EXTERNAL_INGEST: z.string().optional(),
  CLAWQL_ENABLE_CACHE: z.string().optional(),
  CLAWQL_ENABLE_SCHEDULE: z.string().optional(),
  CLAWQL_ENABLE_NOTIFY: z.string().optional(),
  CLAWQL_ENABLE_VISION: z.string().optional(),
  CLAWQL_ENABLE_AUDIT: z.string().optional(),
});

export type ClawqlOptionalToolFlags = {
  /** `ENABLE_GRPC` — gRPC MCP on `GRPC_PORT` (default 50051). */
  enableGrpc: boolean;
  /** `ENABLE_GRPC_REFLECTION` — server reflection for grpcurl. */
  enableGrpcReflection: boolean;
  /** `CLAWQL_EXTERNAL_INGEST=1` — `ingest_external_knowledge` (Markdown import + optional URL fetch). */
  externalIngestPreview: boolean;
  /**
   * (#75): Ephemeral in-process **`cache`** tool (not persisted). Default false — not registered unless enabled.
   */
  enableCache: boolean;
  /**
   * Planned (#76): `schedule` tool. Default false until implemented.
   */
  enableSchedule: boolean;
  /**
   * Planned (#77): `notify` / `alert` tool. Default false until implemented.
   */
  enableNotify: boolean;
  /**
   * Planned (#78): `vision` / `multimodal` tool. Default false until implemented.
   */
  enableVision: boolean;
  /**
   * (#89): `audit` tool — in-process ring buffer (not durable). Default false.
   */
  enableAudit: boolean;
};

function rawToFlags(raw: z.infer<typeof rawOptionalFlagsSchema>): ClawqlOptionalToolFlags {
  return {
    enableGrpc: envTruthy(raw.ENABLE_GRPC),
    enableGrpcReflection: envTruthy(raw.ENABLE_GRPC_REFLECTION),
    externalIngestPreview: raw.CLAWQL_EXTERNAL_INGEST?.trim() === "1",
    enableCache: envTruthy(raw.CLAWQL_ENABLE_CACHE),
    enableSchedule: envTruthy(raw.CLAWQL_ENABLE_SCHEDULE),
    enableNotify: envTruthy(raw.CLAWQL_ENABLE_NOTIFY),
    enableVision: envTruthy(raw.CLAWQL_ENABLE_VISION),
    enableAudit: envTruthy(raw.CLAWQL_ENABLE_AUDIT),
  };
}

/**
 * Parsed optional tool flags from the given env (default `process.env`).
 */
export function getClawqlOptionalToolFlags(
  env: NodeJS.ProcessEnv = process.env
): ClawqlOptionalToolFlags {
  const raw = rawOptionalFlagsSchema.parse(env);
  return rawToFlags(raw);
}
