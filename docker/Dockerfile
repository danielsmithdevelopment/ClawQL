# syntax=docker/dockerfile:1
# ClawQL MCP server — stdio transport. Bundled OpenAPI/Discovery under /app/providers.
#
# Build (repo root):  docker build -f docker/Dockerfile -t clawql-mcp .
# Run (stdio):        docker run -i --rm clawql-mcp

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# `prepare` runs `tsc` before src/ exists — skip lifecycle scripts until deps are installed.
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

COPY providers ./providers
COPY bin ./bin

# Writable Obsidian vault mount (memory tools); nonroot must own the tree.
RUN mkdir -p /vault && chown 65532:65532 /vault

# Distroless Node: no shell; only Node + minimal libc / CA bundle for HTTPS fetches.
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Prefer bundled files on disk; avoids surprise network fetches when a spec is missing.
ENV CLAWQL_BUNDLED_OFFLINE=1
ENV CLAWQL_OBSIDIAN_VAULT_PATH=/vault

COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/bin ./bin
COPY --from=builder --chown=nonroot:nonroot /app/providers ./providers
COPY --from=builder --chown=nonroot:nonroot /app/package.json ./package.json
COPY --from=builder --chown=nonroot:nonroot /vault /vault

USER nonroot:nonroot

# Default container mode: remote MCP over Streamable HTTP (/mcp).
# Use `dist/server.js` if you specifically need stdio transport.
CMD ["dist/server-http.js"]
