# Integrations page draft (`clawql.com/integrations`)

**Status:** Draft for marketing site. Prepared 2026-11-11. Live route: [`apps/www/src/app/integrations/page.tsx`](../../apps/www/src/app/integrations/page.tsx).

**Related:** [`/agents`](https://clawql.com/agents) · [`/idp`](https://clawql.com/idp) · [`/cloud`](https://clawql.com/cloud) · [`/governance`](https://clawql.com/governance).

---

## Status verification (2026-11-11)

| Row | Verdict | Evidence |
| --- | --- | --- |
| Any MCP / Claude Code / Cursor | Shipped | MCP server; docs + marketing |
| Codex | **Shipped** | MCP client; `clawql codex` Seatbelt harness (`docs/plugins/sandbox.md`) |
| OpenClaw | Shipped | Adapters + case studies |
| Hermes / Pi one-click | Planned | Cloud platform plan |
| OpenAPI / Discovery / GraphQL / gRPC | Shipped | `docs/readme/configuration.md` |
| Other MCP servers | **Shipped** | `docs/getting-started/custom-sources.md` |
| Smithy | **Design** | Ontology page / whitepaper §7 — not shipping claim |
| WebMCP | **Early access** | Implemented in clawql-api; Chrome CDP preview |
| IDP vendors (pdf-inspector → Coneshare) | Shipped | Opt-in flags; Docling default; Tika/Gotenberg/Stirling opt-in 8.0 |
| Semantic search | Shipped; engine under review | Onyx unnamed pending evaluation |
| Seatbelt / Docker / Kata `sandbox_exec` | Shipped | `clawql-sandbox` |
| Docker Sandboxes guide | Planned | Cloud plan |
| Nitro / Firecracker | Under evaluation | Cloud plan |
| Tailscale / Headscale | Planned | Cloud / network v0.2 |
| Argo / Slack / schedule | Shipped | Opt-in MCP tools |
| Grafana stack | Self-host shipped · Cloud planned | `clawql-observability` |
| Vector | Planned | Cloud plan |
| OpenTelemetry | Shipped (opt-in) | Alloy / OTLP / Langfuse |
| OpenAI-compatible endpoint | **Shipped** | `clawql-inference` `POST /v1/chat/completions` |
| BYOK keys | **Shipped** | Provider env credentials; vault on managed |
| Local models (Ollama) | **Shipped** | Inference adapters |
| Blockchains | Design | Whitepaper — shown as design |
| AWS Emulator | Planned | Security / Cloud testing plans |

## Publishing notes

- [x] Verify every status (esp. former \[verify\] rows)
- [x] Cross-link from `/agents`, `/idp`, `/cloud`; catalog lives here
- [x] Semantic-search engine unnamed
- [x] Project names linked outward; no comparisons
- [x] Design rows (blockchains) kept, labeled Design
