# Banking & Finance Credit Facility — Maintenance Covenant Frequency

## Task kind: FREQUENCY

**Denominator N:** 12 matters where `is_credit_facility = true`

The cohort of Banking & Finance credit-facility matters, ordered by matter_id:

| Matter ID | Client Short Name | has_maintenance_financial_covenant |
|-----------|-------------------|------------------------------------|
| 1005-00001 | Nexford Industrial | false |
| 1006-00001 | Crestline Packaging | true |
| 1008-00001 | Lumos Analytics | false |
| 1010-00001 | Arbor Health Tech | true |
| 1012-00001 | Stonefield Logistics | true |
| 1013-00001 | Genome Dx | true |
| 1019-00002 | Whitmore Aerospace | true |
| 1021-00001 | Verimark Hospitality | false |
| 1036-00001 | Fairwater REIT | true |
| 1038-00002 | Cascade Retail | true |
| 1042-00001 | Brightfield Cloud | true |
| 1043-00001 | Ironhaven Data | true |

**k = 9** of **N = 12** matters have `has_maintenance_financial_covenant = true`.

**0 of 12** would be 0%, but 9 matters do have the covenant documented.

### Matter IDs with `has_maintenance_financial_covenant = true`:
- 1006-00001 (Crestline Packaging)
- 1010-00001 (Arbor Health Tech)
- 1012-00001 (Stonefield Logistics)
- 1013-00001 (Genome Dx)
- 1019-00002 (Whitmore Aerospace)
- 1036-00001 (Fairwater REIT)
- 1038-00002 (Cascade Retail)
- 1042-00001 (Brightfield Cloud)
- 1043-00001 (Ironhaven Data)

### Matter IDs with `has_maintenance_financial_covenant = false`:
- 1005-00001 (Nexford Industrial)
- 1008-00001 (Lumos Analytics)
- 1021-00001 (Verimark Hospitality)

### Evidence documents (has_maintenance_financial_covenant_proof_doc):
- 1006-00001: Transaction Documents/mezzanine-credit-agreement-execution.docx
- 1010-00001: Transaction Documents/bridge-loan-agreement-execution.docx
- 1012-00001: Transaction Documents/mezzanine-credit-agreement-execution.docx
- 1013-00001: Transaction Documents/bridge-loan-agreement-execution.docx
- 1019-00002: Transaction Documents/Credit Agreement/credit-agreement-execution.docx
- 1036-00001: Bridge Loan Analysis/bridge-credit-agreement-summary-memo.docx
- 1038-00002: documents/credit-agreement-execution-version.docx
- 1042-00001: Transaction Documents/term-loan-agreement-execution.docx
- 1043-00001: Transaction Documents/credit-agreement-execution.docx

### Reasoning
1. **Defined denominator N** via `clawql_sql`: `SELECT matter_id, client_short_name FROM matters WHERE is_credit_facility ORDER BY matter_id` — this yields exactly 12 matters. This is the correct N per the task pattern (credit-facility cohort, not folder counts or whole-vault counts).
2. **Attribute search inside the filtered set:** Queried `has_maintenance_financial_covenant` for each of the 12 credit-facility matters.
3. **Count:** 9 of 12 have `has_maintenance_financial_covenant = true`; 3 have `false`.
4. **No inference from NULL:** Several rows have NULL semantic bools for this field; those were not counted as true or false — only rows with explicit `true`/`false` values were used.
5. **Write:** `9 of 12 (75%)` with the full matter id list for N.

---
*Source: DuckDB `matters` view, `is_credit_facility` filter + `has_maintenance_financial_covenant` attribute. All 12 matter IDs and their covenant status confirmed via `clawql_sql`.*