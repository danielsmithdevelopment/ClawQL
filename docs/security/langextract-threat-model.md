# LangExtract threat model (IDP extraction)

**Tracking:** [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)

LangExtract is an **optional**, **default-off** extraction layer. When disabled (`CLAWQL_ENABLE_LANGEXTRACT` unset), ClawQL behavior is unchanged.

## Data flow

```text
Docling / Tika (local parse) → text/markdown → extract_document → LangExtract sidecar → LLM provider (live mode only)
```

| Mode                               | Text leaves cluster?                          | LLM call? |
| ---------------------------------- | --------------------------------------------- | --------- |
| **demo** (`LANGEXTRACT_MODE=demo`) | No (regex only)                               | No        |
| **live** (`LANGEXTRACT_MODE=live`) | Yes — to configured provider (Gemini default) | Yes       |

Operators who require **local-only** processing must use **demo mode** or wire LangExtract to **Ollama** / on-prem endpoints per [upstream provider docs](https://github.com/google/langextract) — ClawQL does not auto-select a cloud model when `LANGEXTRACT_MODE=demo`.

## Risks

| Risk                                | Mitigation                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LLM hallucination**               | Schema + few-shot examples; drop extractions with `char_interval: null`; HITL review on low-confidence classify path ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)) |
| **PII in prompts**                  | Run Stirling redaction **before** extract when source docs contain sensitive fields; vault/object-store artifacts with RBAC                                                                |
| **Surprise cloud egress**           | `CLAWQL_ENABLE_LANGEXTRACT=1` required; live mode requires explicit `GEMINI_API_KEY` / provider key; demo mode default in reference image                                                  |
| **Large artifact exfil via MCP**    | MCP returns **path references** (`artifact_paths.html_path`) — not multi-MiB HTML inline                                                                                                   |
| **Prompt injection in source text** | Treat parsed document text as untrusted input; human review for high-impact fields                                                                                                         |

## Versioning

Pin the reference sidecar image digest or rebuild from `deployment/samples/langextract-http/Dockerfile`. Upstream Python package: `langextract` in `requirements.txt` (live mode only).

## Reviewer workflow

1. **`extract_document`** with `write_html: true` → open `artifact_paths.html_path` in browser (interactive viz in live mode; static list in demo).
2. Verify each field’s `char_interval` against source text.
3. Low-confidence classification → Label Studio HITL ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).

## Related

- [fine-tuned-classifier.md](../runbooks/fine-tuned-classifier.md) — classify before extract
- [langextract-http README](../../deployment/samples/langextract-http/README.md)
