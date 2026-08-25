import { Effect } from "effect";
import type { HarnessContext, HarnessPlugin } from "../../src/types.js";

type OpenCodeModule = {
  OpenCode?: {
    create: (opts: { plugins?: unknown[] }) => Promise<{ close?: () => Promise<void> }>;
  };
};

const loadOpenCodeSdk = (): Effect.Effect<OpenCodeModule | null> =>
  Effect.tryPromise({
    try: async () => {
      const spec = "@opencode-ai/sdk";
      return (await import(spec)) as OpenCodeModule;
    },
    catch: (err) => err,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

/**
 * OpenCode2 embed harness plugin.
 * When `@opencode-ai/sdk` is not installed, registers a stub tool that explains the missing peer.
 */
export const OpenCode2Plugin: HarnessPlugin = {
  id: "opencode2",
  version: "0.1.0",

  setup: (ctx: HarnessContext) =>
    Effect.gen(function* () {
      const sdk = yield* loadOpenCodeSdk();
      let embedded: { close?: () => Promise<void> } | null = null;

      if (sdk?.OpenCode?.create) {
        embedded = yield* Effect.tryPromise({
          try: () => sdk.OpenCode!.create({ plugins: [] }),
          catch: (err) => err,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));
      }

      ctx.tools.register({
        name: "opencode2_session",
        description: "Delegate a coding task to an embedded OpenCode2 session",
        handler: (args) =>
          Effect.gen(function* () {
            if (!embedded) {
              return {
                ok: false,
                error:
                  "OpenCode2 SDK not installed — add optional peer @opencode-ai/sdk or use clawql opencode CLI harness",
                task: args.task,
              };
            }
            const task = typeof args.task === "string" ? args.task : "harness smoke task";
            const workingDirectory =
              typeof args.workingDirectory === "string" ? args.workingDirectory : process.cwd();

            yield* ctx.worm.append({
              type: "AGENT_ACTION",
              agentName: "harness-opencode2",
              metadata: {
                harnessEvent: "OPENCODE2_SESSION_STARTED",
                workingDirectory,
                taskPreview: task.slice(0, 200),
              },
            });

            yield* ctx.worm.append({
              type: "AGENT_ACTION",
              agentName: "harness-opencode2",
              metadata: {
                harnessEvent: "OPENCODE2_SESSION_COMPLETED",
                stub: true,
                note: "Full embed bridge pending OpenCode2 plugin ctx confirmation",
              },
            });

            return {
              ok: true,
              stub: true,
              workingDirectory,
              task,
            };
          }),
      });
    }),

  teardown: (_ctx: HarnessContext) => Effect.void,
};
