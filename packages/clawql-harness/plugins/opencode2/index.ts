import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Effect } from "effect";
import type { HarnessContext, HarnessPlugin } from "../../src/types.js";
import { HarnessPluginError } from "../../src/types.js";

type OpencodeSession = {
  id?: string;
};

type PromptResult = {
  info?: { error?: unknown; finish?: string; modelID?: string; providerID?: string };
  parts?: Array<{ type?: string; text?: string }>;
};

/** v2 client uses flat params (`sessionID`, `parts`, …). v1 uses nested `path`/`body`. */
type OpencodeClient = {
  session: {
    create: (opts?: Record<string, unknown>) => Promise<{ data?: OpencodeSession; error?: unknown }>;
    prompt: (opts: Record<string, unknown>) => Promise<{ data?: PromptResult; error?: unknown }>;
  };
};

type OpencodeHandle = {
  client: OpencodeClient;
  server: { url: string; close: () => void };
};

type OpenCodeModule = {
  createOpencode?: (opts?: {
    hostname?: string;
    port?: number;
    timeout?: number;
    config?: Record<string, unknown>;
  }) => Promise<OpencodeHandle>;
};

type LoadedSdk = { mod: OpenCodeModule; api: "v1" | "v2" };

type OpenCode2State = {
  loaded: LoadedSdk | null;
  loadError: string | null;
  embedded: OpencodeHandle | null;
  startError: string | null;
};

const asPluginError = (err: unknown, reason: string): HarnessPluginError =>
  new HarnessPluginError({
    pluginId: "opencode2",
    reason,
    cause: err,
  });

const loadOpenCodeSdk = (): Effect.Effect<LoadedSdk | null, never> =>
  Effect.tryPromise({
    try: async (): Promise<LoadedSdk> => {
      try {
        const v2 = "@opencode-ai/sdk/v2";
        return { mod: (await import(v2)) as OpenCodeModule, api: "v2" };
      } catch {
        const root = "@opencode-ai/sdk";
        return { mod: (await import(root)) as OpenCodeModule, api: "v1" };
      }
    },
    catch: (err) => err,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

/**
 * `createOpencode` spawns bare `opencode` via cross-spawn — needs CLI on PATH.
 * Prefer the optional `opencode-ai` package bin when present.
 */
function ensureOpencodeOnPath(): void {
  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("opencode-ai/package.json");
    const binDir = join(dirname(pkgJson), "bin");
    const pathNow = process.env.PATH ?? "";
    if (!pathNow.split(":").includes(binDir)) {
      process.env.PATH = `${binDir}:${pathNow}`;
    }
  } catch {
    /* peer not installed — rely on system PATH */
  }
}

function modelFromEnv(): { providerID: string; modelID: string } {
  const providerID = process.env.CLAWQL_OPENCODE_PROVIDER_ID?.trim() || "opencode";
  const modelID = process.env.CLAWQL_OPENCODE_MODEL_ID?.trim() || "big-pickle";
  return { providerID, modelID };
}

function extractAssistantText(data: PromptResult | undefined): string | null {
  const texts = (data?.parts ?? [])
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text!.trim())
    .filter(Boolean);
  return texts.length ? texts.join("\n") : null;
}

const ensureEmbedded = (state: OpenCode2State): Effect.Effect<OpencodeHandle | null, never> =>
  Effect.gen(function* () {
    if (state.embedded) return state.embedded;
    if (state.startError || !state.loaded?.mod.createOpencode) return null;

    ensureOpencodeOnPath();
    const model = modelFromEnv();
    const started = yield* Effect.tryPromise({
      try: () =>
        state.loaded!.mod.createOpencode!({
          hostname: process.env.CLAWQL_OPENCODE_HOSTNAME?.trim() || "127.0.0.1",
          port: Number(process.env.CLAWQL_OPENCODE_PORT?.trim() || "0") || undefined,
          timeout: Number(process.env.CLAWQL_OPENCODE_TIMEOUT_MS?.trim() || "20000") || 20000,
          config: {
            model: `${model.providerID}/${model.modelID}`,
          },
        }),
      catch: (err) => err,
    }).pipe(
      Effect.map((handle) => ({ handle, error: null as string | null })),
      Effect.catchAll((err) =>
        Effect.succeed({
          handle: null as OpencodeHandle | null,
          error: `OpenCode2 createOpencode failed: ${err instanceof Error ? err.message : String(err)}`,
        })
      )
    );
    state.embedded = started.handle;
    state.startError = started.error;
    return state.embedded;
  });

/**
 * OpenCode2 embed harness plugin.
 *
 * Lazily starts an embedded OpenCode server on first `opencode2_session` call when
 * `@opencode-ai/sdk` + `opencode` CLI (`opencode-ai`) are available. Without peers,
 * returns a structured error pointing at the CLI harness.
 */
export const OpenCode2Plugin: HarnessPlugin = {
  id: "opencode2",
  version: "0.3.0",

  setup: (ctx: HarnessContext) =>
    Effect.gen(function* () {
      if (process.env.CLAWQL_OPENCODE_DISABLE_EMBED?.trim() === "1") {
        const state: OpenCode2State = {
          loaded: null,
          loadError: "embed disabled via CLAWQL_OPENCODE_DISABLE_EMBED=1",
          embedded: null,
          startError: null,
        };
        (ctx as HarnessContext & { __opencode2State?: OpenCode2State }).__opencode2State = state;
        ctx.tools.register({
          name: "opencode2_session",
          description: "Delegate a coding task to an embedded OpenCode2 session",
          handler: (args) =>
            Effect.succeed({
              ok: false,
              error:
                "OpenCode2 embed disabled (CLAWQL_OPENCODE_DISABLE_EMBED=1) — unset to use @opencode-ai/sdk",
              task: args.task,
            }),
        });
        return;
      }

      const loaded = yield* loadOpenCodeSdk();
      const state: OpenCode2State = {
        loaded,
        loadError: loaded?.mod.createOpencode
          ? null
          : "OpenCode2 SDK not available — install optional peers @opencode-ai/sdk and opencode-ai (CLI), or use clawql opencode CLI harness",
        embedded: null,
        startError: null,
      };
      (ctx as HarnessContext & { __opencode2State?: OpenCode2State }).__opencode2State = state;

      ctx.tools.register({
        name: "opencode2_session",
        description: "Delegate a coding task to an embedded OpenCode2 session",
        handler: (args) =>
          Effect.gen(function* () {
            const embedded = yield* ensureEmbedded(state);
            if (!embedded?.client?.session) {
              return {
                ok: false,
                error:
                  state.startError ??
                  state.loadError ??
                  "OpenCode2 SDK not available — install optional peers @opencode-ai/sdk and opencode-ai (CLI), or use clawql opencode CLI harness",
                task: args.task,
              };
            }

            const task = typeof args.task === "string" ? args.task : "harness smoke task";
            const workingDirectory =
              typeof args.workingDirectory === "string" ? args.workingDirectory : process.cwd();
            const title =
              typeof args.title === "string" ? args.title : `clawql-harness:${task.slice(0, 48)}`;
            const agent =
              typeof args.agent === "string"
                ? args.agent
                : process.env.CLAWQL_OPENCODE_AGENT?.trim() || undefined;
            const model = modelFromEnv();
            const apiVersion = state.loaded?.api ?? "v2";
            const useV2 = apiVersion === "v2";

            yield* ctx.worm.append({
              type: "AGENT_ACTION",
              agentName: "harness-opencode2",
              metadata: {
                harnessEvent: "OPENCODE2_SESSION_STARTED",
                workingDirectory,
                taskPreview: task.slice(0, 200),
                serverUrl: embedded.server.url,
                model,
                apiVersion,
              },
            });

            const created = yield* Effect.tryPromise({
              try: () =>
                useV2
                  ? embedded.client.session.create({
                      title,
                      directory: workingDirectory,
                    })
                  : embedded.client.session.create({
                      body: { title },
                      query: { directory: workingDirectory },
                    }),
              catch: (err) => asPluginError(err, "OpenCode2 session.create threw"),
            });

            if (created.error || !created.data?.id) {
              yield* ctx.worm.append({
                type: "AGENT_ACTION",
                agentName: "harness-opencode2",
                metadata: {
                  harnessEvent: "OPENCODE2_SESSION_FAILED",
                  phase: "create",
                  error: String(created.error ?? "missing session id"),
                },
              });
              return {
                ok: false,
                error: "OpenCode2 session.create failed",
                detail: created.error ?? null,
                workingDirectory,
                task,
              };
            }

            const sessionId = created.data.id;
            const prompted = yield* Effect.tryPromise({
              try: () =>
                useV2
                  ? embedded.client.session.prompt({
                      sessionID: sessionId,
                      directory: workingDirectory,
                      parts: [{ type: "text", text: task }],
                      ...(agent ? { agent } : {}),
                      model,
                    })
                  : embedded.client.session.prompt({
                      path: { id: sessionId },
                      query: { directory: workingDirectory },
                      body: {
                        parts: [{ type: "text", text: task }],
                        ...(agent ? { agent } : {}),
                        model,
                      },
                    }),
              catch: (err) => asPluginError(err, "OpenCode2 session.prompt threw"),
            });

            if (prompted.error) {
              yield* ctx.worm.append({
                type: "AGENT_ACTION",
                agentName: "harness-opencode2",
                metadata: {
                  harnessEvent: "OPENCODE2_SESSION_FAILED",
                  phase: "prompt",
                  sessionId,
                  error: String(prompted.error),
                },
              });
              return {
                ok: false,
                error: "OpenCode2 session.prompt failed",
                sessionId,
                detail: prompted.error,
                workingDirectory,
                task,
              };
            }

            const assistantError = prompted.data?.info?.error;
            if (assistantError) {
              yield* ctx.worm.append({
                type: "AGENT_ACTION",
                agentName: "harness-opencode2",
                metadata: {
                  harnessEvent: "OPENCODE2_SESSION_FAILED",
                  phase: "assistant",
                  sessionId,
                  error: String(assistantError),
                },
              });
              return {
                ok: false,
                error: "OpenCode2 assistant returned an error",
                sessionId,
                detail: assistantError,
                workingDirectory,
                task,
                result: prompted.data ?? null,
              };
            }

            const text = extractAssistantText(prompted.data);

            yield* ctx.worm.append({
              type: "AGENT_ACTION",
              agentName: "harness-opencode2",
              metadata: {
                harnessEvent: "OPENCODE2_SESSION_COMPLETED",
                sessionId,
                workingDirectory,
                model,
                textPreview: text?.slice(0, 200) ?? null,
              },
            });

            return {
              ok: true,
              sessionId,
              workingDirectory,
              task,
              model,
              serverUrl: embedded.server.url,
              text,
              result: prompted.data ?? null,
            };
          }),
      });
    }),

  teardown: (ctx: HarnessContext) =>
    Effect.sync(() => {
      const state = (ctx as HarnessContext & { __opencode2State?: OpenCode2State }).__opencode2State;
      try {
        state?.embedded?.server.close();
      } catch {
        /* ignore */
      }
    }),
};

/** Factory matching Ouroboros-style create* export. */
export function createOpenCode2HarnessPlugin(): HarnessPlugin {
  return OpenCode2Plugin;
}
