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
# Live weights deps are installed here (not as a scanned requirements*.txt) so
# default CI OSV stays on the mock floor pins only.
RUN pip install --no-cache-dir "gliner>=0.2.0" torch
ENV CLAWQL_GLINER_SIDECAR_MODE=gliner2
