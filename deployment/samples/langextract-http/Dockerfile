FROM python:3.12-slim
WORKDIR /app
COPY server.py .
# Optional: uncomment for LANGEXTRACT_MODE=live (pulls langextract + LLM client deps)
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt
ENV PORT=8090
ENV LANGEXTRACT_MODE=demo
ENV LANGEXTRACT_ARTIFACTS_DIR=/tmp/langextract-artifacts
EXPOSE 8090
CMD ["python", "server.py"]
