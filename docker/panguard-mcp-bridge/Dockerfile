# syntax=docker/dockerfile:1
# Streamable HTTP MCP + optional gRPC (`ENABLE_GRPC=1`) → Panguard (stdio) → shim → remote **`clawql-mcp-http`**.
#
# Build (repo root):
#   docker build -f docker/panguard-mcp-bridge/Dockerfile -t ghcr.io/danielsmithdevelopment/clawql-panguard-mcp-bridge:local .
#
# Layering note: copy workspace **sources** before **`npm ci`** so hoist **`node_modules`** under **`packages/*`** never conflicts with **`COPY`**.

FROM node:25-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/clawql-core/package.json ./packages/clawql-core/package.json
COPY packages/clawql-api/package.json ./packages/clawql-api/package.json
COPY packages/clawql-memory/package.json ./packages/clawql-memory/package.json
COPY packages/clawql-documents/package.json ./packages/clawql-documents/package.json
COPY packages/clawql-automation/package.json ./packages/clawql-automation/package.json
COPY packages/clawql-sandbox/package.json ./packages/clawql-sandbox/package.json
COPY packages/clawql-ouroboros/package.json ./packages/clawql-ouroboros/package.json
COPY packages/mcp-grpc-transport ./packages/mcp-grpc-transport
COPY packages/panguard-mcp-bridge ./packages/panguard-mcp-bridge

RUN npm ci --ignore-scripts \
  && npm run build -w mcp-grpc-transport \
  && npm run build -w panguard-mcp-bridge \
  && npm prune --omit=dev

FROM node:25-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @panguard-ai/panguard-mcp-proxy@0.1.2 \
  && npm cache clean --force

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/mcp-grpc-transport ./packages/mcp-grpc-transport
COPY --from=builder /app/packages/panguard-mcp-bridge ./packages/panguard-mcp-bridge

ENV PATH="/usr/local/bin:${PATH}"
EXPOSE 8080 50051
USER node
CMD ["node", "/app/packages/panguard-mcp-bridge/dist/gateway-main.js"]
