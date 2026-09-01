# Harvey LAB IDP → DuckDB matter fill

Status: **generalized Matter registry** (2026-08-15). Declares field
classes + preferred doc roles → multi-doc Tika/LangExtract fill → DuckDB SQL.

Related: [`harvey-lab-duckdb-retrieval.md`](harvey-lab-duckdb-retrieval.md),
[`../providers/idp-pipeline.md`](../providers/idp-pipeline.md),
[`../providers/langextract-onboarding.md`](../providers/langextract-onboarding.md).

## Tool roles

| Stage                    | Tool                                                                                           | Why                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Catalogue / path flags   | DMS paths + Fix 7 `detect_credit_facility` / `detect_hsr_filing` / `detect_hsr_second_request` | Cheap credit, secured, HSR filing, second-request signals            |
| Doc ranking              | `clawql_lab_matter_schema.catalog_matter_docs`                                                 | Execution CAs, memos, term sheets, pro-formas — **not** SAFE for MFN |
| Bytes → text             | **Apache Tika** `:9998` (jar on runner, not Docker)                                            | Universal `.docx` parse                                              |
| Schema-guided field fill | **LangExtract** `:8090` `schema_preset=firm_knowledge_matter`                                  | Grounded spans → Matter columns + proof docs                         |
| Query                    | **DuckDB**                                                                                     | Typed columns / views + ordinary SQL                                 |

Demo LangExtract uses deterministic grounded patterns with the **same
`extraction_class` names** live mode would fill. Swap `LANGEXTRACT_MODE=live`

- `OPENROUTER_API_KEY` without changing SQL.

## Generalized Matter shape

Registry: `integrations/harvey-labs/harness/adapters/clawql_lab_matter_schema.py`.

```text
Matter {
  matter_id, is_credit_facility, is_secured, deal_date,
  has_incremental_facility, facility_amount_usd,
  has_revolving_facility,           # execution CA + path only (024 / 025)
  mentions_springing_lien,          # 012 / 018
  has_adjusted_ebitda_addbacks,     # 011 (+ proof_doc)
  is_covenant_lite,                 # 014 / 010 (+ proof_doc; TLB + "covenant-lite")
  has_mfn_in_credit_agreement,      # 013 / 015 (+ proof_doc; never SAFE)
  has_springing_financial_covenant, # springing-gated FC (016 / 019)
  has_always_on_maintenance_covenant, # always-on only (016); cleared if springing-gated
  has_maintenance_financial_covenant, # always-on OR springing (019)
  borrower_control,                 # sponsor | corporate (017)
  has_hsr_filing (+ date + proof),  # path: HSR Filing / Preparation folder (006–008)
  is_hsr_second_request (+ date + proof),  # filename / defined-term (001–004)
  has_hsr_clearance (+ proof),      # post-clearance / clearance-status (003)
  is_antitrust_matter,              # antitrust/HSR/FTC/DOJ path signal
  deal_value_usd,                   # TEV / Purchase Price (005; not AUM)
}
```

Extend by adding a `MatterFieldSpec` (name, kind, doc_roles, stores_proof_doc)
and a demo/live extractor for that `extraction_class` — then SQL just works.

Post-merge rule: if `has_springing_financial_covenant`, clear
`has_always_on_maintenance_covenant`; set maintenance =
always-on ∨ springing-gated.

**009** uses live maintenance = maintenance ∧ ¬(covenant-lite ∧ ¬always-on).
**010** is the complement slice: covenant-lite ∧ ¬always-on.

## SQL gold (local DMS)

| Task        | Query idea                                          | Result                                             |
| ----------- | --------------------------------------------------- | -------------------------------------------------- |
| **001/002** | `is_hsr_second_request`                             | required {1003, 1038, 1041} ⊆ result ⊆ precision-6 |
| **003**     | SR ∧ `has_hsr_clearance`                            | required {1041} ⊆ result ⊆ {1041, 1003-00003}      |
| **004**     | SR `ORDER BY hsr_second_request_date DESC`          | **1038-00001**                                     |
| **005**     | antitrust ∧ `deal_value_usd ≥ 1e9` on POP005        | SR rate **4/7 (~57%)**                             |
| **006/007** | `has_hsr_filing`                                    | required {1001, 1003} ⊆ result ⊆ precision-5       |
| **008**     | HSR `ORDER BY hsr_filing_date DESC`                 | **1003-00001** (2024-06-18)                        |
| **009**     | live maintenance financings                         | required-9 ⊆ result ⊆ precision-11                 |
| **010**     | cov-lite ∧ ¬always-on                               | {1005, 1021} (⊆ precision-4)                       |
| **011**     | `has_adjusted_ebitda_addbacks`                      | gold-9 exact                                       |
| **012**     | any `mentions_springing_lien`                       | **0**                                              |
| **013**     | Lumos `1008-00001` ∧ MFN on execution CA            | true (semantic accordion; not SAFE)                |
| **014**     | `is_covenant_lite`                                  | **{1005, 1021}**                                   |
| **015**     | MFN ∧ `ORDER BY deal_date DESC`                     | **1019-00002**                                     |
| **016**     | YoY always-on shares on credit-12                   | 2021 1/1 … 2026 2/2                                |
| **017**     | sponsor vs corporate add-back rates on POP017       | **6/8** and **3/4**                                |
| **018**     | springing among credit                              | **k=0 n=12**                                       |
| **019**     | maintenance FC (incl. springing)                    | required-11 ⊆ result ⊆ precision-12                |
| **020**     | credit ∧ incremental `ORDER BY facility_amount_usd` | **1005-00001**                                     |
| **021/022** | credit ∧ `is_secured` (mortgage path OK for 1036)   | exact-12                                           |
| **023**     | secured `ORDER BY deal_date`                        | **1013-00001**                                     |
| **024/025** | credit ∧ revolver                                   | gold-4 (025 precision allows 1021)                 |

**017 note:** population ≠ Fix-7 credit-12. Gold rates are asserted on
POP017 = GOLD_011 ∪ `{1001-00007, 1041-00003, 1007-00001}` (IDs in the
pipeline test only). Auto-discovering that population without gold IDs
remains open.

**005 note:** rate is asserted on POP005 (8 candidates; `1032-00001` drops
out via `is_antitrust_matter=false` → denominator 7). Deal value prefers
defined TEV / Purchase Price (e.g. Harrowgate `1003-00001` = $370M, not
AUM). IDs live in the pipeline gold asserts only.

**006–008 note:** `detect_hsr_filing` keys off dedicated `HSR Filing` /
`HSR Filing Preparation` folders (exact {1001, 1003} on the local DMS),
not bare Regulatory HSR memos.

## How to re-run locally

```bash
java -Xmx512m -jar tika-server-standard-2.9.2.jar --host 127.0.0.1 --port 9998

LANGEXTRACT_MODE=demo PORT=8090 \
  python3 deployment/samples/langextract-http/server.py

node integrations/harvey-labs/scripts/lab-pre-ingest.mjs
# Requires CLAWQL_MCP_URL + CLAWQL_ENABLE_DATA=1 on MCP server (see start-clawql-for-lab.sh)
# expects parity with legacy gold cohort counts (CREDIT_FACILITY=12, etc.)
```

## What this does _not_ claim

- Agent/judge success on 001–025 in GHA (needs OR quota + Sonnet).
- Live LangExtract LLM quality (demo grounding in CI today).
- Automatic 005/017 population discovery without POP lists in the gold test.
- Tasks 026+ (not wired in this pipeline yet).
- Tika Docker packaging (GHA still uses the 2.9.2 jar on the runner JDK).
