#!/usr/bin/env npx tsx
/**
 * One-shot Clef SystemOne smoke — self-host by default.
 * Exit 0 only when a choice answer is returned.
 *
 * Requires CLAWQL_CLEF_SYSTEMONE_URL unless CLAWQL_CLEF_ALLOW_WORKERS_AI=1
 * (Workers AI is not the official / held-out path).
 */

import { Effect } from "effect";
import {
  callRemoteClefEffect,
  remoteClefAvailable,
  resolveClefVariant,
  selfHostedClefAvailable,
} from "../packages/clawql-inference/src/decision/remote-clef.ts";

async function main(): Promise<void> {
  const requireSelfHost =
    process.env.CLAWQL_CLEF_REQUIRE_SELF_HOST?.trim() === "1" ||
    process.env.CLAWQL_CLEF_ALLOW_WORKERS_AI?.trim() !== "1";
  if (requireSelfHost && !selfHostedClefAvailable(process.env)) {
    console.error(
      "smoke requires CLAWQL_CLEF_SYSTEMONE_URL (self-host). Set CLAWQL_CLEF_ALLOW_WORKERS_AI=1 only for ad-hoc Workers AI experiments."
    );
    process.exit(1);
  }
  if (!remoteClefAvailable(process.env)) {
    console.error("Clef transport unavailable");
    process.exit(1);
  }
  const variant = resolveClefVariant(process.env.CLAWQL_CLEF_MODEL?.trim() || "clef-flash");
  const out = await Effect.runPromise(
    callRemoteClefEffect(
      {
        model: variant,
        input: "User asks to search the API catalog for Stripe payment endpoints.",
        use_site_id: "search_provider_tool_routing",
        allow_uncalibrated: true,
        questions: [
          {
            type: "choice",
            name: "route",
            instructions: "Select the best tool/route for this query.",
            choices: [
              { value: "mcp.search", description: "Search OpenAPI/operations catalog" },
              { value: "mcp.execute", description: "Execute a known operationId" },
              { value: "mcp.memory_recall", description: "Recall vault notes" },
            ],
          },
        ],
      },
      { env: process.env }
    )
  );
  console.log(
    JSON.stringify(
      {
        backend_id: out.backend_id,
        model: out.model,
        answers: out.answers,
        transport: selfHostedClefAvailable(process.env) ? "self-host-systemone" : "workers-ai",
      },
      null,
      2
    )
  );
  const route = out.answers.find((a) => a.name === "route" && a.type === "choice");
  if (!route || route.type !== "choice" || !route.choice) {
    console.error("smoke failed: no choice answer");
    process.exit(2);
  }
  console.error(`smoke ok choice=${route.choice}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
