# GTM: AgentReady “act” — what ClawQL may claim

**Status:** honesty-gated positioning (2026-10-21)  
**Spec source:** [agentready.org](https://agentready.org) § Let agents act · AR-ACT-\*  
**Market fact (Ora scanner, cited by the spec):** ~80% of sites reachable by major AI crawlers; ~3% ship a spec-grade MCP server; OAuth metadata + PKCE pass on ~1%. Agents can read. They cannot act.  
**Companion:** [score note](./agentready-score-2026-10.md) · [act safely proposal](../proposals/agentready-act-safely.md) · [golem / durability honesty](./golem-overlap-and-durability-honesty.md)

---

## One-liner (shipped-only)

**ClawQL turns an OpenAPI (or Discovery / GraphQL / gRPC) catalog into the AgentReady *act* surface: an MCP server, a CLI, and OAuth with PKCE for the product gateway — then governs consequential writes.**

Do **not** append “and WebMCP” or “listed in the MCP Registry” until those rows below are green for the **public** product.

---

## Map AR-ACT → ClawQL (claim table)

| ID | Strength | Spec wording (short) | ClawQL | Claim? |
| -- | -------- | -------------------- | ------ | ------ |
| **AR-ACT-10** | MUST (if agents should finish tasks) | MCP **or** CLI, at least one; not an empty surface | **CLI** on npm (`clawql-mcp`); **MCP** Streamable HTTP in product (`/mcp`) | **Yes** for self-host / CLI. **No** for “hosted public MCP at docs.clawql.com/mcp” until that URL speaks MCP (today: **404**). |
| **AR-ACT-03** | SHOULD | Streamable HTTP at `/mcp`; docs MCP public; product MCP OAuth + RFC 9728 PRM + PKCE; Registry `server.json` | HTTP `/mcp` + `clawql-auth` PRM/PKCE **shipped in code**. Server-card published. **Registry `server.json` absent.** Docs `/mcp` **not live**. Marketing PRM points at Google OIDC discovery, not a live ClawQL MCP AS on that host. | Claim **“implements MCP OAuth + RFC 9728 + PKCE in the gateway”**. Do **not** claim “public docs MCP” or “MCP Registry listed” yet. |
| **AR-ACT-01** | SHOULD | Auth an agent can finish (keys / OAuth metadata) | API keys, OIDC, MCP OAuth (flag), x402 gates — product. Self-serve key story is scanner-partial. | Claim carefully: “agents auth to the gateway”; avoid “every agent finishes OAuth on clawql.com without a human.” |
| **AR-ACT-02** | SHOULD | Public API + OpenAPI | ClawQL **consumes** customer OpenAPI to expose MCP tools. ClawQL.com itself does not present a public product REST OpenAPI the scanners found. | Pitch **customers’** APIs → MCP. Do not imply clawql.com ships a public CRUD OpenAPI for the SaaS. |
| **AR-ACT-06** | SHOULD | SDKs + CLI | CLI shipped; npm SDK surface is the product package. Multi-language SDKs not a claim. | **Yes** for CLI. |
| **AR-ACT-07** | SHOULD | WebMCP on pages agents act through | Site `WebMcpRegister` + draft ingest — **preview**. PixelDrop / e2e still open. | **“WebMCP (preview)”** only — already used in fabric copy. |
| **AR-ACT-04** | MAY | Server cards | `/.well-known/mcp/server-card.json` on www + docs | **Yes** — with the caveat that remotes must match live URLs. |
| **AR-ACT-05 / 08 / 09** | MAY | MCP Apps / payments / NLWeb | Not the lead pitch | No |

---

## Sharp pitch (use)

> Most of the web is readable by agents. Almost none of it is *actionable*. AgentReady’s own scanner puts spec-grade MCP at ~3% and OAuth metadata + PKCE at ~1%. ClawQL is built for that gap: give us your OpenAPI, get an MCP server and CLI agents can call, with OAuth + PKCE when you gate the product — and with mandate / preview controls when the call is consequential.

## Softer pitch (after public MCP URL is fixed)

> …Serve docs MCP publicly at `/mcp`, gate product tools with protected-resource metadata (RFC 9728) and PKCE, and list the server in the MCP Registry — the AR-ACT-03 shape, generated from your API catalog.

## Forbidden until remediations land

- “ClawQL.com is AgentReady certified / compliant” (no badges in the spec).
- “Our public MCP at docs.clawql.com/mcp…” (404 as of 2026-10-21).
- “Listed in the MCP Registry with server.json.”
- “WebMCP production” / “exactly-once remote writes” / “AgentDojo proven.”
- Equating marketing `/.well-known/oauth-protected-resource` (Google AS pointers) with a completed agent login to ClawQL product tools.

---

## Proof points to link (shipped)

| Claim | Evidence |
| ----- | -------- |
| OpenAPI → MCP `search` / `execute` | Root product; `docs/mcp/mcp-api-adapter.md` (Core vs adapter table) |
| Streamable HTTP MCP | `src/http/mcp-http-server.ts`, `bin/clawql-mcp-http.mjs` |
| RFC 9728 + PKCE | `packages/clawql-auth` (`protected-resource.ts`, `mcp-oauth.ts`); tests `src/server-http-mcp-oauth.test.ts` |
| CLI | `npx -p clawql-mcp clawql …` |
| Consequential act (beyond AgentReady) | Mandate park/resume + sources propose — see [act safely](../proposals/agentready-act-safely.md) |

---

## Competitive frame (honest)

AgentReady **act** stops at *can the agent act?* ClawQL’s differentiation for businesses is **act safely** (preview/commit, at-most-once approved writes, injection resistance) — proposed as a contribution to the standard, not as an existing AR identifier. Keep those stories in separate sentences so we never look like we are rewriting AgentReady’s MUST list.
