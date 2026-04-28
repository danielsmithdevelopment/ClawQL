# ClawQL Deployment and Client Configuration

This guide links the common ways to run ClawQL and connect MCP clients.

## Local Stdio (Most Common)

Use `npx`:

```bash
CLAWQL_PROVIDER=all-providers npx clawql-mcp
```

Configure Cursor/Claude to run `clawql-mcp` over stdio.

## Local/Remote HTTP MCP

Run:

```bash
PORT=8080 npm run start:http
```

Endpoints:

- MCP: `http://localhost:8080/mcp`
- Health: `http://localhost:8080/healthz` — set **`CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS=1`** to include **`nativeProtocolMetrics`** (native GraphQL/gRPC merge and execute counters) in the JSON body.
- GraphQL debug endpoint: `http://localhost:8080/graphql`

## Cursor / Claude Configuration

Use:

- `.cursor/mcp.json.example` as the starting template for Cursor
- MCP docs from Cursor for `${env:...}` interpolation

For HTTP mode, configure a server with `url` ending in `/mcp`.
For stdio mode, configure `command` + `args`.

## Docker

See:

- `docker/README.md`

The image supports mounting a vault at `/vault` and running `clawql-mcp-http` or stdio mode.

## Cloud Run

Quick deploy:

```bash
PROJECT_ID="your-project-id" REGION="us-central1" bash scripts/deploy-cloud-run.sh
```

Or:

```bash
PROJECT_ID="your-project-id" REGION="us-central1" make deploy-cloud-run
```

Full guide: `docs/deployment/deploy-cloud-run.md`

## Kubernetes

Local Docker Desktop:

```bash
make local-k8s-up
```

Remote clusters:

```bash
ENV=dev IMAGE=us-central1-docker.pkg.dev/<project>/<repo>/clawql-mcp TAG=<tag> make deploy-k8s
```

References:

- `docs/deployment/deploy-k8s.md`
- `docs/deployment/helm.md`
- `docker/README.md`

## Optional gRPC Transport

Set:

```bash
ENABLE_GRPC=1
```

Optional reflection:

```bash
ENABLE_GRPC_REFLECTION=1
```

Package docs and invocation details:

- `packages/mcp-grpc-transport/README.md`
