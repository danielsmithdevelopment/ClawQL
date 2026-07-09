FROM node:25-alpine AS deps
WORKDIR /app
RUN apk upgrade --no-cache
COPY package*.json ./
RUN npm ci

FROM node:25-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG CLAWQL_PACKAGE_VERSION=0.0.0
ARG CLAWQL_PACKAGE_DESCRIPTION="ClawQL MCP server"
ENV CLAWQL_PACKAGE_VERSION=${CLAWQL_PACKAGE_VERSION}
ENV CLAWQL_PACKAGE_DESCRIPTION=${CLAWQL_PACKAGE_DESCRIPTION}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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
