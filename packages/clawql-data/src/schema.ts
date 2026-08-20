/** Lab / general structured-data DDL. Column names match the former Python sidecar. */

export const MATTER_COLUMNS = [
  "matter_id",
  "client_short_name",
  "practice_area",
  "matter_type",
  "title",
  "is_credit_facility",
  "is_hsr_second_request",
  "hsr_second_request_date",
  "hsr_second_request_proof_doc",
  "has_hsr_clearance",
  "hsr_clearance_proof_doc",
  "has_hsr_filing",
  "hsr_filing_date",
  "hsr_filing_proof_doc",
  "is_antitrust_matter",
  "deal_value_usd",
  "has_ma_execution_agreement",
  "mentions_springing_lien",
  "has_revolving_facility",
  "is_secured",
  "deal_date",
  "has_incremental_facility",
  "facility_amount_usd",
  "has_adjusted_ebitda_addbacks",
  "has_adjusted_ebitda_addbacks_proof_doc",
  "is_covenant_lite",
  "is_covenant_lite_proof_doc",
  "has_mfn_in_credit_agreement",
  "has_mfn_in_credit_agreement_proof_doc",
  "has_springing_financial_covenant",
  "has_springing_financial_covenant_proof_doc",
  "has_always_on_maintenance_covenant",
  "has_always_on_maintenance_covenant_proof_doc",
  "has_maintenance_financial_covenant",
  "has_maintenance_financial_covenant_proof_doc",
  "borrower_control",
  "matter_status",
  "matter_date",
  "document_count",
  "indexed_doc_count",
  "sandbox_root",
  "vault_note_path",
] as const;

export const CREATE_LAB_SCHEMA_SQL: readonly string[] = [
  `CREATE TABLE matters (
    matter_id VARCHAR PRIMARY KEY,
    client_short_name VARCHAR,
    practice_area VARCHAR,
    matter_type VARCHAR,
    title VARCHAR,
    is_credit_facility BOOLEAN,
    is_hsr_second_request BOOLEAN,
    hsr_second_request_date DATE,
    hsr_second_request_proof_doc VARCHAR,
    has_hsr_clearance BOOLEAN,
    hsr_clearance_proof_doc VARCHAR,
    has_hsr_filing BOOLEAN,
    hsr_filing_date DATE,
    hsr_filing_proof_doc VARCHAR,
    is_antitrust_matter BOOLEAN,
    deal_value_usd DOUBLE,
    has_ma_execution_agreement BOOLEAN,
    mentions_springing_lien BOOLEAN,
    has_revolving_facility BOOLEAN,
    is_secured BOOLEAN,
    deal_date DATE,
    has_incremental_facility BOOLEAN,
    facility_amount_usd DOUBLE,
    has_adjusted_ebitda_addbacks BOOLEAN,
    has_adjusted_ebitda_addbacks_proof_doc VARCHAR,
    is_covenant_lite BOOLEAN,
    is_covenant_lite_proof_doc VARCHAR,
    has_mfn_in_credit_agreement BOOLEAN,
    has_mfn_in_credit_agreement_proof_doc VARCHAR,
    has_springing_financial_covenant BOOLEAN,
    has_springing_financial_covenant_proof_doc VARCHAR,
    has_always_on_maintenance_covenant BOOLEAN,
    has_always_on_maintenance_covenant_proof_doc VARCHAR,
    has_maintenance_financial_covenant BOOLEAN,
    has_maintenance_financial_covenant_proof_doc VARCHAR,
    borrower_control VARCHAR,
    matter_status VARCHAR,
    matter_date DATE,
    document_count INTEGER,
    indexed_doc_count INTEGER,
    sandbox_root VARCHAR,
    vault_note_path VARCHAR
  )`,
  `CREATE TABLE open_facts (
    matter_id VARCHAR,
    rel_doc VARCHAR,
    fact_key VARCHAR,
    fact_value VARCHAR,
    evidence_snippet VARCHAR,
    extractor VARCHAR
  )`,
  `CREATE TABLE matter_documents (
    matter_id VARCHAR NOT NULL,
    rel_path VARCHAR NOT NULL,
    filename VARCHAR NOT NULL,
    ext VARCHAR NOT NULL,
    doc_type VARCHAR,
    doc_date DATE,
    file_size_bytes BIGINT,
    key_terms JSON,
    text_snippet VARCHAR,
    parse_status VARCHAR,
    PRIMARY KEY (matter_id, rel_path)
  )`,
];

export const CREATE_LAB_VIEW_SQL: readonly string[] = [
  `CREATE VIEW credit_facilities AS SELECT * FROM matters WHERE is_credit_facility`,
  `CREATE VIEW revolving_credit_facilities AS
     SELECT * FROM matters WHERE is_credit_facility AND has_revolving_facility`,
  `CREATE VIEW adjusted_ebitda_addback_matters AS
     SELECT * FROM matters WHERE is_credit_facility AND has_adjusted_ebitda_addbacks`,
  `CREATE VIEW covenant_lite_credit_facilities AS
     SELECT * FROM matters WHERE is_credit_facility AND is_covenant_lite`,
  `CREATE VIEW mfn_credit_agreements AS
     SELECT * FROM matters WHERE is_credit_facility AND has_mfn_in_credit_agreement`,
  `CREATE VIEW always_on_maintenance_credit_facilities AS
     SELECT * FROM matters WHERE is_credit_facility AND has_always_on_maintenance_covenant`,
  `CREATE VIEW maintenance_financial_covenant_matters AS
     SELECT * FROM matters WHERE is_credit_facility AND has_maintenance_financial_covenant`,
  `CREATE VIEW hsr_filings AS SELECT * FROM matters WHERE has_hsr_filing`,
  `CREATE VIEW hsr_second_requests AS SELECT * FROM matters WHERE is_hsr_second_request`,
  `CREATE VIEW hsr_second_requests_cleared AS
     SELECT * FROM matters WHERE is_hsr_second_request AND has_hsr_clearance`,
  `CREATE VIEW billion_dollar_antitrust_ma AS
     SELECT * FROM matters
     WHERE deal_value_usd IS NOT NULL AND deal_value_usd >= 1200000000
       AND (is_hsr_second_request OR has_ma_execution_agreement)`,
  `CREATE VIEW secured_credit_facilities AS
     SELECT * FROM matters WHERE is_credit_facility AND is_secured`,
  `CREATE VIEW live_maintenance_financings AS
     SELECT * FROM matters
     WHERE is_credit_facility AND has_maintenance_financial_covenant
       AND NOT (coalesce(is_covenant_lite, false)
            AND coalesce(has_always_on_maintenance_covenant, false) = false)`,
  `CREATE VIEW covenant_lite_no_always_on AS
     SELECT * FROM matters
     WHERE is_credit_facility AND is_covenant_lite
       AND (has_always_on_maintenance_covenant IS NULL OR has_always_on_maintenance_covenant = false)`,
  `CREATE VIEW open_facts_by_matter AS
     SELECT matter_id, fact_key, fact_value, rel_doc, evidence_snippet
     FROM open_facts ORDER BY matter_id, fact_key`,
  `CREATE VIEW documents_by_type AS
     SELECT d.matter_id, m.client_short_name, m.practice_area, d.filename, d.doc_type, d.rel_path
     FROM matter_documents d LEFT JOIN matters m ON m.matter_id = d.matter_id`,
];

export const DROP_LAB_SCHEMA_SQL: readonly string[] = [
  "DROP VIEW IF EXISTS documents_by_type",
  "DROP VIEW IF EXISTS open_facts_by_matter",
  "DROP VIEW IF EXISTS covenant_lite_no_always_on",
  "DROP VIEW IF EXISTS live_maintenance_financings",
  "DROP VIEW IF EXISTS secured_credit_facilities",
  "DROP VIEW IF EXISTS billion_dollar_antitrust_ma",
  "DROP VIEW IF EXISTS hsr_second_requests_cleared",
  "DROP VIEW IF EXISTS hsr_second_requests",
  "DROP VIEW IF EXISTS hsr_filings",
  "DROP VIEW IF EXISTS maintenance_financial_covenant_matters",
  "DROP VIEW IF EXISTS always_on_maintenance_credit_facilities",
  "DROP VIEW IF EXISTS mfn_credit_agreements",
  "DROP VIEW IF EXISTS covenant_lite_credit_facilities",
  "DROP VIEW IF EXISTS adjusted_ebitda_addback_matters",
  "DROP VIEW IF EXISTS revolving_credit_facilities",
  "DROP VIEW IF EXISTS credit_facilities",
  "DROP TABLE IF EXISTS matter_documents",
  "DROP TABLE IF EXISTS open_facts",
  "DROP TABLE IF EXISTS matters",
];
