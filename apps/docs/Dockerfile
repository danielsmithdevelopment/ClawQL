# Build from repo root so `file:../../packages/clawql-analytics` resolves and dist exists:
#   docker build -f apps/docs/Dockerfile -t clawql-website .
#
# App-only context cannot see monorepo packages (docs API imports clawql-analytics).
# Deps/builder use /src/apps/docs so file:../../packages/clawql-analytics matches the git tree.

FROM node:25-alpine AS analytics-builder
WORKDIR /repo
RUN apk upgrade --no-cache
COPY package.json package-lock.json ./
COPY packages ./packages
COPY infra/pulumi/package.json ./infra/pulumi/package.json
RUN npm ci
# Analytics DTS needs auth + audit types; audit needs merkle.
RUN npm run build -w clawql-merkle \
  && npm run build -w clawql-audit \
  && npm run build -w clawql-auth \
  && npm run build -w clawql-analytics

FROM node:25-alpine AS deps
# Keep the same two-level layout as the git tree so `file:../../packages/clawql-analytics`
# stays under a project root. npm ci on Node 25 walks that relative path and otherwise
# looks for a lockfile at `/` (WORKDIR /app → ../..).
WORKDIR /src/apps/docs
RUN apk upgrade --no-cache
COPY apps/docs/package.json apps/docs/package-lock.json ./
COPY --from=analytics-builder /repo/packages/clawql-analytics /src/packages/clawql-analytics
RUN npm ci \
  && mkdir -p /src/packages/clawql-analytics/node_modules \
  && ln -sfn /src/apps/docs/node_modules/effect /src/packages/clawql-analytics/node_modules/effect \
  && ln -sfn /src/apps/docs/node_modules/posthog-node /src/packages/clawql-analytics/node_modules/posthog-node

FROM node:25-alpine AS builder
WORKDIR /src/apps/docs
ENV NEXT_TELEMETRY_DISABLED=1
ARG CLAWQL_PACKAGE_VERSION=0.0.0
ARG CLAWQL_PACKAGE_DESCRIPTION="ClawQL MCP server"
ENV CLAWQL_PACKAGE_VERSION=${CLAWQL_PACKAGE_VERSION}
ENV CLAWQL_PACKAGE_DESCRIPTION=${CLAWQL_PACKAGE_DESCRIPTION}
COPY --from=deps /src/apps/docs/node_modules ./node_modules
COPY --from=analytics-builder /repo/packages/clawql-analytics /src/packages/clawql-analytics
RUN mkdir -p /src/packages/clawql-analytics/node_modules \
  && ln -sfn /src/apps/docs/node_modules/effect /src/packages/clawql-analytics/node_modules/effect \
  && ln -sfn /src/apps/docs/node_modules/posthog-node /src/packages/clawql-analytics/node_modules/posthog-node
COPY apps/docs/ .
RUN npm run build

FROM node:25-alpine AS runner
WORKDIR /app
RUN apk upgrade --no-cache \
  && npm install -g npm@11 \
  && npm cache clean --force
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ARG CLAWQL_PACKAGE_VERSION=0.0.0
ARG CLAWQL_PACKAGE_DESCRIPTION="ClawQL MCP server"
ENV CLAWQL_PACKAGE_VERSION=${CLAWQL_PACKAGE_VERSION}
ENV CLAWQL_PACKAGE_DESCRIPTION=${CLAWQL_PACKAGE_DESCRIPTION}

# `output: 'standalone'` — traced production deps only (not full npm ci tree).
COPY --from=builder /src/apps/docs/public ./public
COPY --from=builder /src/apps/docs/.next/standalone ./
COPY --from=builder /src/apps/docs/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
