# syntax=docker/dockerfile:1
# ClawQL dashboard — Next.js UI (Provider secrets, Agent Chat, custom sources).
#
# Build from repo root (needs clawql-api workspace package):
#   docker build -f dashboard/Dockerfile -t clawql-dashboard .

FROM node:22-alpine AS clawql-builder
WORKDIR /app
RUN apk upgrade --no-cache
COPY package.json package-lock.json ./
COPY packages/clawql-core/package.json packages/clawql-core/
COPY packages/clawql-auth/package.json packages/clawql-auth/
COPY packages/clawql-api/package.json packages/clawql-api/
RUN npm ci --ignore-scripts -w clawql-core -w clawql-auth -w clawql-api
COPY tsconfig.json ./
COPY packages/clawql-core packages/clawql-core
COPY packages/clawql-auth packages/clawql-auth
COPY packages/clawql-api packages/clawql-api
RUN npm run build -w clawql-core -w clawql-auth -w clawql-api
# Nested package node_modules are incomplete under workspaces; strip them.
# Keep /app/node_modules — Next webpack resolves clawql-api imports from
# packages/clawql-api/dist and walks up to /app/node_modules (not dashboard/).
RUN find packages -type d -name node_modules -prune -exec rm -rf {} +

FROM node:22-alpine AS deps
WORKDIR /app/dashboard
RUN apk upgrade --no-cache
COPY dashboard/package.json dashboard/package-lock.json ./
COPY --from=clawql-builder /app/packages /app/packages
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app/dashboard
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/dashboard/node_modules ./node_modules
COPY --from=deps /app/packages /app/packages
# Workspace install tree for clawql-api transitive deps (effect, smithy, …).
COPY --from=clawql-builder /app/node_modules /app/node_modules
COPY dashboard/ .
# prebuild generators resolve repoRoot as `/app` (`dashboard/scripts` → `../..`).
COPY .env.example /app/.env.example
COPY scripts/kubernetes/provider-vault-key-catalog.ts /app/scripts/kubernetes/provider-vault-key-catalog.ts
COPY src/provider-vault/catalog.ts /app/src/provider-vault/catalog.ts
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk upgrade --no-cache
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3040
COPY --from=builder /app/dashboard/package*.json ./
COPY --from=builder /app/dashboard/node_modules ./node_modules
COPY --from=builder /app/dashboard/.next ./.next
COPY --from=builder /app/dashboard/next.config.mjs ./next.config.mjs
# file: clawql-api → ../packages; runtime also needs workspace node_modules for externals.
COPY --from=builder /app/packages /packages
COPY --from=builder /app/node_modules /node_modules
EXPOSE 3040
CMD ["npm", "run", "start"]
