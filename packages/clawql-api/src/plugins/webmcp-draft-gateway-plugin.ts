import {
  installBoundOperationInvoker,
  WebMcpDraftPlugin,
  type BoundOperation,
  type ProviderPlugin,
} from "clawql-core";
import { Effect } from "effect";

import { ExecuteService } from "../execute-service.js";

export const WEBMCP_DRAFT_PLUGIN_ID = "clawql-webmcp-draft";

/** Opt-in: set `CLAWQL_ENABLE_WEBMCP_DRAFT=1`. */
export function webMcpDraftPluginEnabled(): boolean {
  return process.env.CLAWQL_ENABLE_WEBMCP_DRAFT?.trim() === "1";
}

/**
 * When enabling the draft plugin, default draft store to durable under `.clawql/`
 * unless the operator explicitly set `CLAWQL_WEBMCP_DRAFT_DURABLE=0`.
 */
export function ensureWebMcpDraftDurableDefaults(): Effect.Effect<void> {
  return Effect.sync(() => {
    if (process.env.CLAWQL_WEBMCP_DRAFT_DURABLE?.trim() === "0") return;
    if (!process.env.CLAWQL_WEBMCP_DRAFT_STORE_PATH?.trim()) {
      process.env.CLAWQL_WEBMCP_DRAFT_DURABLE = "1";
    }
  });
}

/**
 * Install ExecuteService-backed bound invoker using the API `run` handle.
 * Call once after {@link createClawQLApi} builds its ManagedRuntime.
 */
export function wireWebMcpDraftBoundInvoker(
  run: (program: Effect.Effect<unknown, Error, ExecuteService>) => Promise<unknown>
): Effect.Effect<void> {
  return Effect.sync(() => {
    installBoundOperationInvoker({
      invoke: (binding: BoundOperation, args: Readonly<Record<string, unknown>>) =>
        Effect.tryPromise({
          try: () =>
            run(
              Effect.gen(function* () {
                const exec = yield* ExecuteService;
                return yield* exec.execute({
                  operationId: binding.sourceRef,
                  args: { ...args },
                });
              })
            ),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        }),
    });
  });
}

export function createWebMcpDraftGatewayPlugin(): ProviderPlugin {
  Effect.runSync(ensureWebMcpDraftDurableDefaults());
  process.stderr.write(
    `[clawql-api] WebMcpDraftPlugin active id=${WEBMCP_DRAFT_PLUGIN_ID} (draft/review/publish + bound execute)\n`
  );
  return WebMcpDraftPlugin;
}
