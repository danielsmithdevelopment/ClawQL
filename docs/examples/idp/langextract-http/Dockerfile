FROM python:3.12-slim
WORKDIR /app
COPY server.py .
# Optional live image: install pinned deps (not committed as requirements.txt — OSV scans repo manifests).
# RUN pip install --no-cache-dir \
#   'langextract[openai]>=1.0.0' \
#   'langextract-provider-openrouter>=0.1.3' \
#   'aiohttp>=3.14.1' \
#   'idna>=3.15'
ENV PORT=8090
ENV LANGEXTRACT_MODE=demo
ENV LANGEXTRACT_ARTIFACTS_DIR=/tmp/langextract-artifacts
EXPOSE 8090
CMD ["python", "server.py"]
