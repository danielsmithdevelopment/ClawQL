# Secure defaults and escape hatches

**Status:** Audit 10.01 — operator reference  
**Companion:** [`.env.example`](../../.env.example) § “Security defaults / escape hatches”  
**CI:** `npm run check:secure-defaults` (`scripts/check-secure-defaults.mjs`)

ClawQL fails closed on networked surfaces. Flags below are **escape hatches** (or related bind/auth knobs) that deliberately weaken that posture for local demos, migration, or tests. Prefer loopback + real auth over flipping an `ALLOW_*` / `INSECURE_*` / `UNAUTH*` switch.

**Regulated column:** behavior when `CLAWQL_TIER=regulated` (see also `CLAWQL_WORM_REQUIRED` / `values-regulated.yaml`).

## Core table

| Variable                                 | Default                                                                         | What it opens                                                                                                                                                                                    | Regulated refuses?                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `CLAWQL_ALLOW_UNAUTHENTICATED`           | unset (off)                                                                     | Allows `CLAWQL_AUTH_MODE=noAuth` on a **non-loopback** MCP HTTP bind (`MCP_HOST` not `127.0.0.1` / `localhost` / `::1`)                                                                          | **Yes** — regulated refuses `noAuth` entirely (set `apiKey` or `oidc`)          |
| `CLAWQL_WEBHOOK_ALLOW_UNAUTHENTICATED`   | unset (off)                                                                     | Skips required webhook shared secrets (HITL / Nextcloud / ConeShare / Langfuse tokens)                                                                                                           | **Yes** (treat as demo-only; production must set tokens)                        |
| `CLAWQL_INFERENCE_ALLOW_UNAUTHENTICATED` | unset (off)                                                                     | Allows inference HTTP without virtual keys on a non-loopback bind                                                                                                                                | **Yes** — regulated forces virtual-key enforcement                              |
| `CLAWQL_INFERENCE_LOCAL_ONLY`            | unset (off); forced `1` under regulated                                         | When `1`, refuses non-local inference providers (`ollama` / `mlx` / allowlist only)                                                                                                              | Forced **on** (not an escape hatch under regulated)                             |
| `CLAWQL_WEB_ALLOW_LOOPBACK`              | unset (off)                                                                     | Allows `web_fetch` / external ingest URLs targeting loopback (SSRF gate bypass for tests)                                                                                                        | **Yes** — leave unset                                                           |
| `CLAWQL_NATS_ALLOW_INSECURE`             | unset (off)                                                                     | Allows NATS without credentials and/or without `tls://` / `wss://`                                                                                                                               | **Yes** for production; local demos only                                        |
| `CLAWQL_HTTP_GRAPHQL`                    | unset (off)                                                                     | Mounts in-process `/graphql` (bypasses execute-core governance)                                                                                                                                  | **Yes** — GraphQL refused under regulated                                       |
| `CLAWQL_DESKTOP_API_TOKEN`               | unset                                                                           | Shared secret for Desktop `/api/local/*` when operators expose the dashboard beyond the Electron loopback shell; leave unset when Desktop stays on `127.0.0.1` with `CLAWQL_DESKTOP_MODE=1` only | N/A (Desktop is local-first; do not bind the dashboard publicly)                |
| `MCP_HOST`                               | `127.0.0.1`                                                                     | Bind address for MCP Streamable HTTP. Non-loopback requires `apiKey`/`oidc` or `CLAWQL_ALLOW_UNAUTHENTICATED=1`                                                                                  | Non-loopback + `noAuth` refused                                                 |
| `MCP_ALLOWED_HOSTS`                      | loopback Host set (`127.0.0.1`, `localhost`, `::1`) when `MCP_HOST` is loopback | Comma-separated Host allowlist for DNS-rebinding protection (`allowedHosts` / Host header validation). Required when binding beyond loopback alongside real auth                                 | Keep tight allowlist; never `*`                                                 |
| `CLAWQL_EMBEDDING_PROVIDER`              | `auto` → **local** MiniLM (never inferred from `OPENAI_API_KEY`)                | `http` enables OpenAI-compatible remote embeddings; `off` needs `CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY=1`                                                                                             | Remote HTTP only if host ∈ `CLAWQL_EMBEDDING_HTTP_ALLOWLIST`; prefer `local`    |
| `CLAWQL_OPERATOR_APPROVE_KEY_HASH`       | unset                                                                           | Enables **operator-approved** outbound payment approve (SHA-256 hex of high-entropy key). Plaintext `CLAWQL_OPERATOR_APPROVE_KEY` refused unless migration hatch                                 | Required for key path; CLI approve refused under regulated (console human path) |
| `CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE`  | unset                                                                           | Dedicated OIDC `aud` for **human-approved** payment approve (must ≠ MCP `CLAWQL_AUTH_OIDC_AUDIENCE`)                                                                                             | Required for OIDC approve; `auth_time`-only refused                             |
| `CLAWQL_WORM_ENABLED`                    | on (unset = on; `0` disables)                                                   | `0` disables process WORM trail                                                                                                                                                                  | **Yes** — refuse start with WORM disabled                                       |
| `CLAWQL_WORM_REQUIRED`                   | unset (off); forced `1` under regulated                                         | Fail-closed appends when trail not ready                                                                                                                                                         | Forced **on**                                                                   |
| `CLAWQL_TIER=regulated`                  | `standard`                                                                      | Activates regulated profile: Panguard, IFC, WORM required, local-only inference, refuse bridge sandbox / noAuth / GraphQL / no-enforcement                                                       | — (this **is** the profile)                                                     |

## Related `CLAWQL_*ALLOW*|INSECURE*|UNAUTH*` flags

| Variable                                                                       | Default                  | What it opens                                                                          | Regulated refuses?                |
| ------------------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------- | --------------------------------- |
| `CLAWQL_ALLOW_NO_ENFORCEMENT`                                                  | unset (off)              | Silences boot SECURITY WARNING when no blocking `pre-execute` provider is composed     | **Yes**                           |
| `CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT`                                  | unset (off)              | Temporary migration: accept plaintext `CLAWQL_OPERATOR_APPROVE_KEY` instead of hash    | Migration only — prefer hash      |
| `CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY`                                             | unset (off)              | Allows `CLAWQL_EMBEDDING_PROVIDER=off` / vector backend off (unsupported product mode) | Prefer local embeddings           |
| `CLAWQL_ALLOW_PUBLIC_CLOUDRUN`                                                 | unset (off)              | Deploy script escape for public Cloud Run without gateway auth                         | **Yes**                           |
| `CLAWQL_ALLOW_CORS_STAR`                                                       | unset (off)              | Permits `CLAWQL_CORS_ALLOW_ORIGIN=*` in helper scripts                                 | Prefer explicit origins           |
| `CLAWQL_ADAPTER_ALLOW_UNAUTHENTICATED`                                         | unset (off)              | mcp-api-adapter unauthenticated non-loopback bind                                      | **Yes**                           |
| `CLAWQL_OBSERVABILITY_ALLOW_UNAUTHENTICATED`                                   | unset (off)              | Observability HTTP without API key                                                     | Demo only                         |
| `CLAWQL_NATS_HITL_ALLOW_UNSIGNED_RESUME`                                       | unset (off)              | NATS HITL resume without signed payload                                                | Demo only                         |
| `CLAWQL_WORKFLOW_ALLOW_DELETE`                                                 | unset (off)              | Argo workflow / cron delete via MCP `workflow` tool                                    | Keep off unless operator need     |
| `CLAWQL_WORKFLOW_ALLOW_AGENT_RESUME`                                           | unset (off)              | Agent-driven Argo resume (operator demos)                                              | Prefer signed HITL                |
| `CLAWQL_SOURCES_ALLOW_HTTP`                                                    | unset (off)              | Custom sources over cleartext HTTP                                                     | **Yes** — regulated refuses at boot |
| `CLAWQL_SOURCES_GRPC_INSECURE`                                                 | unset (off)              | gRPC custom sources without TLS                                                        | Prefer TLS                        |
| `CLAWQL_X402_ALLOW_INSECURE_PROOF`                                             | unset (off)              | Signature-only x402 proofs without facilitator verify (unit tests)                     | **Yes**                           |
| `CLAWQL_AP2_ALLOW_WITHOUT_X402`                                                | unset (off)              | AP2 path without x402 settlement                                                       | Prefer settlement                 |
| `CLAWQL_DASHBOARD_ALLOW_K8S_SYNC`                                              | off in production builds | Dashboard Vault/`kubectl` sync routes                                                  | Trusted admin machine only        |
| `CLAWQL_HARNESS_ALLOW_UNSANDBOXED`                                             | unset (off)              | Bench harness without sandbox                                                          | Lab only                          |
| `CLAWQL_DECISIONS_ALLOW_EXTERNAL_IMAGES`                                       | unset (off)              | Decision router egress for image inputs                                                | Explicit consent only             |
| `CLAWQL_DECISIONS_ALLOW_UNCALIBRATED`                                          | unset (off)              | Uncalibrated Fast Decision path                                                        | Prefer calibrated                 |
| `CLAWQL_SANDBOX_AGENT_SUBSTRATE_ALLOW_PRODUCTION`                              | unset (off)              | Agent-substrate sandbox in production-shaped deploys                                   | Review before enable              |
| `CLAWQL_WORM_PANGUARD_ALLOW`                                                   | unset (off)              | Panguard-related WORM path enable                                                      | Follow WORM docs                  |
| `CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST`                                            | unset (off)              | MCP events callbacks to localhost                                                      | Tests / demos                     |
| `CLAWQL_ARGO_CD_ALLOW_SYNC`                                                    | unset (off)              | Argo CD sync mutations via MCP                                                         | Namespace allowlist still applies |
| `CLAWQL_LAB_ALLOW_CLAUDE_JUDGE_VIA_OPENROUTER`                                 | unset (off)              | Lab judge via OpenRouter                                                               | Lab only                          |
| `CLAWQL_CORS_ALLOW_ORIGIN`                                                     | unset (no CORS)          | Reflect CORS `Access-Control-Allow-Origin` (e.g. `*` for Gallery)                      | Prefer explicit origin            |
| `CLAWQL_AUTH_OIDC_ALLOWED_EMAIL_DOMAINS`                                       | unset                    | Restrict OIDC email domains (hardening, not an open hatch)                             | Configure for tenant              |
| `CLAWQL_INFERENCE_LOCAL_ALLOWLIST`                                             | unset                    | Extra model ids allowed under local-only                                               | Keep narrow                       |
| `CLAWQL_EMBEDDING_HTTP_ALLOWLIST`                                              | unset                    | Host allowlist for `CLAWQL_EMBEDDING_PROVIDER=http` under regulated                    | Required for HTTP embeddings      |
| `CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST`                                          | unset                    | Required namespaces for `workflow` tool                                                | Configure before enable           |
| `CLAWQL_WORKFLOW_TEMPLATE_ALLOWLIST`                                           | unset                    | Optional template allowlist                                                            | Prefer set                        |
| `CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST`                                           | unset                    | Argo CD namespace allowlist                                                            | Configure before enable           |
| `CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES`                                       | unset                    | Schedule synthetic target URL prefixes                                                 | SSRF control                      |
| `CLAWQL_MCP_EVENTS_CALLBACK_ALLOWLIST`                                         | unset                    | MCP events callback URL allowlist                                                      | SSRF control                      |
| `CLAWQL_SESSION_IFC_ALLOWED`                                                   | unset                    | Session IFC allowedSourcesByDest JSON                                                  | Hardening                         |
| `CLAWQL_ISTIO_EGRESS_ALLOWLIST_MODE` / `CLAWQL_ISTIO_INSTALL_EGRESS_ALLOWLIST` | chart/script defaults    | Mesh egress allowlist install mode                                                     | Follow mesh runbooks              |

## Related bind / TLS (non-`CLAWQL_*` but paired)

| Variable              | Default           | What it opens                    | Regulated refuses?                        |
| --------------------- | ----------------- | -------------------------------- | ----------------------------------------- |
| `GRPC_ALLOW_INSECURE` | unset (off)       | gRPC without TLS on non-loopback | **Yes** — regulated requires TLS cert/key |
| `GRPC_BIND`           | loopback-oriented | gRPC listen address              | Prefer `127.0.0.1` or TLS                 |

## Operator checklist

1. Leave escape hatches **unset** unless you are on loopback and know why.
2. For anything networked: `CLAWQL_AUTH_MODE=apiKey|oidc`, real webhook tokens, NATS creds + `tls://`, local embeddings (or allowlisted HTTP).
3. For payments: hash-only operator key and/or dedicated approve OIDC audience — see [`outbound-payment-approve.md`](./outbound-payment-approve.md).
4. For regulated: set `CLAWQL_TIER=regulated` (or Helm `values-regulated.yaml`) and do **not** try to disable WORM / enforcement / local-only inference.

## Dynamic pass (CI)

Process-level regulated refusals (WORM off, MCP resume approve, `noAuth`, GraphQL, webhook token, inference local-only) are gated by `npm run test:regulated-refusals`. Wire-level coverage that spawns `dist/server-http.js` under the regulated profile with Object Lock S3 is `npm run test:regulated-wire` (same workflow). See [`scripts/security/README.md`](../../scripts/security/README.md). A kind + Helm job (D2) will exercise the chart surface against `values-regulated.yaml`.

## Related

- [`ai-enforcement-default-posture.md`](./ai-enforcement-default-posture.md)
- [`outbound-payment-approve.md`](./outbound-payment-approve.md)
- [`clawql-auth-oidc-stepup.md`](./clawql-auth-oidc-stepup.md)
- Migration: [`../getting-started/migrate-to-8.0.md`](../getting-started/migrate-to-8.0.md) — “Breaking changes from the security audit”
- Release notes: [`../release/RELEASE_NOTES_v8.0.0.md`](../release/RELEASE_NOTES_v8.0.0.md)
