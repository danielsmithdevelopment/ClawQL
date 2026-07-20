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
# Workspace npm ci may leave incomplete nested node_modules under packages/*.
# Strip them so the dashboard lockfile install resolves clawql-api deps cleanly
# (otherwise Next webpack follows ../packages/clawql-api/node_modules and fails).
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
# Use packages after dashboard `npm ci` (symlink + deps), not a second raw copy.
COPY --from=deps /app/packages /app/packages
COPY dashboard/ .
# prebuild generators resolve repoRoot as `/app` (`dashboard/scripts` → `../..`).
# Keep these under `/app/...` (not `/`) so env + provider catalogs generate in-image.
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
# file: clawql-api resolves to ../packages — keep built workspace packages for runtime.
COPY --from=builder /app/packages /packages
EXPOSE 3040
CMD ["npm", "run", "start"]
