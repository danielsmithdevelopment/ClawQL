FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
ENV PORT=8080
ENV MODEL_VERSION=reference-heuristic-v1
EXPOSE 8080
CMD ["node", "server.mjs"]
