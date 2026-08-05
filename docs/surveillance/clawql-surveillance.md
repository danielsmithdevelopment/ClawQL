# clawql-surveillance

**Status:** Specification (not yet shipped)  
**Package:** `packages/clawql-surveillance` (planned)  
**Vertical:** Surveillance camera evidence integrity and compliance  
**Enable:** `CLAWQL_SURVEILLANCE_ENABLED=1`  
**CLI:** `clawql surveillance *`

`clawql-surveillance` is ClawQL's vertical package for surveillance camera vendors who need to demonstrate cryptographic chain of custody for footage offered as criminal evidence. It sits alongside `clawql-lending` and `clawql-real-estate` in the modularization v2.1 architecture — a domain-specific opt-in package on the same Agentic Gateway, sharing security, memory, audit, and the WORM pipeline.

Marketing overview: [Surveillance industry page](https://clawql.com/industries/surveillance/). Model contract language and technical standard: [surveillance-evidence-integrity](https://github.com/danielsmithdevelopment/surveillance-evidence-integrity).

---

## The problem this vertical solves

No major surveillance camera vendor currently implements the technical controls required to independently authenticate footage as criminal evidence under Federal Rule of Evidence 901 and equivalent state rules. The gap is structural, not incidental:

- No hash at capture within camera hardware
- No Merkle-chained audit log
- No external immutable anchor independent of vendor infrastructure
- No mandatory case number enforcement on queries
- No independent accuracy certification

The legal and procurement consequences of this gap are accelerating. Active federal litigation (IJ v. Norfolk, IJ v. San Jose) is establishing ALPR authentication standards at the circuit level. Public defenders equipped with tools like [challengethefootage.com](https://challengethefootage.com) are filing FRE 901, FRE 702, and Fourth Amendment challenges in volume. Cities are writing the model contract language from [surveillance-evidence-integrity](https://github.com/danielsmithdevelopment/surveillance-evidence-integrity) into new RFPs.

`clawql-surveillance` gives camera vendors the audit and integrity infrastructure to meet these standards — and to sign the contract language that wins the next procurement cycle.

---

## Architecture

```
[Camera Hardware]
    |
    | footage segment + hardware attestation proof
    | (HSE hash computed before leaving camera)
    v
[clawql-surveillance ingest endpoint]
    |
    +-- [AttestationVerificationService]
    |       validates HSE proof against device identity
    |       rejects footage without valid attestation
    |
    +-- [FootageHashService]
    |       records segment hash + attestation reference
    |       appends to Merkle chain
    |
    +-- [SurveillanceWORMAuditService]
    |       extends PaymentAuditService pattern
    |       hash-chained JSONL or Postgres
    |       incorporates footage events + access events
    |
    +-- [ArweaveAnchorService]
    |       publishes Merkle root on configured schedule
    |       records transaction ID + time range mapping
    |       exposes public verification API
    |
    +-- [AccessEnforcementService]
    |       requires case number on all queries
    |       blocks unauthorized agency access
    |       logs all queries including federal agency access
    |
    +-- [AccuracyReportService]
            ingests third-party certification results
            publishes to Arweave alongside Merkle roots
            exposes per-deployment accuracy metrics
```

---

## Domain tools (MCP)

Tools registered when `CLAWQL_SURVEILLANCE_ENABLED=1`:

| Tool | Description |
| --- | --- |
| `footage_ingest` | Ingest a footage segment with hardware attestation proof |
| `footage_verify` | Verify a footage file against the Merkle chain and external anchor |
| `footage_query` | Query footage with mandatory case number enforcement |
| `footage_export` | Export footage with full chain of custody documentation |
| `audit_log_query` | Query the access audit log for a camera, time range, or officer |
| `merkle_verify` | Verify chain integrity from any entry forward |
| `arweave_anchor_status` | Check anchoring status and retrieve transaction IDs |
| `accuracy_report_ingest` | Ingest third-party accuracy certification results |
| `accuracy_report_query` | Query current accuracy certification status |
| `agency_access_provision` | Provision a new agency with scoped access credentials |
| `federal_access_log` | Specialized logging for federal agency access events |
| `contract_compliance_report` | Generate a compliance report against model contract language sections |

---

## Core services

### AttestationVerificationService

Validates hardware attestation proofs from camera HSEs before footage is accepted into the system.

```typescript
interface AttestationProof {
  cameraId: string // device identity burned into HSE at manufacture
  segmentHash: string // SHA-256 of the raw footage segment
  timestamp: string // ISO 8601, from HSE clock
  attestationSig: string // HSE signature over (cameraId + segmentHash + timestamp)
  firmwareVersion: string // signed firmware hash for supply chain verification
}

// Rejects footage where:
// - attestation signature does not verify against known camera public key
// - camera is not in the registered fleet
// - timestamp is outside acceptable skew
// - firmware version is not in the approved signed firmware list
```

Cameras must be registered in the fleet with their HSE public key before footage is accepted. Key registration is a signed, auditable event in the WORM log.

### SurveillanceWORMAuditService

Extends the `PaymentAuditService` pattern from `clawql-payments`. Every surveillance event appends a hash-chained record:

```typescript
type SurveillanceAuditEventType =
  | 'FOOTAGE_INGESTED' // new segment received and attested
  | 'FOOTAGE_VERIFIED' // verification pass or fail
  | 'FOOTAGE_QUERY' // search against footage or metadata
  | 'FOOTAGE_EXPORT' // footage exported to agency or court
  | 'FOOTAGE_FEDERAL_ACCESS' // federal agency access event
  | 'FOOTAGE_DELETION' // footage deleted per retention policy
  | 'AUDIT_LOG_QUERY' // access log queried
  | 'MERKLE_ROOT_COMPUTED' // new Merkle root calculated
  | 'ARWEAVE_ANCHOR_CONFIRMED' // root published to Arweave, tx ID recorded
  | 'ACCURACY_REPORT_INGESTED' // new certification result recorded
  | 'CASE_NUMBER_REJECTED' // query blocked for missing case number
  | 'UNAUTHORIZED_ACCESS_BLOCKED' // access attempt from unprovisioned agency
  | 'ATTESTATION_FAILED' // footage rejected due to invalid HSE proof
  | 'FLEET_KEY_REGISTERED' // new camera HSE key registered
  | 'FLEET_KEY_REVOKED' // camera key revoked
  | 'CONTRACT_COMPLIANCE_VERIFIED' // compliance report generated

interface SurveillanceAuditEntry {
  seq: number
  prev_hash: string
  hash: string // SHA-256 over canonical JSON of this entry
  timestamp: string
  event_type: SurveillanceAuditEventType
  camera_id?: string
  agency_id?: string
  officer_id?: string
  case_number?: string
  segment_hash?: string
  arweave_tx?: string
  correlation_id: string // links to inference call store if AI-assisted
  payload: Record<string, unknown> // event-specific structured data
}
```

Storage backends: `jsonl` (single node), `postgres` (multi-node). Same pattern as `clawql-payments` audit store. `clawql surveillance audit verify` validates chain integrity.

### ArweaveAnchorService

Publishes Merkle roots on schedule and maintains the public transaction ID registry.

```typescript
// Configuration
// CLAWQL_SURVEILLANCE_ARWEAVE_WALLET_PATH=~/.ClawQL/Surveillance/arweave-key.json
// CLAWQL_SURVEILLANCE_ANCHOR_INTERVAL_MINUTES=60   // default: hourly
// CLAWQL_SURVEILLANCE_ANCHOR_MAX_LAG_MINUTES=240   // alert if root not anchored within 4hr

// Public verification endpoint (no auth required)
// GET /surveillance/verify/:arweave_tx_id
// Returns: merkle_root, time_range_start, time_range_end, chain_entries_count, verification_status

// GET /surveillance/footage/:segment_hash/proof
// Returns: merkle_proof (path from segment to root), arweave_tx_id, attestation_proof
// Consumable by defense experts and courts without vendor cooperation
```

The transaction ID registry is itself published to Arweave quarterly, creating a permanent public index of all roots.

### AccessEnforcementService

Enforces mandatory case number and agency provisioning on all queries.

```typescript
// Every query requires:
interface FootageQueryRequest {
  case_number: string // REQUIRED — query blocked if missing or blank
  agency_id: string // REQUIRED — must match provisioned agency
  officer_id: string // REQUIRED
  query_purpose: string // REQUIRED — brief free-text justification
  footage_range?: DateRange
  camera_ids?: string[]
  plate?: string
}

// Blocked queries generate:
// - CASE_NUMBER_REJECTED or UNAUTHORIZED_ACCESS_BLOCKED audit event
// - HTTP 403 with structured error including officer_id, agency_id, timestamp
// - Alert to agency administrator
// - Entry in Merkle chain (block events are part of the permanent record)
```

Federal agency access is logged with the same mandatory fields. If a federal agency is not in the provisioned list, access is blocked. Provisioning a new agency is itself a WORM audit event requiring authorization from the contracting city.

### AccuracyReportService

Ingests and publishes third-party accuracy certification results.

```typescript
interface AccuracyReport {
  vendor: string
  testing_organization: string // must be independent of vendor
  test_date: string
  test_methodology: string // description of test dataset and conditions
  total_reads: number
  correct_reads: number
  error_rate: number // errors / total_reads
  error_breakdown: CharacterConfusionMatrix // by character pair
  certification_status: 'PASS' | 'FAIL' // PASS requires max error rate 0.001
  arweave_tx?: string // published to Arweave on ingestion
  valid_until: string // 12 months from test_date
}
```

Certification status is surfaced in:

- `contract_compliance_report` output
- `footage_export` chain of custody documentation
- Public verification API

### ContractComplianceReportService

Generates a machine-readable compliance report against each section of the model contract language. Designed for use in procurement conversations and court proceedings.

```typescript
interface ContractComplianceReport {
  vendor: string
  report_date: string
  arweave_tx: string // report itself published to Arweave
  sections: {
    section_1_hash_at_capture: {
      status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL'
      evidence: string[] // attestation proof samples, HSE registration records
    }
    section_2_merkle_chain: {
      status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL'
      evidence: string[] // chain integrity verification results
    }
    section_3_external_anchor: {
      status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL'
      evidence: string[] // Arweave transaction IDs, anchoring schedule adherence
    }
    section_4_audit_log: {
      status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL'
      evidence: string[] // case number enforcement rate, federal access log completeness
    }
    section_5_alteration_prohibition: {
      status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL'
      evidence: string[] // integration partner due diligence records
    }
    section_6_audit_rights: {
      status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL'
      evidence: string[] // third-party audit results if conducted
    }
    accuracy_certification: {
      status: 'COMPLIANT' | 'NON_COMPLIANT' | 'EXPIRED'
      error_rate: number
      valid_until: string
      arweave_tx: string
    }
  }
  overall_status: 'FULLY_COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT'
}
```

---

## Environment variables

```bash
# Core
CLAWQL_SURVEILLANCE_ENABLED=1
CLAWQL_SURVEILLANCE_AUDIT_STORE=postgres          # jsonl or postgres
CLAWQL_SURVEILLANCE_DATABASE_URL=postgres://...

# Arweave anchoring
CLAWQL_SURVEILLANCE_ARWEAVE_WALLET_PATH=~/.ClawQL/Surveillance/arweave-key.json
CLAWQL_SURVEILLANCE_ANCHOR_INTERVAL_MINUTES=60
CLAWQL_SURVEILLANCE_ANCHOR_MAX_LAG_MINUTES=240

# Access enforcement
CLAWQL_SURVEILLANCE_REQUIRE_CASE_NUMBER=1         # default: on, never disable in prod
CLAWQL_SURVEILLANCE_BLOCK_UNPROVISIONED_AGENCIES=1
CLAWQL_SURVEILLANCE_FEDERAL_ACCESS_ALERT=1        # alert city admin on federal access

# Accuracy certification
CLAWQL_SURVEILLANCE_MIN_ACCURACY=0.999            # 0.1% max error rate
CLAWQL_SURVEILLANCE_ACCURACY_CERT_REQUIRED=1      # block export if cert expired

# Public verification API
CLAWQL_SURVEILLANCE_PUBLIC_VERIFY_ENABLED=1       # no auth required on /surveillance/verify/*
CLAWQL_SURVEILLANCE_PUBLIC_VERIFY_PORT=8090       # separate port for public endpoints

# Attestation
CLAWQL_SURVEILLANCE_REQUIRE_ATTESTATION=1         # reject footage without HSE proof
CLAWQL_SURVEILLANCE_FLEET_KEY_STORE=~/.ClawQL/Surveillance/fleet-keys.json
```

---

## CLI reference

```bash
# Fleet management
clawql surveillance fleet register --camera-id CAM-001 --hse-pubkey ./cam001.pub
clawql surveillance fleet list
clawql surveillance fleet revoke --camera-id CAM-001

# Footage
clawql surveillance footage ingest --file ./segment.mp4 --attestation ./segment.attest
clawql surveillance footage verify --segment-hash sha256:abc123...
clawql surveillance footage export --case-number 24-CR-00123 --output ./export/

# Audit
clawql surveillance audit verify
clawql surveillance audit query --camera-id CAM-001 --date-from 2026-07-01
clawql surveillance audit query --officer-id OFF-042 --no-case-number
clawql surveillance audit query --agency federal --date-from 2026-01-01

# Arweave
clawql surveillance anchor status
clawql surveillance anchor verify --tx-id abc123...
clawql surveillance anchor history --date-from 2026-07-01

# Accuracy
clawql surveillance accuracy ingest --report ./certification-report.json
clawql surveillance accuracy status
clawql surveillance accuracy history

# Compliance
clawql surveillance compliance report
clawql surveillance compliance report --publish-arweave
clawql surveillance compliance verify --report-tx abc123...
```

---

## Pricing and GTM

`clawql-surveillance` is an opt-in vertical package available at the Business tier and above ($599/mo), or as a standalone enterprise contract for camera vendors integrating it into their product.

**The sales conversation:**

Entry point: a camera vendor whose footage is being challenged in court, or a city attorney who has seen the model contract language and wants to know which vendors can sign it.

Value proposition: the first vendor to ship against the spec in FOR-VENDORS.md wins every contract where a city attorney has read the IJ litigation. `clawql-surveillance` provides Sections 2 through 6 of the model contract language out of the box. The vendor handles the camera hardware for Section 1; ClawQL handles everything downstream.

Differentiation from building it themselves: the Merkle-chaining, WORM audit, Arweave anchoring, and access enforcement architecture is already built, tested, and documented across 32 modules at [docs.clawql.com](https://docs.clawql.com). A vendor building from scratch takes 12–18 months. Integrating `clawql-surveillance` takes weeks.

**Related essay (PragmaticVectors):** "The First Camera That Can't Lie" — an incident-anchored piece on the IJ Norfolk case surviving a motion to dismiss, framed as the moment the surveillance camera industry's authentication gap became a legal reality rather than a theoretical risk. CTA: `clawql surveillance compliance report`.

---

## Relationship to challengethefootage.com

[challengethefootage.com](https://challengethefootage.com) and `clawql-surveillance` are two sides of the same market dynamic.

challengethefootage.com creates legal pressure by giving defendants, public defenders, and city officials tools to challenge non-compliant footage. Every motion filed, every Daubert hearing, every contract renewal where a city attorney asks "can you sign Section 5" shortens the timeline to when compliance is mandatory.

`clawql-surveillance` captures the commercial opportunity that pressure creates. The vendors that want to be the answer to those questions — rather than the defendant in those proceedings — are the customers.

The documentation in [surveillance-evidence-integrity](https://github.com/danielsmithdevelopment/surveillance-evidence-integrity) serves both: it is the legal and technical standard that challengethefootage.com enforces and that `clawql-surveillance` implements.

---

## Related docs

- [clawql-payments](../payments/clawql-payments.md) — WORM audit store pattern reused by `SurveillanceWORMAuditService`
- [clawql-inference](../inference/clawql-inference.md) — Agentic Gateway entry; MCP tool registration surface
- [Plugin registry](../reference/clawql-plugin-registry.md) — planned domain verticals
- [Modularization v2.1](../vision/clawql-modularization-v2.md) — package architecture
