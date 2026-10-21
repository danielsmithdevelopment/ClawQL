# AgentReady score — clawql.com + docs.clawql.com (2026-10-21)

**Audience:** GTM, docs, and infra owners  
**Spec:** [agentready.org](https://agentready.org) (v2.0 · Oct 2026) · story: [ora.ai/blog/agentready-launch](https://ora.ai/blog/agentready-launch)  
**Related:** [act positioning](./agentready-act-positioning.md) · [act safely proposal](../proposals/agentready-act-safely.md) · [DNS-AID clawql.com](../deployment/dns-aid-clawql-com.md)

AgentReady does **not** score sites. Scoring is left to public rankers. This note records what those rankers and our own probes showed on **2026-10-21**, mapped to AR identifiers, plus remediations ordered by failure mode (not by score points).

---

## Scanner snapshot

| Ranker                                         | Target          | Result                                                                 | Notes                                                                                                           |
| ---------------------------------------------- | --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **is-agentic** (`npx is-agentic clawql.com`)   | clawql.com      | **79 / 100** — “Ready with a few material gaps” · 5 failed · 7 partial | Report: https://is-agentic.com/scan/clawql.com                                                                  |
| **ora ax** (`npx ax audit https://clawql.com`) | clawql.com      | **77 / 100 · B**                                                       | Discovery 4/12 · Access 22/42 · Usability 11/33 · Payments 1/1 · Report: https://ora.ai/clawql.com              |
| **Mintlify Agent Score**                       | docs.clawql.com | **79 / 100 · Grade C** · 15 / 30 checks                                | Browser: https://mintlify.com/score/clawql · CLI `npx mint score` requires `mint login` (not run authenticated) |

Reproduce:

```bash
npx is-agentic clawql.com
npx ax audit https://clawql.com
# Mintlify CLI needs auth; use the public score page for docs.clawql.com
```

Artifact copies from this run (agent workspace): `/opt/cursor/artifacts/agentready/`.

---

## MUST checks (spec) vs ClawQL

### Find — AR-FIND-01 · MUST · Allow agents in robots.txt **and** bot protection

| Surface             | robots.txt                                           | Bot / WAF gate                                                                                                                                                        |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **clawql.com**      | Allows `*` and named AI crawlers; `Sitemap:` present | Served by **GitHub.com** (Pages). Agent UAs (`Claude-User`, `GPTBot`, `ChatGPT-User`) returned **200** with full HTML. No Cloudflare challenge on apex in this probe. |
| **docs.clawql.com** | Same allow pattern + sitemap                         | Behind **Cloudflare**. Agent UAs returned **200** (no 403 / challenge page in this probe).                                                                            |

**Spec warning that still applies:** `curl -A` from a laptop does not prove production agent egress is allowed. Confirm OpenAI / Anthropic crawler IPs in **server / CF logs** periodically. Aggressive Bot Fight Mode on the docs zone would fail AR-FIND-01 even with a permissive robots.txt.

**Verdict:** Pass for public fetch probes. Log confirmation still outstanding (operator checklist).

### Read — AR-READ-01 · MUST · Answer in initial HTML

| Page           | Initial HTML (scripts stripped)                                                      | Verdict |
| -------------- | ------------------------------------------------------------------------------------ | ------- |
| `/`            | ~12k visible chars; brand, product, pricing/benchmarks nav, MCP/OpenAPI mentions     | Pass    |
| `/benchmarks/` | ~40k visible chars; board names, zone-audit / concurrency language, latency keywords | Pass    |
| `/pricing/`    | ~28k visible chars; “Open source… free forever”, plans as text                       | Pass    |

No `__NEXT_DATA__` SPA shell on clawql.com (static export). This is the hard failure mode Ora’s experiment isolated; we are not failing it on marketing pages.

### Read — AR-READ-02 · MUST · Real HTTP status codes

Nonexistent path on clawql.com returns **404** (is-agentic / ax). Partial credit only: no Markdown error body on `Accept: text/markdown`.

### Act — AR-ACT-10 · MUST (when agents should finish a task) · MCP **or** CLI

| Surface                      | Status                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI**                      | Shipped on npm as `clawql-mcp` bins (`clawql`, `clawql-mcp`, `clawql-mcp-http`). Scanners give **partial** because they want a clearer official install signal on the homepage.                                                                                                                               |
| **Product MCP (code)**       | Streamable HTTP at `/mcp` in `src/http/mcp-http-server.ts` — **shipped** for self-host / gateway.                                                                                                                                                                                                             |
| **Public remote advertised** | **Before this branch:** both server cards listed `https://docs.clawql.com/mcp` (live probe: **404**). **After:** remotes are omitted unless `NEXT_PUBLIC_MCP_STREAMABLE_HTTP_URL` / `MCP_SERVER_CARD_STREAMABLE_HTTP_URL` is set at build time; auth.md points agents at `npx -p clawql-mcp clawql-mcp-http`. |

**Verdict:** Product meets AR-ACT-10 via CLI + self-hosted MCP. Public discovery no longer advertises a dead Streamable HTTP URL. Standing up a real public docs MCP (AR-ACT-03) remains a follow-up, not a claim.

### Act — AR-ACT-03 · SHOULD · MCP details (Streamable HTTP, docs MCP public, product OAuth + RFC 9728 + PKCE, Registry `server.json`)

| Requirement                                                                   | ClawQL                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streamable HTTP at `/mcp`                                                     | Implemented in product HTTP binary; **not** live at advertised docs URL                                                                                                                                                          |
| Docs MCP public                                                               | **Not verified live** (404). Scanners report “MCP detected… requires authentication” from discovery metadata, not a working unauthenticated docs tool surface                                                                    |
| Product MCP OAuth + `/.well-known/oauth-protected-resource` (RFC 9728) + PKCE | **Shipped in `clawql-auth`** when `CLAWQL_MCP_OAUTH_ENABLED=1`. Marketing hosts also publish PRM documents that point at **Google** as AS — useful for discovery scanners, **not** the same as a live ClawQL MCP AS on that host |
| MCP Registry `server.json`                                                    | **Missing.** SEP-2127 **server-card** is published at `/.well-known/mcp/server-card.json` on www and docs. ax fails “Listed in MCP registries”                                                                                   |

---

## High-signal gaps (from scanners + probes)

Ordered by AgentReady failure modes and honesty, not by ranker points:

1. **Dead public MCP remote** — server-card / DNS-AID / marketing point at `docs.clawql.com/mcp` → **404**. Either stand up Streamable HTTP there (docs MCP public + product gated elsewhere) or stop advertising that URL.
2. **No MCP Registry `server.json` / bi-directional registry listing** — AR-ACT-03 / ax “Listed in MCP registries.”
3. **OpenAPI not discoverable from clawql.com** — ax / is-agentic: no API schema, no function-calling surface on the marketing host (expected if the product is gateway software, but then link OpenAPI / adapter docs explicitly from homepage + llms.txt).
4. **Markdown negotiation / `.md` mirrors** — AR-READ-09 is MAY; scanners still deduct. DNS-AID / CF edge work is already documented in `dns-aid-clawql-com.md` but apex is still GitHub Pages without Link / Accept negotiation.
5. **AI Catalog / ARD** — AR-FIND-04 MAY; no `/.well-known/ai-catalog.json` or `ard.json`.
6. **Brand / search discoverability** — clawql.com not in top 10 for “ClawQL agentic infrastructure” (scanner sample).
7. **agent-skills index digests** — ax: entries missing `digest` under v0.2.0 schema.
8. **Mintlify docs gaps** — Grade C / 15 of 30; re-run after docs MCP and llms-full / skill.md fixes (CLI login required for local `mint score`).

---

## What already looks AgentReady-shaped

- Permissive robots.txt on both hosts; sitemap linked.
- Pricing and benchmarks **in the initial HTML** (AR-READ-01 / AR-READ-11).
- `llms.txt` on clawql.com and docs.clawql.com.
- Real 404s on clawql.com.
- Discovery metadata present: server-card, OAuth PRM stubs, auth.md.
- Product stack implements the hard **act** pieces (MCP HTTP, RFC 9728 builder, PKCE S256, CLI) even when the public URL is wrong.

---

## Operator follow-ups

| Priority | Action                                                                                                                                                         | Owner hint    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| P0       | ~~Fix or unpublish dead `docs.clawql.com/mcp` remote~~ **Done in-repo** (remotes env-gated; auth.md honesty). **Deploy** www + docs so production cards match. | docs + www    |
| P0       | Confirm CF Bot settings + crawler IP 200s in logs for docs                                                                                                     | infra         |
| P1       | Publish MCP Registry `server.json` + Smithery/official registry listing                                                                                        | GTM + release |
| P1       | Split **public docs MCP** vs **OAuth-gated product MCP** per AR-ACT-03                                                                                         | product       |
| P2       | Link OpenAPI / CLI install from homepage + llms.txt; add `pricing.md` twin                                                                                     | www           |
| P2       | Finish DNS-AID / markdown edge on clawql.com (existing runbook)                                                                                                | infra         |
| P3       | AI Catalog, skill digests, Wikipedia/Wikidata (scanner hygiene)                                                                                                | GTM           |

Do not claim “AgentReady compliant” as a badge — the spec has none. Prefer: “scored with is-agentic / ora / Mintlify on \<date\>; MUST find/read pass on marketing HTML; act via CLI + self-hosted MCP; public Streamable HTTP URL remediation tracked.”
