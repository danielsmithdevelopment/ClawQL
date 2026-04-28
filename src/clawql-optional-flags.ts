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

/** When `v` is unset, return `defaultWhenUnset`; otherwise same as `envTruthy`. */
function envTruthyWithDefault(v: string | undefined, defaultWhenUnset: boolean): boolean {
  if (v === undefined) return defaultWhenUnset;
  return envTruthy(v);
}

const rawOptionalFlagsSchema = z.object({
  ENABLE_GRPC: z.string().optional(),
  ENABLE_GRPC_REFLECTION: z.string().optional(),
  CLAWQL_EXTERNAL_INGEST: z.string().optional(),
  /** Default on: `memory_ingest` / `memory_recall`. Set `0` / `false` / `no` to unregister. */
  CLAWQL_ENABLE_MEMORY: z.string().optional(),
  /**
   * Default on: document pipeline — bundled tika / gotenberg / paperless / stirling / onyx in **`all-providers`**, plus
   * **`ingest_external_knowledge`** and (with **`CLAWQL_ENABLE_ONYX`**) **`knowledge_search_onyx`**. Set `0` to opt out.
   */
  CLAWQL_ENABLE_DOCUMENTS: z.string().optional(),
  CLAWQL_ENABLE_SCHEDULE: z.string().optional(),
  CLAWQL_ENABLE_NOTIFY: z.string().optional(),
  CLAWQL_ENABLE_VISION: z.string().optional(),
  CLAWQL_ENABLE_ONYX: z.string().optional(),
  CLAWQL_ENABLE_OUROBOROS: z.string().optional(),
  CLAWQL_ENABLE_SANDBOX: z.string().optional(),
});

export type ClawqlOptionalToolFlags = {
  /** `ENABLE_GRPC` — gRPC MCP on `GRPC_PORT` (default 50051). */
  enableGrpc: boolean;
  /** `ENABLE_GRPC_REFLECTION` — server reflection for grpcurl. */
  enableGrpcReflection: boolean;
  /** `CLAWQL_EXTERNAL_INGEST=1` — `ingest_external_knowledge` (Markdown import + optional URL fetch). */
  externalIngestPreview: boolean;
  /**
   * Durable **vault** tools **`memory_ingest`** / **`memory_recall`**. Default **true** (set **`CLAWQL_ENABLE_MEMORY=0`**
   * to hide tools). Still requires a writable `CLAWQL_OBSIDIAN_VAULT_PATH` to persist or recall.
   */
  enableMemory: boolean;
  /**
   * Document stack: default merge includes tika, gotenberg, paperless, stirling, onyx; registers **`ingest_external_knowledge`**;
   * pairs with **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=1`**. Set **`CLAWQL_ENABLE_DOCUMENTS=0`** to opt out.
   */
  enableDocuments: boolean;
  /**
   * (#76): `schedule` tool — persisted jobs + manual synthetic trigger. Default false.
   */
  enableSchedule: boolean;
  /**
   * (#77): MCP `notify` tool (Slack `chat.postMessage`). Default false — register with `CLAWQL_ENABLE_NOTIFY=1`.
   */
  enableNotify: boolean;
  /**
   * Planned (#78): `vision` / `multimodal` tool. Default false until implemented.
   */
  enableVision: boolean;
  /**
   * ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)): `knowledge_search_onyx` — wrapper over bundled Onyx search. Default false.
   */
  enableOnyxKnowledge: boolean;
  /**
   * ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)): Ouroboros MCP tools (`ouroboros_*`). Default false.
   */
  enableOuroboros: boolean;
  /**
   * ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)): MCP **`sandbox_exec`** (bridge / Seatbelt / Docker). Default false — register with **`CLAWQL_ENABLE_SANDBOX=1`**.
   */
  enableSandbox: boolean;
};

function rawToFlags(raw: z.infer<typeof rawOptionalFlagsSchema>): ClawqlOptionalToolFlags {
  return {
    enableGrpc: envTruthy(raw.ENABLE_GRPC),
    enableGrpcReflection: envTruthy(raw.ENABLE_GRPC_REFLECTION),
    externalIngestPreview: raw.CLAWQL_EXTERNAL_INGEST?.trim() === "1",
    enableMemory: envTruthyWithDefault(raw.CLAWQL_ENABLE_MEMORY, true),
    enableDocuments: envTruthyWithDefault(raw.CLAWQL_ENABLE_DOCUMENTS, true),
    enableSchedule: envTruthy(raw.CLAWQL_ENABLE_SCHEDULE),
    enableNotify: envTruthy(raw.CLAWQL_ENABLE_NOTIFY),
    enableVision: envTruthy(raw.CLAWQL_ENABLE_VISION),
    enableOnyxKnowledge: envTruthy(raw.CLAWQL_ENABLE_ONYX),
    enableOuroboros: envTruthy(raw.CLAWQL_ENABLE_OUROBOROS),
    enableSandbox: envTruthy(raw.CLAWQL_ENABLE_SANDBOX),
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
