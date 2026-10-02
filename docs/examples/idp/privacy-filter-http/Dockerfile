FROM python:3.12-slim
WORKDIR /app
COPY server.py .
# Default DEMO image: no torch / transformers (keeps CI light).
# For LIVE local model weights, build with a custom Dockerfile that installs:
#   pip install 'transformers>=4.50' torch
# and set PRIVACY_FILTER_MODE=live (still no OpenAI API — HF Hub / local cache only).
ENV PORT=8091
ENV PRIVACY_FILTER_MODE=demo
ENV PRIVACY_FILTER_DEVICE=cpu
EXPOSE 8091
CMD ["python", "server.py"]
