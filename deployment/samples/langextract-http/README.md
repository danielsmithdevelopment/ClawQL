# LangExtract HTTP sidecar (reference)

**Tracking:** [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)

Schema-guided, **character-grounded** extraction via [google/langextract](https://github.com/google/langextract). ClawQL calls this service through MCP **`extract_document`** (`CLAWQL_ENABLE_LANGEXTRACT=1`) — large HTML/JSONL artifacts return **path references only**, not inline MCP payloads.

## Modes

| Mode | Env | Behavior |
| ---- | --- | -------- |
| **demo** (default) | `LANGEXTRACT_MODE=demo` | Regex grounding for W-2 demo fields — **no cloud LLM** |
| **live** | `LANGEXTRACT_MODE=live` + backend credentials | Calls upstream `langextract` (operator-installed; see below) |

## Live backends (no direct Gemini dependency)

| Backend | Env | Credentials |
| ------- | --- | ----------- |
| **openrouter** (default) | `LANGEXTRACT_BACKEND=openrouter` | `OPENROUTER_API_KEY` — model id e.g. `deepseek/deepseek-chat` |
| **ollama** | `LANGEXTRACT_BACKEND=ollama` | `OLLAMA_BASE_URL` (default `http://localhost:11434`) — model id e.g. `gemma2:2b` |
| **openai_compatible** | `LANGEXTRACT_BACKEND=openai_compatible` | `OPENAI_API_KEY` + `OPENAI_API_BASE_URL` |

ClawQL operators typically use **OpenRouter** (same key as OpenClaw) or **local Ollama** — not a standalone Gemini API key.

## API

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| `GET` | `/health` | — | `{ "ok": true, "mode": "demo", "backend": "openrouter" }` |
| `POST` | `/extract` | `{ "text", "prompt_description"?, "examples"?, "model_id"?, "backend"?, "write_html"?, "doc_id"? }` | `{ "ok", "extractions"[], "artifact_paths"? }` |

Each extraction includes `char_interval: { start, end }` when grounded. Extractions with `char_interval: null` should be dropped before promote (per upstream guidance).

## Run locally

```bash
python deployment/samples/langextract-http/server.py
curl -s http://localhost:8090/health
curl -s -X POST http://localhost:8090/extract \
  -H 'content-type: application/json' \
  -d @- <<'JSON'
{
  "text": "Box 1  Wages: 85000.00\nEmployee:\n  Name: JANE Q PUBLIC",
  "write_html": true,
  "doc_id": "w2-demo"
}
JSON
```

### Live OpenRouter example

```bash
pip install \
  'langextract[openai]>=1.0.0' \
  'langextract-provider-openrouter>=0.1.3' \
  'aiohttp>=3.14.1' \
  'idna>=3.15'

export LANGEXTRACT_MODE=live
export LANGEXTRACT_BACKEND=openrouter
export OPENROUTER_API_KEY=sk-or-...
export LANGEXTRACT_MODEL_ID=deepseek/deepseek-chat
python deployment/samples/langextract-http/server.py
```

### Live Ollama example

```bash
pip install 'langextract[openai]>=1.0.0' 'aiohttp>=3.14.1' 'idna>=3.15'

export LANGEXTRACT_MODE=live
export LANGEXTRACT_BACKEND=ollama
export LANGEXTRACT_MODEL_ID=gemma2:2b
export OLLAMA_BASE_URL=http://localhost:11434
python deployment/samples/langextract-http/server.py
```

## Wire to ClawQL MCP

```bash
CLAWQL_ENABLE_LANGEXTRACT=1
LANGEXTRACT_BASE_URL=http://localhost:8090
```

```json
{
  "tool": "extract_document",
  "arguments": {
    "text": "<docling markdown or tika text>",
    "schema_preset": "w2",
    "write_html": true,
    "doc_id": "w2-demo-001"
  }
}
```

## Boundary: parse vs extract

| Stage | Tool / service | Output |
| ----- | -------------- | ------ |
| Layout parse | **Docling** (`DOCLING_BASE_URL`) or **Tika** | Markdown / plain text |
| Classification | **`classify_document`** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)) | Label + confidence |
| Structured extract | **`extract_document`** + LangExtract | Grounded fields + optional HTML viz |

## Security

See [`docs/security/langextract-threat-model.md`](../../docs/security/langextract-threat-model.md). **Default-off** in ClawQL; demo mode sends no text to cloud LLMs.

## Docker

```bash
docker build -t clawql-langextract-reference deployment/samples/langextract-http
docker run --rm -p 8090:8090 clawql-langextract-reference
```

Default image is **demo mode** (stdlib only). For **live** mode, extend the image with the pinned `pip install` lines above (see `Dockerfile` comments). We do not commit a `requirements.txt` — CI **OSV-Scanner** scans all repo manifests; optional sample pip deps are documented here instead.

## Compose

[`docker/compose/docling-classifier.compose.yml`](../../docker/compose/docling-classifier.compose.yml) includes this service on port **8090** (demo mode by default).
