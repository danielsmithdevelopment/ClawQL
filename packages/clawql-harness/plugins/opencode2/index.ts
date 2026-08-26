import { Effect } from "effect";
import type { HarnessContext, HarnessPlugin } from "../../src/types.js";
import { HarnessPluginError } from "../../src/types.js";

type OpencodeSession = {
  id?: string;
};

type OpencodeClient = {
  session: {
    create: (opts?: {
      body?: { title?: string };
      query?: { directory?: string };
    }) => Promise<{ data?: OpencodeSession; error?: unknown }>;
    prompt: (opts: {
      path: { id: string };
      body: {
        parts: Array<{ type: "text"; text: string }>;
        agent?: string;
        model?: { providerID: string; modelID: string };
      };
      query?: { directory?: string };
    }) => Promise<{ data?: unknown; error?: unknown }>;
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
    config?: Record<string, unknown>;
  }) => Promise<OpencodeHandle>;
};

const asPluginError = (err: unknown, reason: string): HarnessPluginError =>
  new HarnessPluginError({
    pluginId: "opencode2",
    reason,
    cause: err,
  });

const loadOpenCodeSdk = (): Effect.Effect<OpenCodeModule | null, never> =>
  Effect.tryPromise({
    try: async () => {
      try {
        const v2 = "@opencode-ai/sdk/v2";
        return (await import(v2)) as OpenCodeModule;
      } catch {
        const root = "@opencode-ai/sdk";
        return (await import(root)) as OpenCodeModule;
      }
    },
    catch: (err) => err,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

function modelFromEnv(): { providerID: string; modelID: string } | undefined {
  const providerID = process.env.CLAWQL_OPENCODE_PROVIDER_ID?.trim();
  const modelID = process.env.CLAWQL_OPENCODE_MODEL_ID?.trim();
  if (providerID && modelID) return { providerID, modelID };
  return undefined;
}

/**
 * OpenCode2 embed harness plugin.
 *
 * When `@opencode-ai/sdk` is installed, starts an embedded OpenCode server and
 * runs `session.create` + `session.prompt` for `opencode2_session`.
 * Without the peer, returns a structured error pointing at the CLI harness.
 */
export const OpenCode2Plugin: HarnessPlugin = {
  id: "opencode2",
  version: "0.2.0",

  setup: (ctx: HarnessContext) =>
    Effect.gen(function* () {
      const sdk = yield* loadOpenCodeSdk();
      let embedded: OpencodeHandle | null = null;

      if (sdk?.createOpencode) {
        embedded = yield* Effect.tryPromise({
          try: () =>
            sdk.createOpencode!({
              hostname: process.env.CLAWQL_OPENCODE_HOSTNAME?.trim() || "127.0.0.1",
              port: Number(process.env.CLAWQL_OPENCODE_PORT?.trim() || "0") || undefined,
            }),
          catch: (err) => asPluginError(err, "OpenCode2 createOpencode failed"),
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));
      }

      ctx.tools.register({
        name: "opencode2_session",
        description: "Delegate a coding task to an embedded OpenCode2 session",
        handler: (args) =>
          Effect.gen(function* () {
            if (!embedded?.client?.session) {
              return {
                ok: false,
                error:
                  "OpenCode2 SDK not available — install optional peer @opencode-ai/sdk or use clawql opencode CLI harness",
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

            yield* ctx.worm.append({
              type: "AGENT_ACTION",
              agentName: "harness-opencode2",
              metadata: {
                harnessEvent: "OPENCODE2_SESSION_STARTED",
                workingDirectory,
                taskPreview: task.slice(0, 200),
                serverUrl: embedded.server.url,
              },
            });

            const created = yield* Effect.tryPromise({
              try: () =>
                embedded!.client.session.create({
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
                embedded!.client.session.prompt({
                  path: { id: sessionId },
                  query: { directory: workingDirectory },
                  body: {
                    parts: [{ type: "text", text: task }],
                    ...(agent ? { agent } : {}),
                    ...(model ? { model } : {}),
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

            yield* ctx.worm.append({
              type: "AGENT_ACTION",
              agentName: "harness-opencode2",
              metadata: {
                harnessEvent: "OPENCODE2_SESSION_COMPLETED",
                sessionId,
                workingDirectory,
              },
            });

            return {
              ok: true,
              sessionId,
              workingDirectory,
              task,
              serverUrl: embedded.server.url,
              result: prompted.data ?? null,
            };
          }),
      });

      (ctx as HarnessContext & { __opencode2?: OpencodeHandle | null }).__opencode2 = embedded;
    }),

  teardown: (ctx: HarnessContext) =>
    Effect.sync(() => {
      const handle = (ctx as HarnessContext & { __opencode2?: OpencodeHandle | null }).__opencode2;
      try {
        handle?.server.close();
      } catch {
        /* ignore */
      }
    }),
};

/** Factory matching Ouroboros-style create* export. */
export function createOpenCode2HarnessPlugin(): HarnessPlugin {
  return OpenCode2Plugin;
}
