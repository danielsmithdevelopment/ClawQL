# Build from repo root so `file:../packages/clawql-analytics` resolves and dist exists:
#   docker build -f website/Dockerfile -t clawql-website .
#
# Website-only context cannot see monorepo packages (docs API imports clawql-analytics).

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
WORKDIR /app
RUN apk upgrade --no-cache
COPY website/package*.json ./
# From /app, file:../packages/clawql-analytics → /packages/clawql-analytics
COPY --from=analytics-builder /repo/packages/clawql-analytics /packages/clawql-analytics
RUN npm ci

FROM node:25-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG CLAWQL_PACKAGE_VERSION=0.0.0
ARG CLAWQL_PACKAGE_DESCRIPTION="ClawQL MCP server"
ENV CLAWQL_PACKAGE_VERSION=${CLAWQL_PACKAGE_VERSION}
ENV CLAWQL_PACKAGE_DESCRIPTION=${CLAWQL_PACKAGE_DESCRIPTION}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=analytics-builder /repo/packages/clawql-analytics /packages/clawql-analytics
COPY website/ .
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
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
