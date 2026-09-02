import { Data, Effect } from "effect";
import type { ListedMcpTool } from "mcp-grpc-transport";
import type { GeneratedUiDefinition, GeneratedUiStep } from "./mcp-ui-generate.js";

export class McpUiPresetError extends Data.TaggedError("McpUiPresetError")<{
  readonly reason: string;
}> {}

/** Ordered Act-2 Agent Lab workflow candidates (docs demo server first, Core fallback). */
export const AGENT_LAB_STEP_CANDIDATES: ReadonlyArray<{
  readonly candidates: readonly string[];
  readonly label: string;
}> = [
  {
    candidates: ["docs_search", "clawql_docs_search", "search"],
    label: "Search docs surface",
  },
  {
    candidates: ["docs_list_routes", "list_routes", "memory_recall"],
    label: "Map hubs / recall context",
  },
  {
    candidates: ["docs_reveal_agent_lab", "reveal_agent_lab", "skills_list"],
    label: "Reveal Agent Lab",
  },
  {
    candidates: ["docs_claim_starter_pack", "claim_starter_pack", "skills_get"],
    label: "Claim starter pack",
  },
];

export const AGENT_LAB_PRESET_SLUG = "agent-lab";

/**
 * Build a GeneratedUiDefinition for the Agent Lab workflow from the live catalog.
 * Effect-first — Express handlers run this at the host boundary.
 */
export const resolveAgentLabPresetDefinition = (
  tools: readonly ListedMcpTool[]
): Effect.Effect<GeneratedUiDefinition, McpUiPresetError> =>
  Effect.gen(function* () {
    const known = new Set(tools.map((t) => t.name));
    const steps: GeneratedUiStep[] = [];
    for (const row of AGENT_LAB_STEP_CANDIDATES) {
      const hit = row.candidates.find((name) => known.has(name));
      if (hit) {
        steps.push({ tool: hit, label: row.label });
      }
    }
    if (steps.length < 2) {
      return yield* new McpUiPresetError({
        reason:
          "Agent Lab preset needs ≥2 matching tools. Point the adapter at examples/mcp-api-adapter/docs-agent-lab-server.mjs (docs_*) or a Core catalog with search + memory_recall.",
      });
    }
    return {
      title: "Docs Agent Lab",
      description:
        "HTMX-scaffolded multi-step view that does not exist as a static page on the docs site — Act 2 of WebMCP → /mcp-ui → flamegraph.",
      slug: AGENT_LAB_PRESET_SLUG,
      steps,
    } satisfies GeneratedUiDefinition;
  });

export const runResolveAgentLabPreset = (
  tools: readonly ListedMcpTool[]
): GeneratedUiDefinition => Effect.runSync(resolveAgentLabPresetDefinition(tools));

/** Cloudflare-style coupon claim: reveal challenge → claim (agent tools → human UI). */
export const CLOUDFLARE_CLAIM_STEP_CANDIDATES: ReadonlyArray<{
  readonly candidates: readonly string[];
  readonly label: string;
}> = [
  {
    candidates: [
      "cf_reveal_challenge",
      "reveal_challenge",
      "cloudflare_reveal_coupon",
    ],
    label: "Reveal challenge coupon",
  },
  {
    candidates: [
      "cf_claim_coupon",
      "claim_coupon",
      "cloudflare_claim_coupon",
    ],
    label: "Claim coupon",
  },
];

export const CLOUDFLARE_CLAIM_PRESET_SLUG = "cloudflare-claim";

export const resolveCloudflareClaimPresetDefinition = (
  tools: readonly ListedMcpTool[]
): Effect.Effect<GeneratedUiDefinition, McpUiPresetError> =>
  Effect.gen(function* () {
    const known = new Set(tools.map((t) => t.name));
    const steps: GeneratedUiStep[] = [];
    for (const row of CLOUDFLARE_CLAIM_STEP_CANDIDATES) {
      const hit = row.candidates.find((name) => known.has(name));
      if (hit) {
        steps.push({ tool: hit, label: row.label });
      }
    }
    if (steps.length < 2) {
      return yield* new McpUiPresetError({
        reason:
          "Cloudflare-claim preset needs reveal + claim tools. Point the adapter at examples/mcp-api-adapter/cloudflare-claim-server.mjs (cf_*).",
      });
    }
    return {
      title: "Cloudflare-style click-to-claim",
      description:
        "Third-party WebMCP coupon tools re-humanized through /mcp-ui — Protocol Fabric: agent interface → human click.",
      slug: CLOUDFLARE_CLAIM_PRESET_SLUG,
      steps,
    } satisfies GeneratedUiDefinition;
  });

export const runResolveCloudflareClaimPreset = (
  tools: readonly ListedMcpTool[]
): GeneratedUiDefinition =>
  Effect.runSync(resolveCloudflareClaimPresetDefinition(tools));
