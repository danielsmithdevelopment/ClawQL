import { Effect } from "effect";
import type { ListedMcpTool } from "mcp-grpc-transport";
import { escapeMcpUiHtml } from "../mcp-ui-form.js";
import { isClaimButtonTool } from "../mcp-ui-templates/patterns.js";
import { AGENT_LAB_STEP_CANDIDATES } from "./presets.js";

export type CatalogStarterLinkId =
  | "agent-lab"
  | "cloudflare-claim"
  | "flamegraph"
  | "executor-cmp";

export type CatalogStarterLink = {
  readonly id: CatalogStarterLinkId;
  readonly href: string;
  readonly label: string;
  readonly blurb: string;
  readonly relevant: boolean;
};

const agentLabMatchCount = (tools: readonly ListedMcpTool[]): number => {
  const names = new Set(tools.map((t) => t.name));
  return AGENT_LAB_STEP_CANDIDATES.filter((row) =>
    row.candidates.some((candidate) => names.has(candidate))
  ).length;
};

export const selectCatalogStarterLinks = (
  tools: readonly ListedMcpTool[],
  basePath: string
): Effect.Effect<readonly CatalogStarterLink[]> =>
  Effect.sync(() => {
    const base = basePath.replace(/\/$/, "") || "/mcp-ui";
    const agentLabRelevant = agentLabMatchCount(tools) >= 2;
    const claimRelevant = tools.some((tool) => isClaimButtonTool(tool));
    return [
      {
        id: "agent-lab",
        href: `${base}/presets/agent-lab`,
        label: "Agent Lab",
        blurb: "Scaffold a multi-step HTMX workflow from matching catalog tools.",
        relevant: agentLabRelevant,
      },
      {
        id: "cloudflare-claim",
        href: `${base}/presets/cloudflare-claim`,
        label: "Click-to-claim",
        blurb: "Turn WebMCP claim tools into a one-click human surface.",
        relevant: claimRelevant,
      },
      {
        id: "flamegraph",
        href: `${base}/trace/compare`,
        label: "Context flamegraph",
        blurb: "Compare compressed vs fat context traces.",
        relevant: false,
      },
      {
        id: "executor-cmp",
        href: `${base}/trace/compare/executor`,
        label: "Executor vs ClawQL",
        blurb: "Token comparison from live executor-cmp measurements.",
        relevant: false,
      },
    ];
  });

const renderRelevantCard = (link: CatalogStarterLink): string =>
  `<a class="starter-card" href="${escapeMcpUiHtml(link.href)}">
    <strong>${escapeMcpUiHtml(link.label)}</strong>
    <span>${escapeMcpUiHtml(link.blurb)}</span>
  </a>`;

export const renderCatalogStarterStrip = (
  tools: readonly ListedMcpTool[],
  basePath: string
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const links = yield* selectCatalogStarterLinks(tools, basePath);
    const relevant = links.filter((link) => link.relevant);
    const demos = links.filter((link) => !link.relevant);
    const relevantHtml =
      relevant.length === 0
        ? ""
        : `<div class="starter-relevant" aria-label="Suggested starters">${relevant
            .map(renderRelevantCard)
            .join("")}</div>`;
    const demoItems = demos
      .map(
        (link) =>
          `<li><a href="${escapeMcpUiHtml(link.href)}">${escapeMcpUiHtml(link.label)}</a> — ${escapeMcpUiHtml(link.blurb)}</li>`
      )
      .join("");
    return `<section class="starter-strip">
      ${relevantHtml}
      <details class="starter-demos">
        <summary>Adapter demos</summary>
        <ul>${demoItems}</ul>
      </details>
    </section>`;
  });

export const runRenderCatalogStarterStrip = (
  tools: readonly ListedMcpTool[],
  basePath: string
): string => Effect.runSync(renderCatalogStarterStrip(tools, basePath));

export const runSelectCatalogStarterLinks = (
  tools: readonly ListedMcpTool[],
  basePath: string
): readonly CatalogStarterLink[] => Effect.runSync(selectCatalogStarterLinks(tools, basePath));
