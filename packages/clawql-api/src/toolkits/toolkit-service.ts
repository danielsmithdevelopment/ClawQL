/**
 * Effect Tag + Layer for toolkit registry (list / get / resolve).
 */

import { readFileSync } from "node:fs";
import { Context, Effect, Layer } from "effect";
import { parse as parseYaml } from "yaml";
import type { ClawqlProvidersComposition } from "../config/providers-composition.js";
import { listSeededToolkitIds, lookupSeededToolkit, SEEDED_TOOLKITS } from "./seeded-toolkits.js";
import type { ClawqlToolkit, ToolkitProvidersComposition } from "./types.js";

export class ToolkitNotFoundError extends Error {
  readonly _tag = "ToolkitNotFoundError";
  constructor(readonly toolkitId: string) {
    super(`Unknown toolkit "${toolkitId}". Known: ${listSeededToolkitIds().join(", ")}`);
    this.name = "ToolkitNotFoundError";
  }
}

function toolkitIdFromInstanceDocument(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const root = raw as Record<string, unknown>;
  const specBody =
    root.spec && typeof root.spec === "object" && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : root;
  const tk = specBody.toolkit;
  if (typeof tk !== "string" || !tk.trim()) return undefined;
  return tk.trim().toLowerCase();
}

/** Read `toolkit` from `CLAWQL_INSTANCE_SPEC` / `CLAWQL_INSTANCE_SPEC_FILE`. */
export const readToolkitIdFromInstanceEnvEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string | undefined> =>
  Effect.sync(() => {
    const inline = env.CLAWQL_INSTANCE_SPEC?.trim();
    if (inline) {
      return toolkitIdFromInstanceDocument(JSON.parse(inline) as unknown);
    }
    const filePath = env.CLAWQL_INSTANCE_SPEC_FILE?.trim();
    if (!filePath) return undefined;
    const text = readFileSync(filePath, "utf8").trim();
    const parsed = text.startsWith("{")
      ? (JSON.parse(text) as unknown)
      : (parseYaml(text) as unknown);
    return toolkitIdFromInstanceDocument(parsed);
  });

export const listToolkitsEffect = (): Effect.Effect<readonly ClawqlToolkit[]> =>
  Effect.sync(() => SEEDED_TOOLKITS);

export const getToolkitEffect = (
  toolkitId: string
): Effect.Effect<ClawqlToolkit, ToolkitNotFoundError> =>
  Effect.gen(function* () {
    const found = lookupSeededToolkit(toolkitId);
    if (!found) {
      return yield* Effect.fail(new ToolkitNotFoundError(toolkitId));
    }
    return found;
  });

/** Expand toolkit id to providers composition `{ pack?, enabled? }`. */
export const resolveToolkitToProvidersComposition = (
  toolkitId: string
): Effect.Effect<ToolkitProvidersComposition, ToolkitNotFoundError> =>
  Effect.gen(function* () {
    const tk = yield* getToolkitEffect(toolkitId);
    const out: ClawqlProvidersComposition = {};
    if (tk.providers.pack) out.pack = tk.providers.pack;
    if (tk.providers.enabled?.length) out.enabled = [...tk.providers.enabled];
    return out;
  });

export class ToolkitService extends Context.Service<ToolkitService, {
    readonly list: () => Effect.Effect<readonly ClawqlToolkit[]>;
    readonly get: (toolkitId: string) => Effect.Effect<ClawqlToolkit, ToolkitNotFoundError>;
    readonly resolve: (toolkitId: string) => Effect.Effect<ClawqlToolkit, ToolkitNotFoundError>;
    readonly resolveToolkitToProvidersComposition: (
      toolkitId: string
    ) => Effect.Effect<ToolkitProvidersComposition, ToolkitNotFoundError>;
    readonly readToolkitIdFromInstanceEnv: (
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<string | undefined>;
  }>()("clawql/ToolkitService") {}

export const ToolkitLive = Layer.succeed(
  ToolkitService,
  ToolkitService.of({
    list: () => listToolkitsEffect(),
    get: (id) => getToolkitEffect(id),
    resolve: (id) => getToolkitEffect(id),
    resolveToolkitToProvidersComposition: (id) => resolveToolkitToProvidersComposition(id),
    readToolkitIdFromInstanceEnv: (env) => readToolkitIdFromInstanceEnvEffect(env),
  })
);
