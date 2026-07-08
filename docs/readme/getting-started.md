# ClawQL Getting Started

This guide is the quick path for running `clawql-mcp` locally and connecting it to an MCP client.

## First 5 minutes

1. Install (or run without a global install):

```bash
npx -p clawql-mcp clawql-mcp
```

With no spec-related environment variables, ClawQL loads the **opinionated default stack**: **Cloudflare, GitHub, Slack, Linear, Notion, Onyx**.

2. Configure your MCP client (Cursor / Claude Desktop) for stdio — see [deployment.md](./deployment.md) and [agent setup prompt](../getting-started/agent-setup-prompt.md).

3. Set credentials for at least one vendor you want to call live (e.g. `GITHUB_TOKEN`, `SLACK_BOT_TOKEN`). Then use **`search`** → **`execute`**.

4. Optional health check after HTTP mode:

```bash
PORT=8080 npx -p clawql-mcp clawql-mcp-http
CLAWQL_MCP_URL=http://127.0.0.1:8080 bash scripts/dev/clawql-doctor.sh
```

## Set up with your agent

Paste the copy-paste block from [agent-setup-prompt.md](../getting-started/agent-setup-prompt.md) into Cursor or Claude for a guided first run.

**Vault-first CLI (recommended):**

```bash
npx -p clawql-mcp clawql init --interactive
npx -p clawql-mcp clawql doctor
npx -p clawql-mcp clawql mcp-config
```

See [local-provider-vault.md](../getting-started/local-provider-vault.md).

## TL;DR run modes

### Default stack (recommended first run)

```bash
npx -p clawql-mcp clawql-mcp
```

### Full framework bundle (explicit opt-in)

```bash
CLAWQL_PROVIDER=all-providers npx -p clawql-mcp clawql-mcp
```

Literally every bundled vendor plus Google top-50 and AWS top-50. Helm **`clawql-mcp`** chart defaults here for full IDP/K8s stacks.

### Add Google or AWS to the default stack only

```bash
CLAWQL_ENABLE_GOOGLE=1 npx -p clawql-mcp clawql-mcp
CLAWQL_ENABLE_AWS=1 npx -p clawql-mcp clawql-mcp
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
