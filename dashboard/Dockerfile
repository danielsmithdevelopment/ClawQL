FROM node:22-alpine AS deps
WORKDIR /app
RUN apk upgrade --no-cache
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Monorepo catalog generators resolve repoRoot as `/` when build context is `./dashboard` only.
COPY .env.example /.env.example
COPY scripts/kubernetes/provider-vault-key-catalog.ts /scripts/kubernetes/provider-vault-key-catalog.ts
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk upgrade --no-cache
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3040
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./next.config.mjs
EXPOSE 3040
CMD ["npm", "run", "start"]
