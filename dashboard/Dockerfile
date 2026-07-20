# syntax=docker/dockerfile:1
# ClawQL dashboard — Next.js UI (Provider secrets, Agent Chat, custom sources).
#
# Build from repo root (needs clawql-api workspace package):
#   docker build -f dashboard/Dockerfile -t clawql-dashboard .
#
# Webpack resolves clawql-api from packages/clawql-api/dist and walks Node resolution
# upward. Some deps (@smithy/protocol-http) are nested under packages/clawql-api;
# others (@smithy/core, effect) hoist to /app/node_modules. Both trees are required.

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

FROM node:22-alpine AS deps
WORKDIR /app/dashboard
RUN apk upgrade --no-cache
COPY dashboard/package.json dashboard/package-lock.json ./
# package.json only — avoid overlaying workspace node_modules before dashboard npm ci
COPY --from=clawql-builder /app/packages/clawql-core/package.json /app/packages/clawql-core/package.json
COPY --from=clawql-builder /app/packages/clawql-core/dist /app/packages/clawql-core/dist
COPY --from=clawql-builder /app/packages/clawql-auth/package.json /app/packages/clawql-auth/package.json
COPY --from=clawql-builder /app/packages/clawql-auth/dist /app/packages/clawql-auth/dist
COPY --from=clawql-builder /app/packages/clawql-api/package.json /app/packages/clawql-api/package.json
COPY --from=clawql-builder /app/packages/clawql-api/dist /app/packages/clawql-api/dist
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app/dashboard
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/dashboard/node_modules ./node_modules
# Full workspace package trees (nested node_modules) + hoisted /app/node_modules.
COPY --from=clawql-builder /app/packages /app/packages
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
COPY --from=builder /app/packages /packages
COPY --from=builder /app/node_modules /node_modules
EXPOSE 3040
CMD ["npm", "run", "start"]
