# Dominance peer wiring (equal-arm)

How to put the remaining [dominance roadmap](./dominance-roadmap.md) peers on a shared fixture. Marketing stays bound to measured boards.

## Status snapshot (2026-10-17)

| Peer | Ship form | Equal-arm path | Blocker |
| --- | --- | --- | --- |
| **Bifrost** | OSS binary (`npx @maximhq/bifrost`) | `MT_ARMS=…,bifrost,bifrost_codemode` on pets multiturn | Tokens **measured** (Code Mode 2.25× / classic 3.95×). Still need p99 concurrency + governance depth. |
| **Obot** | OSS Docker / Helm ([obot-platform/obot](https://github.com/obot-platform/obot)) | Register equal-arm catalog MCP behind Obot gateway → `OBOT_MCP_URL` arm | Auth bootstrap + catalog registration; not on board yet. |
| **TrueFoundry** | Enterprise / private Helm (`tfy-llm-gateway`) | Needs tenant + `TFY_API_KEY` gateway plane | **SaaS/credentials** — cannot smoke without a TF org. Document governance bake-off once credentials exist. |
| **Uber MCP Gateway** | Internal only (blog design) | Technique bake-off: Omni discovery + response projection vs ClawQL search/`where`/`fields` | **Not OSS** — implement a *technique peer* harness (projection field trim), not their binary. |
| **ContextForge** | Prior nested boards | Direct `/pets` virtualization (no MCPJungle nest) | Nested adapter still inflates; direct arm next. |
| **agentgateway / Executor** | Already measured | Re-pin latest binaries after compact JSON | Version rot. |

## Obot local recipe (next OSS peer)

```bash
# Bootstrap (auth on)
docker run -d --name obot -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e OBOT_SERVER_ENABLE_AUTHENTICATION=true \
  -e OBOT_BOOTSTRAP_TOKEN=clawql-bench-token \
  ghcr.io/obot-platform/obot:latest

# Then: register the equal-arm catalog stdio MCP as an Obot-hosted server,
# obtain the gateway MCP URL for the curated catalog, and:
export OBOT_MCP_URL=http://127.0.0.1:8080/…   # path from Obot UI after registration
export OBOT_MCP_TOKEN=clawql-bench-token       # if required

MT_ARMS=clawql,obot,mcpjungle,agentgateway \
  npm run benchmark:gateway-multi-multiturn
```

Harness: `scripts/benchmarks/gateway-multi-multiturn.mjs` skips the `obot` arm unless `OBOT_MCP_URL` is set (honest skip, not a fabricated peer).

## Uber technique bake-off (no binary)

Uber’s published Omni tools (`discover_server` → `discover_tools` → `get_tool_schema` → `invoke_tool`) + GraphQL-style response projection are **ideas**, not a downloadable gateway. Equal-arm proof:

1. Keep pets fixture.
2. Peer A: ClawQL `search` + `execute` with `where`/`fields`.
3. Peer B: harness-emulated Omni (four meta-tools) + path-trim projection on fat results.
4. Compare Layer1 + Layer2 + weighted model-written — same task_success.

Do not claim “vs Uber MCP Gateway” until they publish a runnable peer or accept maintainer config on a shared fixture.

## TrueFoundry

Enterprise MCP Gateway (control plane hosted). When a tenant + gateway token are available:

1. Deploy `tfy-llm-gateway` plane (or use SaaS endpoint).
2. Register equal-arm OpenAPI/MCP catalog.
3. Point `TRUEFOUNDRY_MCP_URL` (+ auth headers) at the multiturn harness (same skip-if-unset pattern as Obot).
4. Score tokens + policy-bound write audit completeness.

Until then status stays **Not on board** with an explicit credentials blocker.

## Celld + injection (earned claims, parallel track)

- `clawql security celld` — pin readiness / kill-node eligibility (file-journal stand-in until isolate host).
- `clawql security inject --mode direct|indirect|multistep` — in-process Panguard drills (§24).
- Live MCP: openbench `memory-injection-attempt`.
- Crash claim: only after pin.isolateReady **and** three-arm celld kill-node demo (ADR 0015).
