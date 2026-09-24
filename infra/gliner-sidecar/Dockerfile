# Optional live-weights stage — large torch/gliner layers.
# Build: docker build --target gliner2 -t clawql-gliner-sidecar:gliner2 .
FROM python:3.12-slim AS base

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

ENV CLAWQL_GLINER_SIDECAR_MODE=mock
ENV CLAWQL_GLINER_SIDECAR_HOST=0.0.0.0
ENV CLAWQL_GLINER_SIDECAR_PORT=8080

EXPOSE 8080
CMD ["python", "app.py"]

FROM base AS gliner2
# Live Fastino GLiNER2.5 weights (large torch + gliner2). Not scanned as requirements*.txt.
RUN pip install --no-cache-dir "gliner2>=1.0.0" peft tiktoken protobuf torch
ENV CLAWQL_GLINER_SIDECAR_MODE=gliner2
