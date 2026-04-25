# syntax=docker/dockerfile:1
# ClawQL MCP server — stdio transport. Bundled OpenAPI/Discovery under /app/providers.
#
# Build (repo root):  docker build -f docker/Dockerfile -t clawql-mcp .
# Run (stdio):        docker run -i --rm clawql-mcp

FROM node:25-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/mcp-grpc-transport/package.json ./packages/mcp-grpc-transport/
COPY packages/clawql-ouroboros/package.json ./packages/clawql-ouroboros/
# `workspace:*` deps (e.g. clawql-ouroboros) need every workspace package.json present before `npm ci`.
# `prepare` runs `tsc` before src/ exists — skip lifecycle scripts until deps are installed.
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY packages ./packages
RUN npm run build && npm prune --omit=dev

COPY providers ./providers
COPY bin ./bin

# Writable Obsidian vault mount (memory tools); nonroot must own the tree.
RUN mkdir -p /vault && chown 65532:65532 /vault

# Distroless Node: no shell; only Node + minimal libc / CA bundle for HTTPS fetches.
# Runtime uses Node 24 (LTS); no nodejs26 image yet. Build stage above may use a newer major.
FROM gcr.io/distroless/nodejs24-debian13 AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Prefer bundled files on disk; avoids surprise network fetches when a spec is missing.
ENV CLAWQL_BUNDLED_OFFLINE=1
# Writable mount for memory_* tools; override at runtime if your orchestrator mounts elsewhere.
ENV CLAWQL_OBSIDIAN_VAULT_PATH=/vault
# Optional at runtime (not baked in): CLAWQL_SANDBOX_BRIDGE_URL, CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN for sandbox_exec.

COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules
# Workspace deps are linked from `node_modules`; copy package trees (dist) for distroless paths.
COPY --from=builder --chown=nonroot:nonroot /app/packages/mcp-grpc-transport ./packages/mcp-grpc-transport
COPY --from=builder --chown=nonroot:nonroot /app/packages/clawql-ouroboros ./packages/clawql-ouroboros
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/bin ./bin
COPY --from=builder --chown=nonroot:nonroot /app/providers ./providers
COPY --from=builder --chown=nonroot:nonroot /app/package.json ./package.json
COPY --from=builder --chown=nonroot:nonroot /vault /vault

USER nonroot:nonroot

# Default container mode: remote MCP over Streamable HTTP (/mcp).
# Use `dist/server.js` if you specifically need stdio transport.
CMD ["dist/server-http.js"]
