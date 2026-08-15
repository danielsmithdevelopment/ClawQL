# Harvey LAB IDP → DuckDB matter fill

Status: **generalized Matter registry** (2026-08-15). Declares field
classes + preferred doc roles → multi-doc Tika/LangExtract fill → DuckDB SQL.

Related: [`harvey-lab-duckdb-retrieval.md`](harvey-lab-duckdb-retrieval.md),
[`../providers/idp-pipeline.md`](../providers/idp-pipeline.md),
[`../providers/langextract-onboarding.md`](../providers/langextract-onboarding.md).

## Tool roles

| Stage | Tool | Why |
| ----- | ---- | --- |
| Catalogue / path flags | DMS paths + Fix 7 `detect_credit_facility` | Cheap `is_credit_facility`, secured filenames, revolving-note paths |
| Doc ranking | `clawql_lab_matter_schema.catalog_matter_docs` | Execution CAs, memos, term sheets, pro-formas — **not** SAFE for MFN |
| Bytes → text | **Apache Tika** `:9998` (jar on runner, not Docker) | Universal `.docx` parse |
| Schema-guided field fill | **LangExtract** `:8090` `schema_preset=firm_knowledge_matter` | Grounded spans → Matter columns + proof docs |
| Query | **DuckDB** | Typed columns / views + ordinary SQL |

Demo LangExtract uses deterministic grounded patterns with the **same
`extraction_class` names** live mode would fill. Swap `LANGEXTRACT_MODE=live`
+ `OPENROUTER_API_KEY` without changing SQL.

## Generalized Matter shape

Registry: `integrations/harvey-labs/harness/adapters/clawql_lab_matter_schema.py`.

```text
Matter {
  matter_id, is_credit_facility, is_secured, deal_date,
  has_incremental_facility, facility_amount_usd,
  has_revolving_facility,           # execution CA + path only (024)
  mentions_springing_lien,          # 012 / 018
  has_adjusted_ebitda_addbacks,     # 011 (+ proof_doc)
  is_covenant_lite,                 # 014 (+ proof_doc; TLB + "covenant-lite")
  has_mfn_in_credit_agreement,      # 013 / 015 (+ proof_doc; never SAFE)
}
```

Extend by adding a `MatterFieldSpec` (name, kind, doc_roles, stores_proof_doc)
and a demo/live extractor for that `extraction_class` — then SQL just works.

## SQL gold (local DMS, 12 credit facilities)

| Task | Query idea | Result |
| ---- | ---------- | ------ |
| **011** | `has_adjusted_ebitda_addbacks` | gold-9 exact |
| **012** | any `mentions_springing_lien` | **0** |
| **013** | Lumos `1008-00001` ∧ MFN on execution CA | true (semantic accordion; not SAFE) |
| **014** | `is_covenant_lite` | **{1005, 1021}** |
| **015** | MFN ∧ `ORDER BY deal_date DESC` | **1019-00002** |
| **018** | springing among credit | **k=0 n=12** |
| **020** | incremental `ORDER BY facility_amount_usd` | **1005-00001** |
| **023** | secured `ORDER BY deal_date` | **1013-00001** |
| **024** | credit ∧ revolver | gold-4 exact |

## How to re-run locally

```bash
java -Xmx512m -jar tika-server-standard-2.9.2.jar --host 127.0.0.1 --port 9998

LANGEXTRACT_MODE=demo PORT=8090 \
  python3 deployment/samples/langextract-http/server.py

python3 integrations/harvey-labs/scripts/idp_matter_pipeline.py \
  --dms /path/to/firm-knowledge/dms/matters
# expects ALL_GOLD True (exit 0)
```

## What this does _not_ claim

- Agent/judge success on 011–015 in GHA (needs OR quota + Sonnet).
- Live LangExtract LLM quality (demo grounding in CI today).
- Criterion-ceiling tasks (016/017/019/021) become SQL-solvable without new fields.
- Tika Docker packaging (GHA still uses the 2.9.2 jar on the runner JDK).
