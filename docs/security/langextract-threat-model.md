# LangExtract threat model (IDP extraction)

**Tracking:** [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)

LangExtract is an **optional**, **default-off** extraction layer. When disabled (`CLAWQL_ENABLE_LANGEXTRACT` unset), ClawQL behavior is unchanged.

## Data flow

```text
Docling / Tika (local parse) → text/markdown → extract_document → LangExtract sidecar → LLM provider (live mode only)
```

| Mode                               | Text leaves cluster?                                                  | LLM call?     |
| ---------------------------------- | --------------------------------------------------------------------- | ------------- |
| **demo** (`LANGEXTRACT_MODE=demo`) | No (regex only)                                                       | No            |
| **live + openrouter**              | Yes — to [OpenRouter](https://openrouter.ai/) (operator-chosen model) | Yes           |
| **live + ollama**                  | No (local inference)                                                  | Yes (on-prem) |
| **live + openai_compatible**       | Yes — to configured `OPENAI_API_BASE_URL`                             | Yes           |

Operators who require **local-only** processing should use **demo mode** or **`LANGEXTRACT_BACKEND=ollama`**. ClawQL does **not** require or default to a direct **Gemini** API key.

## Risks

| Risk                                | Mitigation                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LLM hallucination**               | Schema + few-shot examples; drop extractions with `char_interval: null`; HITL review on low-confidence classify path ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)) |
| **PII in prompts**                  | Run Stirling redaction **before** extract when source docs contain sensitive fields; vault/object-store artifacts with RBAC                                                                |
| **Surprise cloud egress**           | `CLAWQL_ENABLE_LANGEXTRACT=1` required; live mode requires explicit `OPENROUTER_API_KEY` (or local Ollama); demo mode default in reference image                                           |
| **Large artifact exfil via MCP**    | MCP returns **path references** (`artifact_paths.html_path`) — not multi-MiB HTML inline                                                                                                   |
| **Prompt injection in source text** | Treat parsed document text as untrusted input; human review for high-impact fields                                                                                                         |

## Versioning

Pin the reference sidecar image digest or rebuild from `deployment/samples/langextract-http/Dockerfile`. Upstream Python packages: `langextract`, optional `langextract-provider-openrouter` (see `requirements.txt`).

## Reviewer workflow

1. **`extract_document`** with `write_html: true` → open `artifact_paths.html_path` in browser (interactive viz in live mode; static list in demo).
2. Verify each field’s `char_interval` against source text.
3. Low-confidence classification → Label Studio HITL ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).

## Related

- [fine-tuned-classifier.md](../runbooks/fine-tuned-classifier.md) — classify before extract
- [langextract-http README](../../deployment/samples/langextract-http/README.md)
