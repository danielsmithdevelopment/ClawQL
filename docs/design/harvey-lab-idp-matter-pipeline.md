# Harvey LAB IDP → DuckDB matter fill (spike)

Status: **local spike validated** (2026-08-15). Proves the “declare a
Matter shape → fill fields → SQL” path using each document tool for what it
is best at.

Related: [`harvey-lab-duckdb-retrieval.md`](harvey-lab-duckdb-retrieval.md),
[`../providers/idp-pipeline.md`](../providers/idp-pipeline.md),
[`../providers/langextract-onboarding.md`](../providers/langextract-onboarding.md).

## Tool roles (this run)

| Stage | Tool | Used? | Why |
| ----- | ---- | ----- | --- |
| Catalogue / path flags | DMS paths + Fix 7 `detect_credit_facility` | **Yes** | Cheap `is_credit_facility`, secured-doc filenames, revolving-note paths |
| Bytes → text | **Apache Tika** `:9998` | **Yes** | Universal parse of execution `.docx` |
| Layout / OCR parse | **Docling** | No | Born-digital docx — Tika sufficient; Docling when scans/complex PDF |
| Office → PDF | **Gotenberg** | No | Not needed when source is already docx |
| OCR / redact | **Stirling** | No | Clean text docs; no PII redact in this spike |
| Schema-guided field fill | **LangExtract** `:8090` `schema_preset=credit_facility_matter` | **Yes** | Grounded `deal_date`, `$`, incremental / revolver / springing-lien / secured |
| Query | **DuckDB** | **Yes** | Typed columns + ordinary SQL |

Demo LangExtract mode uses deterministic grounded patterns with the **same
extraction_class names** live mode would fill from examples. Swap
`LANGEXTRACT_MODE=live` + `OPENROUTER_API_KEY` for LLM fill without changing
the Matter schema or SQL.

## Matter shape (extract → columns)

```text
Matter {
  matter_id: string                 # DMS folder
  is_credit_facility: bool          # path detector
  is_secured: bool                  # path OR extract
  deal_date: date?                  # LangExtract
  has_incremental_facility: bool    # LangExtract
  facility_amount_usd: number?      # LangExtract
  has_revolving_facility: bool      # path OR LangExtract (not mezz-only)
  mentions_springing_lien: bool     # LangExtract
}
```

## SQL possibility checks (real DMS, 12 credit facilities)

| Task | Query | Result |
| ---- | ----- | ------ |
| **018** | `k,n` springing lien among credit facilities | **k=0 n=12**, cohort = gold-12 |
| **020** | `ORDER BY facility_amount_usd DESC` where incremental | **1005-00001** ($1.4B) |
| **023** | `is_secured ORDER BY deal_date DESC` | **1013-00001** (2026-03-06) |
| **024** | `is_credit_facility AND has_revolving_facility` | gold-4 exact |

## How to re-run locally

```bash
# Tika
java -Xmx512m -jar tika-server-standard-2.9.2.jar --host 127.0.0.1 --port 9998

# LangExtract demo (Matter preset)
LANGEXTRACT_MODE=demo PORT=8090 \
  python3 deployment/samples/langextract-http/server.py

# Pipeline
python3 integrations/harvey-labs/scripts/idp_matter_pipeline.py \
  --dms /path/to/firm-knowledge/dms/matters
```

Script: [`../../integrations/harvey-labs/scripts/idp_matter_pipeline.py`](../../integrations/harvey-labs/scripts/idp_matter_pipeline.py).

## What this does *not* claim

- Agent success on 020/023/024 in GHA (benchmark still to prove).
- Live LangExtract LLM quality (demo grounding only in this spike).
- That every batch-3 failure is SQL-shaped (016/017/019/021 remain criterion ceilings).
