/**
 * One-shot: load docs/presentations/clawql-slides.md and call runMemoryIngest.
 * Usage: CLAWQL_OBSIDIAN_VAULT_PATH=/path/to/vault node scripts/ingest-slide-deck-vault.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runMemoryIngest } from "../dist/memory-ingest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const deck = readFileSync(join(root, "docs", "presentations", "clawql-slides.md"), "utf8");

const insights = `## Summary

Durable copy of the **April 2026** consolidated ClawQL slide deck (48 slides) for Obsidian + \`memory_recall\`. Full verbatim deck is in the **Tool outputs** block below. Canonical repo path: \`docs/presentations/clawql-slides.md\`.

## Tags / topics

#clawql #slides #april-2026 #mcp #onyx #ouroboros #flink #obsidian #document-pipeline #helm

## Deck map (section → slides)

- **Core:** problem, what/who, architecture, 10-tool surface, search/execute, memory, transports, GraphQL
- **Document pipeline:** Tika, Gotenberg, Stirling, Paperless, Onyx, end-to-end scenario
- **Intelligence:** Ouroboros 5 phases, Cuckoo, Merkle, notify/Slack
- **Infra:** 9 providers, Helm, service table, privacy/security, golden images, OPA, Uptime Kuma, observability, PagerDuty, sizing
- **Roadmap/vision:** demo, dependency-ordered roadmap, design principles, positioning, ClawQL-Agent, OpenClaw, LangGraph stack, NATS, edge workers, digital employees, Q2–Q4 roadmap, closing

## Follow-ups

- [ ] When changing the public deck, refresh \`docs/presentations/clawql-slides.md\` and re-run this script or \`memory_ingest\` with the same stable title.`;

const r = await runMemoryIngest({
  title: "ClawQL complete consolidated slide deck (April 2026)",
  sessionId: "ingest-2026-04-23-deck",
  insights,
  toolOutputs: deck,
  append: true,
});

if (!r.ok) {
  console.error(r.error ?? "unknown");
  process.exit(1);
}
console.log(JSON.stringify(r, null, 2));
