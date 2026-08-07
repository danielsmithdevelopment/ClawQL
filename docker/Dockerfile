# syntax=docker/dockerfile:1
# ClawQL MCP server — stdio transport. Bundled OpenAPI/Discovery under /app/providers.
#
# Build (repo root):  docker build -f docker/Dockerfile -t clawql-mcp .
# Run (stdio):        docker run -i --rm clawql-mcp

FROM node:25-bookworm-slim AS builder
WORKDIR /app
# Pull Bookworm security updates before npm ci (golden-image Trivy gate).
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/clawql-core/package.json ./packages/clawql-core/
COPY packages/clawql-auth/package.json ./packages/clawql-auth/
COPY packages/clawql-pageindex/package.json ./packages/clawql-pageindex/
COPY packages/clawql-codegraph/package.json ./packages/clawql-codegraph/
COPY packages/clawql-api/package.json ./packages/clawql-api/
COPY packages/clawql-memory/package.json ./packages/clawql-memory/
COPY packages/clawql-ontology/package.json ./packages/clawql-ontology/
COPY packages/clawql-web/package.json ./packages/clawql-web/
COPY packages/clawql-documents/package.json ./packages/clawql-documents/
COPY packages/clawql-automation/package.json ./packages/clawql-automation/
COPY packages/clawql-sandbox/package.json ./packages/clawql-sandbox/
COPY packages/clawql-inference/package.json ./packages/clawql-inference/
COPY packages/clawql-payments/package.json ./packages/clawql-payments/
COPY packages/clawql-release/package.json ./packages/clawql-release/
COPY packages/mcp-grpc-transport/package.json ./packages/mcp-grpc-transport/
COPY packages/clawql-ouroboros/package.json ./packages/clawql-ouroboros/
COPY packages/clawql-operator/package.json ./packages/clawql-operator/
COPY packages/panguard-mcp-bridge/package.json ./packages/panguard-mcp-bridge/
# `workspace:*` deps (e.g. clawql-ouroboros) need every workspace package.json present before `npm ci`.
# `prepare` runs `tsc` before src/ exists — skip lifecycle scripts until deps are installed.
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY packages ./packages
RUN npm run build \
  && grep -qF 'server.tool("cache"' dist/tools.js \
  && grep -qF 'server.tool("audit"' dist/tools.js \
  && npm prune --omit=dev

COPY providers ./providers
COPY bin ./bin

# Writable Obsidian vault mount (memory tools); nonroot must own the tree.
RUN mkdir -p /vault && chown 65532:65532 /vault

# Distroless Node: no shell; only Node + minimal libc / CA bundle for HTTPS fetches.
# Runtime uses Node 24 (LTS); no nodejs26 image yet. Build stage above may use a newer major.
# Pin digest — bump when rebuilding images (Trivy gate + Debian base refreshes).
FROM gcr.io/distroless/nodejs24-debian13@sha256:ef5f3caf80da1630edd1a4df7b307a8f7d4553f8eec1dd29852b76e793593903 AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Prefer bundled files on disk; avoids surprise network fetches when a spec is missing.
ENV CLAWQL_BUNDLED_OFFLINE=1
# Writable mount for memory_* tools; override at runtime if your orchestrator mounts elsewhere.
ENV CLAWQL_OBSIDIAN_VAULT_PATH=/vault
# Optional at runtime (not baked in): CLAWQL_SANDBOX_BRIDGE_URL, CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN for sandbox_exec.

COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules
# Workspace deps are symlinked from `node_modules` → `packages/*`; copy all built package trees for distroless.
COPY --from=builder --chown=nonroot:nonroot /app/packages ./packages
COPY --from=builder --chown=nonroot:nonroot /app/dist ./dist
COPY --from=builder --chown=nonroot:nonroot /app/bin ./bin
COPY --from=builder --chown=nonroot:nonroot /app/providers ./providers
COPY --from=builder --chown=nonroot:nonroot /app/package.json ./package.json
COPY --from=builder --chown=nonroot:nonroot /vault /vault

USER nonroot:nonroot

# Default container mode: remote MCP over Streamable HTTP (/mcp).
# Use `dist/server.js` if you specifically need stdio transport.
CMD ["dist/server-http.js"]

# --- Local dev: same app + static Docker CLI (mount host /var/run/docker.sock; CLAWQL_SANDBOX_BACKEND=docker).
# Build: docker build -f docker/Dockerfile --target runtime-with-docker-cli -t clawql-mcp:local .
FROM node:25-bookworm-slim AS runtime-with-docker-cli
ARG DOCKER_STATIC_VERSION=27.4.1
WORKDIR /app
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && ARCH="$(dpkg --print-architecture)" \
  && case "$ARCH" in amd64) DARCH=x86_64 ;; arm64) DARCH=aarch64 ;; *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; esac \
  && curl -fsSL "https://download.docker.com/linux/static/stable/${DARCH}/docker-${DOCKER_STATIC_VERSION}.tgz" \
    | tar xz --strip-components=1 -C /usr/local/bin docker/docker \
  && chmod +x /usr/local/bin/docker
ENV NODE_ENV=production
ENV CLAWQL_BUNDLED_OFFLINE=1
ENV CLAWQL_OBSIDIAN_VAULT_PATH=/vault
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/providers ./providers
COPY --from=builder /app/package.json ./package.json
RUN mkdir -p /vault && chmod 1777 /vault
USER root
CMD ["dist/server-http.js"]
