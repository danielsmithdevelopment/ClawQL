import type { Industry } from './types'

export const governmentIndustry: Industry = {
  slug: 'government',
  name: 'Government',
  headline: 'Outcome accountability for the programs voters fund.',
  subheadline:
    "ClawQL's government vertical (clawql-government) turns bond authorizations and public programs into independently verifiable outcome records — measurable definitions at authorization, immutable baselines, Merkle-chained write-once audit where configured, and optional public hash anchors — so spending accountability and outcome accountability can share the same infrastructure.",
  packageName: 'clawql-government',
  status: 'planned',
  statusLabel: 'Planned — Core WORM patterns available · domain package on roadmap',
  heroEyebrow: 'Measurable outcomes · immutable baselines · independently verifiable records',
  overviewHeadline: 'ClawQL for government outcome accountability',
  overview:
    'Illustrative framing (verify sources): California has authorized large general-obligation bond volumes since 2000, with substantial outstanding debt and ongoing debt service. Schools, water systems, climate programs, housing — voters approved them. States can often track how bond dollars are spent; they cannot always answer whether those investments achieved the outcomes voters were promised. Spending accountability and outcome accountability are not the same thing. Governments have built robust infrastructure for the first and far less for the second. That is not only a California problem. It is a government technology problem with a precise technical approach: define measurable outcomes at authorization, record immutable baselines before programs begin, and maintain append-only, externally anchored outcome records that any qualified party can verify without trusting the program being measured. clawql-government (planned) composes ClawQL\'s hash-chained write-once audit (where Object Lock / WORM storage is configured), Merkle chaining, and optional public anchors of hashes into that outcome layer — the same architecture used for AI agent trails and surveillance evidence integrity, under a different authorization surface. Financial audit has required immutable baseline records for decades; outcome measurement deserves the same standard.',
  marketHeadline: 'Spending records are not outcome records',
  marketSubheadline:
    'Many jurisdictions can track where bond dollars go. Fewer consistently measure whether those investments delivered what voters expected — and new measures often still move without that requirement. (Illustrative; verify sources.)',
  marketContext:
    'Commentary and oversight reports have repeatedly noted that after large bond authorizations, whether outcomes materialized can be surprisingly hard to answer (illustrative; verify sources). Outcome records are harder than spending ledgers because results are distributed, delayed, and contested — but "hard to measure" is not the same as "not measured at all." The current failure mode is structural: bond language often promises goals that cannot survive contact with data, baselines are not recorded immutably before programs start, and operational logs live inside systems controlled by the programs being measured. The Oak Park, Illinois surveillance case is a related pattern at contract scale — cameras paid for on promised crime-reduction outcomes, operated for years without measurement, then found to have played no meaningful role in investigations once an oversight board checked. Authorization language that requires measurable outcomes, baselines, write-once storage with external hash anchors, public verification APIs, and standing cryptographic audit gives auditors a mandate that software can enforce. clawql-government is the planned infrastructure that makes those requirements implementable rather than aspirational.',
  audiencesHeadline: 'Two audiences, one outcome engine',
  audiencesSubheadline:
    'Same Merkle-chained write-once audit and optional public hash anchors — positioned for agencies that must prove program results, and for legislators and auditors who need machine-verifiable accountability without trusting program self-reporting.',
  audiences: [
    {
      id: 'agencies',
      name: 'State and local agencies',
      headline: 'Prove program outcomes without rewriting every ledger.',
      overview:
        'Agencies already generate operational records for program management. clawql-government turns those records into audit-grade outcome trails: baselines locked at inception, measurements appended immutably where write-once storage is configured, Merkle roots optionally anchored as public hashes, and FOIA/public verification paths that do not require trusting the program database alone.',
      stackPlacement: [
        {
          system: 'Bond / program authorization',
          role: 'Define measurable outcomes, baselines, and measurement periods',
          provider: 'Legislature / agency',
        },
        {
          system: 'clawql-government',
          role: 'Record baselines, ingest outcome measures, Merkle-chain + optional public hash anchor',
          provider: 'ClawQL',
        },
        {
          system: 'Program operations systems',
          role: 'Source operational data (construction, housing units, water events, etc.)',
          provider: 'Agency / vendors',
        },
        {
          system: 'Auditors & public',
          role: 'Independently verify integrity via public transaction IDs and APIs (hashes of records)',
          provider: 'Any qualified party',
        },
      ],
    },
    {
      id: 'oversight',
      name: 'Legislators, auditors, and oversight',
      headline: 'Authorization language that can be enforced in software.',
      overview:
        'Outcome accountability fails when it depends on political will alone. Model authorization requirements — measurable outcomes, immutable baselines, write-once storage + external hash anchors, public verification, standing cryptographic audit — become enforceable when the infrastructure is available. clawql-government is that planned infrastructure.',
      useCases: [
        {
          title: 'Bond authorization checklists',
          body: 'Require measurable KPI language and baseline capture before proceeds flow — same rigor as spending limits.',
        },
        {
          title: 'Standing State Auditor mandate',
          body: 'Periodic merkle_verify / anchor status across active bond programs without relying on program self-attestation.',
        },
        {
          title: 'Public verification',
          body: 'Anyone with a public anchor transaction ID can confirm that published outcome root hashes match the published chain — public anchors are hashes of records, not the full datasets.',
        },
      ],
    },
  ],
  painPointsHeadline: 'Problems clawql-government solves',
  painPointsSubheadline:
    'These are the structural gaps the vertical targets — on top of ClawQL Core write-once audit patterns, optional public hash anchoring, document IDP, FOIA-oriented redaction, and self-hosted deployment inside your own accredited environment.',
  painPoints: [
    {
      title: 'Spending trails exist; outcome trails do not',
      body: 'Bond dollars move through accounts auditors can follow. Outcomes — reduced system failures, housing units delivered, student-capacity targets — are rarely recorded in a form that survives independent scrutiny. clawql-government treats outcome events as first-class write-once audit entries chained to an immutable baseline where configured.',
    },
    {
      title: 'Goals written as slogans cannot be measured',
      body: '"Improve water systems" is not an outcome definition. "Reduce system failure events 30% within five years against a defined baseline" is. The vertical expects measurable authorization language and rejects blank or non-quantified outcome registrations the way surveillance blocks blank case numbers.',
    },
    {
      title: 'Baselines can be rewritten after the fact',
      body: 'Without an immutable baseline recorded before the program begins, "improvement" is whatever the program later claims. Baselines are hash-chained at inception and optionally anchored externally so retroactive adjustment is detectable.',
    },
    {
      title: 'Program-controlled logs are not independent evidence',
      body: "Operational databases designed for management can be amended, selectively retained, or purged. Outcome integrity requires append-only storage, cryptographic chaining, and an external hash anchor outside the program's control — the same properties that make financial audit trails trustworthy.",
    },
    {
      title: 'FOIA and citizen access without a second system of record',
      body: 'Public records requests and citizen service routing still need document intelligence — classify, redact, route — on the same gateway that holds outcome trails. clawql-government composes IDP + memory with outcome audit rather than bolting a separate transparency portal onto unverifiable ledgers.',
    },
  ],
  platformSubheadline:
    'Every vertical package composes these horizontal layers — security, audit, documents, and supply chain integrity.',
  platformCapabilities: [
    'Write-once forensic audit — Merkle-chained, hash-linked outcome and access events where Object Lock / WORM storage is configured; same hash-chain architecture as ClawQL inference audit (payment crash-safety is a separate /durability scope — do not infer it here)',
    'Optional public hash anchoring — external immutable roots (hashes only) for baselines and outcome windows; publicly verifiable when enabled',
    'IDP pipeline — FOIA packets, permit applications, tax forms, bid documents: classify, extract, redact, archive',
    'Vault memory — durable program context, authorization language, and prior audit findings across agent sessions',
    'Supply chain signing — Cosign-signed images, CycloneDX SBOM, startup hash verification via clawql-release',
    'Self-hosted deployment inside your own accredited environment — for agencies that cannot put program data in unmanaged SaaS',
  ],
  domainToolsSubheadline: 'Registered when CLAWQL_GOVERNMENT_ENABLED=1 (planned package enable flag):',
  domainTools: [
    {
      name: 'bond_program_register',
      description:
        'Register a bond-funded or authorized program with measurable outcome definitions, baseline references, and measurement periods.',
    },
    {
      name: 'outcome_baseline_record',
      description: 'Lock an immutable baseline at program inception — hash-chained and scheduled for optional external hash anchor.',
    },
    {
      name: 'outcome_measure_ingest',
      description: 'Ingest a timed outcome measurement against the registered definition; append to the write-once chain where configured.',
    },
    {
      name: 'outcome_verify',
      description:
        'Verify an outcome record against the Merkle chain and optional public hash anchor; returns a machine-readable report for auditors.',
    },
    {
      name: 'authorization_compliance_report',
      description:
        'Generate a section-by-section compliance report against model bond/program authorization requirements (measurable outcomes, baselines, write-once storage, public verify, auditor mandate).',
    },
    {
      name: 'foia_route',
      description:
        'Classify and route FOIA / public records requests with redaction checkpoints and audit correlation IDs.',
    },
    {
      name: 'permit_classify',
      description: 'Classify permitting intake packets and extract structured fields for workflow routing.',
    },
    {
      name: 'record_redact',
      description: 'Redact PII and exempt material before public release or citizen portal publication.',
    },
    {
      name: 'bid_analyze',
      description: 'Analyze procurement / bid packages with grounded citations into vault memory.',
    },
    {
      name: 'audit_generate',
      description: 'Produce an examiner-ready audit package linking spending references to outcome chain proofs.',
    },
  ],
  documentTypes: [
    'Bond measure text and authorization statutes',
    'Baseline metric reports and source datasets',
    'Program outcome dashboards and annual reports',
    'FOIA / public records request packets',
    'Permit applications and inspection reports',
    'Procurement bids and award justifications',
    'Tax forms and citizen service filings',
  ],
  useCasesSubheadline:
    'Bond programs, housing and facilities measures, infrastructure KPIs, FOIA, and procurement oversight — on one verifiable outcome engine.',
  useCases: [
    {
      title: 'Bond measures with enforceable outcome language',
      body: 'Before proceeds flow, bond_program_register captures measurable KPIs and outcome_baseline_record locks the pre-program baseline. Later outcome_measure_ingest entries are meaningless without that chain — the authorization becomes software-enforceable, not a PDF promise.',
    },
    {
      title: 'Independent verification for State Auditors',
      body: 'outcome_verify and merkle_verify return cryptographic proofs and optional public anchor transaction IDs. Auditors validate integrity without asking the program to "confirm" its own numbers — the same independence standard financial audit already assumes.',
    },
    {
      title: 'Housing and facilities bonds under public scrutiny',
      body: 'University facilities, student housing, and multifamily housing programs can publish unit-delivery and timeline outcomes as anchored hash records. Voters and journalists verify progress against the authorization baseline instead of relying on press releases alone.',
    },
    {
      title: 'Contract-scale outcome failure detection',
      body: 'Oak Park-style failures happen when promised outcomes are never measured. Mandatory measurement windows and write-once trails surface non-delivery while contracts are still active — not years later when the officials who made the promises have moved on.',
    },
    {
      title: 'FOIA and permitting on the same gateway',
      body: 'Citizen-facing document workflows (foia_route, permit_classify, record_redact) share audit correlation with outcome trails, so transparency requests and program performance evidence live in one Agentic Gateway rather than disconnected portals.',
    },
  ],
  examples: [],
  auditEventsSubheadline:
    'Every government outcome and access event can append a hash-chained entry to a write-once audit log where Object Lock / WORM storage is configured. MCP audit() remains a session buffer. Public anchors, when enabled, publish hashes of records — not full datasets. Correlation IDs link agent-assisted processing to the durable record.',
  auditEvents: [
    { event: 'PROGRAM_REGISTERED', trigger: 'Bond or authorized program registered with measurable outcomes' },
    { event: 'BASELINE_RECORDED', trigger: 'Immutable baseline locked at program inception' },
    { event: 'OUTCOME_MEASURE_INGESTED', trigger: 'Timed outcome measurement appended to the chain' },
    { event: 'OUTCOME_VERIFIED', trigger: 'Verification pass or fail against Merkle chain + optional hash anchor' },
    {
      event: 'OUTCOME_DEFINITION_REJECTED',
      trigger: 'Registration blocked — outcome not measurable / baseline missing',
    },
    { event: 'MERKLE_ROOT_COMPUTED', trigger: 'New Merkle root calculated for an outcome window' },
    { event: 'ARWEAVE_ANCHOR_CONFIRMED', trigger: 'Root hash published to public anchor store, transaction ID recorded' },
    { event: 'AUTHORIZATION_COMPLIANCE_VERIFIED', trigger: 'Compliance report generated against model language' },
    { event: 'FOIA_REQUEST_ROUTED', trigger: 'Public records request classified and routed' },
    { event: 'RECORD_REDACTED', trigger: 'Exempt/PII material redacted before release' },
    { event: 'AUDIT_PACKAGE_GENERATED', trigger: 'Examiner package linking spend refs to outcome proofs' },
    { event: 'UNAUTHORIZED_ACCESS_BLOCKED', trigger: 'Access attempt outside provisioned agency/role scope' },
  ],
  complianceHeadline: 'Built for the accountability standard auditors already understand',
  compliance: [
    'Hash-chained write-once audit trail for baselines and outcomes where configured — independently verifiable; same pattern as ClawQL inference and payments',
    'Optional public hash anchors — transaction IDs publicly accessible without agency cooperation on every request; anchors are hashes only',
    'Model authorization alignment — measurable outcomes, baselines, write-once storage, public verify API, standing auditor verification',
    'FOIA / public records tooling — classify, redact, route with structured audit events',
    'Self-hosted deployment inside your own accredited environment — Cosign + SBOM via clawql-release',
    'Jurisdiction-aware defaults — data sovereignty and role scoping planned via clawql-auth vertical RLS',
  ],
  relatedResources: [
    {
      label: 'California bond outcome accountability (PragmaticVectors)',
      href: 'https://pragmaticvectors.com/posts/california-bond-outcome-accountability/',
    },
    {
      label: 'WORM forensic audit reference',
      href: 'https://docs.clawql.com/security/audit-trail',
    },
    {
      label: 'Security best practices',
      href: 'https://docs.clawql.com/security/best-practices',
    },
    {
      label: 'Immutable releases — Arweave',
      href: 'https://docs.clawql.com/getting-started/immutable-releases',
    },
    {
      label: 'Modularization v2.1 — clawql-government',
      href: 'https://docs.clawql.com/vision/modularization',
    },
    {
      label: 'Plugin registry — government vertical',
      href: 'https://docs.clawql.com/plugins?kind=vertical&q=government#registry',
    },
    {
      label: 'Surveillance evidence integrity (same audit architecture)',
      href: 'https://docs.clawql.com/surveillance/clawql-surveillance',
    },
  ],
  docsHref: 'https://docs.clawql.com/vision/modularization',
  disclaimer:
    'clawql-government is planned infrastructure for agencies, auditors, and oversight bodies. It does not authorize bonds, appropriate funds, or replace statutory audit mandates. Bond and outcome figures on this page are illustrative — verify sources. Outcome definitions and baselines must be set by the authorizing body; ClawQL provides the measurement and verification layer when deployed in your accredited environment.',
  ctaHeadline: 'Ready to discuss ClawQL for government outcome accountability?',
  ctaSubheadline:
    'Self-host ClawQL Core with hash-chained write-once audit where configured, or contact us about clawql-government early access for bond and program outcome pilots.',
  ctaSecondaryHref: 'https://docs.clawql.com/vision/modularization',
  ctaSecondaryLabel: 'Modularization roadmap',
  closingNote:
    'clawql-government provides outcome-accountability infrastructure. Agencies define measurable outcomes; ClawQL records baselines and results in a form voters, auditors, and courts can independently verify when write-once storage and optional public hash anchors are configured.',
  demoPitchEyebrow: 'Share with agency staff',
  demoPitchHint:
    'Copy and send this to program managers, auditors, legislative staff, or tech evaluators before a briefing.',
  demoPitch:
    'Agencies can often prove where bond dollars went. They still cannot always prove whether voters got the outcomes they were promised. clawql-government (planned) closes that gap with measurable authorization hooks, immutable baselines, Merkle-chained outcome records where write-once storage is configured, and optional public hash anchors — the same independently verifiable audit architecture ClawQL uses for AI agents and evidence integrity, applied to public programs. Deploy self-hosted inside your accredited environment.',
}
