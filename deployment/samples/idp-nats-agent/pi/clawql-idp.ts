/**
 * Pi extension stub — ClawQL IDP via MCP ([#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)).
 *
 * Copy into your Pi extensions directory. Ensure Pi's MCP config includes ClawQL:
 *   { "clawql": { "url": "http://127.0.0.1:8080/mcp" } }
 *
 * Async NATS follow-up runs separately: `npm run nats:agent-bridge` in the ClawQL repo.
 *
 * This file is intentionally dependency-light so Pi can load it without the ClawQL monorepo.
 */

export const clawqlIdpExtension = {
  id: "clawql-idp",
  name: "ClawQL IDP",
  description:
    "Prefer ClawQL MCP for document pipelines. Async events use NATS (nats:agent-bridge).",
  systemPromptAddendum: `
## ClawQL IDP
Use MCP server **clawql** for run_idp_pipeline, search/execute, HITL, and memory_*.
Do not reimplement Stirling/Nextcloud hops. Inbox → JetStream is handled by ClawQL workers;
terminal events are ingested by nats:agent-bridge. Correlation IDs must thread across tools.
`,
};

export default clawqlIdpExtension;
