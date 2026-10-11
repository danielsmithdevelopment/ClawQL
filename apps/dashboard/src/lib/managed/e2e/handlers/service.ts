import { Context, Effect, Layer } from "effect";
import type { NextResponse } from "next/server";

import { E2eHarness, E2eHarnessLive, runE2eEffect } from "@/lib/managed/e2e/service";

import { getAudit } from "./audit";
import { postChatCompletions } from "./chat-completions";
import { getEvents, postEvents } from "./events";
import { postMcpToolsCall } from "./mcp-tools-call";
import { postMcpToolsList } from "./mcp-tools-list";

/**
 * Production-shaped witness HTTP handlers (audit / events / v1 / mcp).
 * Next route files stay thin façades over `runWitnessEffect`.
 */
export class E2eWitnessHandlers extends Context.Service<
  E2eWitnessHandlers,
  {
    readonly getAudit: (req: Request) => Effect.Effect<NextResponse, unknown, E2eHarness>;
    readonly getEvents: (req: Request) => Effect.Effect<NextResponse, unknown, E2eHarness>;
    readonly postEvents: (req: Request) => Effect.Effect<NextResponse, unknown, E2eHarness>;
    readonly postChatCompletions: (req: Request) => Effect.Effect<NextResponse, unknown, E2eHarness>;
    readonly postMcpToolsList: (req: Request) => Effect.Effect<NextResponse, unknown, E2eHarness>;
    readonly postMcpToolsCall: (req: Request) => Effect.Effect<NextResponse, unknown, E2eHarness>;
  }
>()("clawql/E2eWitnessHandlers") {}

export const E2eWitnessHandlersLive = Layer.succeed(
  E2eWitnessHandlers,
  E2eWitnessHandlers.of({
    getAudit,
    getEvents,
    postEvents,
    postChatCompletions,
    postMcpToolsList,
    postMcpToolsCall,
  }),
);

/** Host boundary: provide witness handlers + harness, return Promise for App Router. */
export function runWitnessEffect(
  program: Effect.Effect<NextResponse, unknown, E2eHarness | E2eWitnessHandlers>,
): Promise<NextResponse> {
  return Effect.runPromise(
    program.pipe(Effect.provide(E2eWitnessHandlersLive), Effect.provide(E2eHarnessLive)),
  );
}

/** Convenience when the route only needs harness (same as runE2eEffect). */
export function runWitnessHandler(
  handler: (req: Request) => Effect.Effect<NextResponse, unknown, E2eHarness>,
  req: Request,
): Promise<NextResponse> {
  return runE2eEffect(handler(req));
}
