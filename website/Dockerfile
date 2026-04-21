FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG CLAWQL_PACKAGE_VERSION=0.0.0
ARG CLAWQL_PACKAGE_DESCRIPTION="ClawQL MCP server"
ENV CLAWQL_PACKAGE_VERSION=${CLAWQL_PACKAGE_VERSION}
ENV CLAWQL_PACKAGE_DESCRIPTION=${CLAWQL_PACKAGE_DESCRIPTION}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ARG CLAWQL_PACKAGE_VERSION=0.0.0
ARG CLAWQL_PACKAGE_DESCRIPTION="ClawQL MCP server"
ENV CLAWQL_PACKAGE_VERSION=${CLAWQL_PACKAGE_VERSION}
ENV CLAWQL_PACKAGE_DESCRIPTION=${CLAWQL_PACKAGE_DESCRIPTION}
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/src/mdx ./src/mdx
COPY --from=builder /app/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
