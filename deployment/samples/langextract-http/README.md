# LangExtract HTTP sidecar (reference)

**Tracking:** [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)

Schema-guided, **character-grounded** extraction via [google/langextract](https://github.com/google/langextract). ClawQL calls this service through MCP **`extract_document`** (`CLAWQL_ENABLE_LANGEXTRACT=1`) — large HTML/JSONL artifacts return **path references only**, not inline MCP payloads.

## Modes

| Mode | Env | Behavior |
| ---- | --- | -------- |
| **demo** (default) | `LANGEXTRACT_MODE=demo` | Regex grounding for W-2 demo fields — **no cloud LLM** |
| **live** | `LANGEXTRACT_MODE=live` + `GEMINI_API_KEY` | Calls upstream `langextract` (install `requirements.txt` in image) |

## API

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| `GET` | `/health` | — | `{ "ok": true, "mode": "demo" }` |
| `POST` | `/extract` | `{ "text", "prompt_description"?, "examples"?, "model_id"?, "write_html"?, "doc_id"? }` | `{ "ok", "extractions"[], "artifact_paths"? }` |

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

## Compose

[`docker/compose/docling-classifier.compose.yml`](../../docker/compose/docling-classifier.compose.yml) includes this service on port **8090**.
