# LangExtract extraction (optional)

[LangExtract](https://github.com/google/langextract) provides **schema-guided**, **character-grounded** structured extraction from unstructured text — with optional interactive HTML visualization for human review.

ClawQL exposes this as MCP **`extract_document`** when **`CLAWQL_ENABLE_LANGEXTRACT=1`** ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)). ClawQL does **not** re-implement LangExtract in TypeScript; operators run the reference HTTP sidecar or their own deployment.

## Default off

No behavior change unless:

```bash
CLAWQL_ENABLE_LANGEXTRACT=1
LANGEXTRACT_BASE_URL=http://localhost:8090   # optional — local heuristic when unset
```

## Happy path

```text
Docling/Tika text → classify_document (optional) → extract_document → grounded JSON + HTML path
```

1. Parse with **Docling** or **Tika** (`execute` or `run_idp_pipeline`).
2. Optionally **`classify_document`** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)).
3. Call **`extract_document`** with `text` and `schema_preset: "w2"` (or custom `examples`).

```json
{
  "tool": "extract_document",
  "arguments": {
    "text": "# Form W-2 …",
    "schema_preset": "w2",
    "write_html": true,
    "doc_id": "w2-demo-001"
  }
}
```

Response includes `extractions[]` with `char_interval` and optional `artifact_paths` (not inline HTML).

## Reference deployment

```bash
docker compose -f docker/compose/docling-classifier.compose.yml up -d
curl -s http://localhost:8090/health
```

See [`deployment/samples/langextract-http/README.md`](../../deployment/samples/langextract-http/README.md).

## Environment

| Variable | Purpose |
| -------- | ------- |
| `CLAWQL_ENABLE_LANGEXTRACT` | Register MCP tool (default off) |
| `LANGEXTRACT_BASE_URL` | Sidecar HTTP base (e.g. `http://localhost:8090`) |
| `LANGEXTRACT_BACKEND` | Live sidecar backend: `openrouter` (default), `ollama`, or `openai_compatible` |
| `LANGEXTRACT_MODEL_ID` | Model for live mode — OpenRouter: `deepseek/deepseek-chat`; Ollama: `gemma2:2b` |
| `OPENROUTER_API_KEY` | Live **openrouter** backend (ClawQL standard — same as OpenClaw) |
| `OLLAMA_BASE_URL` | Live **ollama** backend (default `http://localhost:11434`) |
| `OPENAI_API_KEY` + `OPENAI_API_BASE_URL` | Live **openai_compatible** backend only |

ClawQL does **not** require a direct **Gemini** API key for LangExtract. Use OpenRouter or local Ollama.

## Security

Read [`docs/security/langextract-threat-model.md`](../security/langextract-threat-model.md) before enabling live LLM extraction in production.

## Related

- [IDP pipeline hub](idp-pipeline.md)
- [Docling onboarding](docling-onboarding.md)
- [Fine-tuned classifier runbook](../runbooks/fine-tuned-classifier.md)
- [Using OpenClaw with ClawQL](../openclaw/using-openclaw-with-clawql.md) — OpenRouter key setup
