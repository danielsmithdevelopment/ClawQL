FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

ENV CLAWQL_GLINER_SIDECAR_MODE=mock
ENV CLAWQL_GLINER_SIDECAR_HOST=0.0.0.0
ENV CLAWQL_GLINER_SIDECAR_PORT=8080

EXPOSE 8080
CMD ["python", "app.py"]
