# syntax=docker/dockerfile:1
# ClawQL dashboard — Next.js UI (Provider secrets, Agent Chat, custom sources).
#
# Build from repo root (needs clawql-api / clawql-auth / clawql-payments workspace packages):
#   docker build -f apps/dashboard/Dockerfile -t clawql-dashboard .
#
# Webpack resolves clawql-api from packages/clawql-api/dist and walks Node resolution
# upward. Some deps (@smithy/protocol-http) are nested under packages/clawql-api;
# others (@smithy/core, effect) hoist to /app/node_modules. Both trees are required.

FROM node:22-alpine AS clawql-builder
WORKDIR /app
RUN apk upgrade --no-cache
COPY package.json package-lock.json ./
COPY packages/clawql-merkle/package.json packages/clawql-merkle/
COPY packages/clawql-gdp/package.json packages/clawql-gdp/
COPY packages/clawql-audit/package.json packages/clawql-audit/
COPY packages/clawql-agents/package.json packages/clawql-agents/
COPY packages/clawql-core/package.json packages/clawql-core/
COPY packages/clawql-auth/package.json packages/clawql-auth/
COPY packages/clawql-api/package.json packages/clawql-api/
COPY packages/clawql-network/package.json packages/clawql-network/
COPY packages/clawql-supabase/package.json packages/clawql-supabase/
COPY packages/clawql-memory/package.json packages/clawql-memory/
COPY packages/clawql-payments/package.json packages/clawql-payments/
# clawql-payments DTS imports supabase + memory; those need api/auth/agents/network
RUN npm ci --ignore-scripts -w clawql-merkle -w clawql-gdp -w clawql-core -w clawql-audit -w clawql-auth -w clawql-api -w clawql-agents -w clawql-network -w clawql-supabase -w clawql-memory -w clawql-payments
COPY tsconfig.json ./
COPY packages/clawql-merkle packages/clawql-merkle
COPY packages/clawql-gdp packages/clawql-gdp
COPY packages/clawql-core packages/clawql-core
COPY packages/clawql-audit packages/clawql-audit
COPY packages/clawql-auth packages/clawql-auth
COPY packages/clawql-api packages/clawql-api
COPY packages/clawql-agents packages/clawql-agents
COPY packages/clawql-network packages/clawql-network
COPY packages/clawql-supabase packages/clawql-supabase
COPY packages/clawql-memory packages/clawql-memory
COPY packages/clawql-payments packages/clawql-payments
RUN npm run build -w clawql-merkle -w clawql-gdp -w clawql-core -w clawql-audit -w clawql-auth -w clawql-api -w clawql-agents -w clawql-network -w clawql-supabase -w clawql-memory -w clawql-payments

FROM node:22-alpine AS deps
WORKDIR /app/dashboard
RUN apk upgrade --no-cache
COPY apps/dashboard/package.json apps/dashboard/package-lock.json ./
# package.json only — avoid overlaying workspace node_modules before dashboard npm ci
COPY --from=clawql-builder /app/packages/clawql-merkle/package.json /app/packages/clawql-merkle/package.json
COPY --from=clawql-builder /app/packages/clawql-merkle/dist /app/packages/clawql-merkle/dist
COPY --from=clawql-builder /app/packages/clawql-gdp/package.json /app/packages/clawql-gdp/package.json
COPY --from=clawql-builder /app/packages/clawql-gdp/dist /app/packages/clawql-gdp/dist
COPY --from=clawql-builder /app/packages/clawql-core/package.json /app/packages/clawql-core/package.json
COPY --from=clawql-builder /app/packages/clawql-core/dist /app/packages/clawql-core/dist
COPY --from=clawql-builder /app/packages/clawql-audit/package.json /app/packages/clawql-audit/package.json
COPY --from=clawql-builder /app/packages/clawql-audit/dist /app/packages/clawql-audit/dist
COPY --from=clawql-builder /app/packages/clawql-auth/package.json /app/packages/clawql-auth/package.json
COPY --from=clawql-builder /app/packages/clawql-auth/dist /app/packages/clawql-auth/dist
COPY --from=clawql-builder /app/packages/clawql-api/package.json /app/packages/clawql-api/package.json
COPY --from=clawql-builder /app/packages/clawql-api/dist /app/packages/clawql-api/dist
COPY --from=clawql-builder /app/packages/clawql-agents/package.json /app/packages/clawql-agents/package.json
COPY --from=clawql-builder /app/packages/clawql-agents/dist /app/packages/clawql-agents/dist
COPY --from=clawql-builder /app/packages/clawql-network/package.json /app/packages/clawql-network/package.json
COPY --from=clawql-builder /app/packages/clawql-network/dist /app/packages/clawql-network/dist
COPY --from=clawql-builder /app/packages/clawql-supabase/package.json /app/packages/clawql-supabase/package.json
COPY --from=clawql-builder /app/packages/clawql-supabase/dist /app/packages/clawql-supabase/dist
COPY --from=clawql-builder /app/packages/clawql-memory/package.json /app/packages/clawql-memory/package.json
COPY --from=clawql-builder /app/packages/clawql-memory/dist /app/packages/clawql-memory/dist
COPY --from=clawql-builder /app/packages/clawql-payments/package.json /app/packages/clawql-payments/package.json
COPY --from=clawql-builder /app/packages/clawql-payments/dist /app/packages/clawql-payments/dist
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app/dashboard
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/dashboard/node_modules ./node_modules
# Full workspace package trees (nested node_modules) + hoisted /app/node_modules.
COPY --from=clawql-builder /app/packages /app/packages
COPY --from=clawql-builder /app/node_modules /app/node_modules
COPY apps/dashboard/ .
# Compile god-mode harness out of production images — never ship /api/e2e/*.
# Arrange/fault routes stay in the git tree for local Playwright (CLAWQL_E2E_HARNESS=1).
RUN rm -rf src/app/api/e2e \
  && test ! -d src/app/api/e2e \
  && echo "stripped /api/e2e from production build"
# prebuild generators walk up to `/app` (`.env.example` copied there).
COPY .env.example /app/.env.example
COPY package.json /app/package.json
COPY scripts/kubernetes/provider-vault-key-catalog.ts /app/scripts/kubernetes/provider-vault-key-catalog.ts
COPY src/provider-vault/catalog.ts /app/src/provider-vault/catalog.ts
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# Start Next via `node` so we can drop the global npm toolchain. Stock/global npm still
# ships undici<=6.28.0 and brace-expansion<=5.0.9 (Trivy HIGH CVE-2026-19534 /
# CVE-2026-102276/102278) even after `npm install -g npm@11` / npm@12.
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && rm -rf /usr/lib/node_modules/npm /usr/bin/npm /usr/bin/npx \
  && npm --version >/dev/null 2>&1 && exit 1 || true
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
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3040"]
