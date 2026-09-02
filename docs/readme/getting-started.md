# ClawQL Getting Started

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.** This guide is the quick path for running `clawql-mcp` locally (an Edge Agentic Gateway on your laptop) and connecting it to an MCP client. Enterprise fabric: [Zero-Trust Agentic Fabric](../architecture/zero-trust-agentic-fabric.md).

## First 5 minutes

1. Install (or run without a global install):

```bash
npx -p clawql-mcp clawql-mcp
```

With no spec-related environment variables, ClawQL's provider catalog is **empty by default** — `search` / `execute` start with zero bundled providers loaded. Opt in to the bundled stack with **`CLAWQL_PROVIDER=default`** (Cloudflare, GitHub, Slack, Linear, Notion, Onyx), or point at your own OpenAPI/Discovery spec.

2. Configure your MCP client (Cursor / Claude Desktop) for stdio — see [deployment.md](./deployment.md) and [Agent setup](../getting-started/agent-setup.md).

3. Set credentials via the vault (recommended):

```bash
npx -p clawql-mcp clawql onboard --interactive
# or: clawql init --interactive && clawql secrets set github
```

Then use **`search`** → **`execute`**.

4. Optional health check after HTTP mode:

```bash
PORT=8080 npx -p clawql-mcp clawql-mcp-http
CLAWQL_MCP_URL=http://127.0.0.1:8080 npx -p clawql-mcp clawql doctor
```

## Set up with your agent

Paste the copy-paste block from [agent-setup.md](../getting-started/agent-setup.md) into Cursor or Claude for a guided first run.

**Cursor iOS:** use [Agent setup — Cursor iOS](../getting-started/agent-setup.md#cursor-ios--cloud-agent) — stdio MCP on the agent VM, R2/S3/GCS for durable **`Memory/`**, and **`memory_sync`** between sessions. Day-one R2 enablement checklist: [Cloud Agent e2e: ClawQL + R2](../getting-started/cloud-agent-e2e-r2-memory.md).

**Vault-first CLI (recommended):**

```bash
npx -p clawql-mcp clawql onboard --interactive
```

Or step by step:

```bash
npx -p clawql-mcp clawql init --interactive
npx -p clawql-mcp clawql mcp-config --write cursor
npx -p clawql-mcp clawql doctor --smoke
```

See [local-provider-vault.md](../getting-started/local-provider-vault.md).

## TL;DR run modes

### Empty catalog (default, no opt-in)

```bash
npx -p clawql-mcp clawql-mcp
```

No bundled providers are loaded until you opt in — see below, or supply your own spec via `CLAWQL_SPEC_PATH` / `CLAWQL_SPEC_URL` / `CLAWQL_DISCOVERY_URL`.

### Opinionated default stack (opt-in)

```bash
CLAWQL_PROVIDER=default npx -p clawql-mcp clawql-mcp
```

Loads Cloudflare, GitHub, Slack, Linear, Notion, Onyx.

### Full framework bundle (explicit opt-in)

```bash
CLAWQL_PROVIDER=all-providers npx -p clawql-mcp clawql-mcp
```

Literally every bundled vendor plus Google top-50 and AWS top-50. The Helm **`clawql-mcp`** chart's `providers.pack` also defaults to **`none`** (empty catalog); set `providers.pack: default` or `providers.pack: all-providers` to opt in for K8s/IDP stacks.

### Add Google or AWS (requires an opted-in pack)

`CLAWQL_ENABLE_GOOGLE` / `CLAWQL_ENABLE_AWS` / `CLAWQL_ENABLE_CLOUDFLARE` **no longer select the provider stack** in 8.0. Opt in with `CLAWQL_PROVIDER=default` (or `all-providers`) / Helm `providers.pack`, then use instance `providers.enabled` or `CLAWQL_BUNDLED_PROVIDERS` for vendor lists. See [Migrate to 8.0](../getting-started/migrate-to-8.0.md).

```bash
CLAWQL_PROVIDER=all-providers npx -p clawql-mcp clawql-mcp
# or: CLAWQL_INSTANCE_SPEC='{"providers":{"pack":"default","enabled":["github","google"]}}'
```

### Local OpenAPI file

```bash
CLAWQL_SPEC_PATH=./openapi.yaml npx -p clawql-mcp clawql-mcp
```

### Remote OpenAPI URL

```bash
CLAWQL_SPEC_URL=https://example.com/openapi.json npx -p clawql-mcp clawql-mcp
```

### Google Discovery URL

```bash
CLAWQL_DISCOVERY_URL="https://compute.googleapis.com/$discovery/rest?version=v1" npx -p clawql-mcp clawql-mcp
```

## Install notes

- Package size is intentionally larger than average because bundled provider specs ship with the package for offline lookup.
- Primary binaries:
  - `clawql-mcp` (stdio MCP server)
  - `clawql-mcp-http` (HTTP MCP server with `/mcp`, `/healthz`, `/graphql`)

## Core tools

- `search`
- `execute`

Optional tools are enabled by environment flags (memory, sandbox, cache, audit, notify, Onyx, schedule, Ouroboros).

**Native APIs:** set **`CLAWQL_GRAPHQL_SOURCES`** and/or **`CLAWQL_GRPC_SOURCES`** (JSON arrays) to merge GraphQL HTTP endpoints and gRPC unary RPCs into the same **`search`** / **`execute`** index as OpenAPI — see **`docs/readme/configuration.md`** and **`docs/mcp/mcp-tools.md`**.

See `docs/mcp/mcp-tools.md` for the complete tool catalog and examples.

## Next steps

- Spec selection and precedence: `docs/readme/configuration.md`
- Bundled providers plugin: `docs/plugins/bundled-providers.md`
- Cursor / Claude config examples: `docs/readme/deployment.md`
- Cloud Run / Kubernetes deployment: `docs/readme/deployment.md`
- Private tailnets (Tailscale / Headscale, MagicDNS, `CLAWQL_MCP_URL`): `docs/deployment/tailscale-and-headscale-for-clawql.md` (project website **`/tailscale`**)
- AWS preset: `docs/providers/aws-onboarding.md`
