import type { Industry } from './types'

export const governmentIndustry: Industry = {
  slug: 'government',
  name: 'Government',
  headline: 'Outcome accountability for the programs voters fund.',
  subheadline:
    "ClawQL's government vertical (clawql-government) turns bond authorizations and public programs into independently verifiable outcome records — measurable definitions at authorization, immutable baselines, Merkle-chained WORM audit, and Arweave anchoring — so spending accountability and outcome accountability finally share the same infrastructure.",
  packageName: 'clawql-government',
  status: 'partial',
  statusLabel: 'Outcome audit infrastructure available · domain package planned',
  heroEyebrow: 'Measurable outcomes · immutable baselines · independently verifiable records',
  overviewHeadline: 'ClawQL for government outcome accountability',
  overview:
    'California has issued about $196 billion in general obligation bonds since 2000, with roughly $81.8 billion still outstanding and nearly $8.6 billion in debt service this fiscal year alone. Schools, water systems, climate programs, housing — voters approved them all. The state can track how bond dollars are spent. It cannot consistently answer whether those investments achieved the outcomes voters were promised. Spending accountability and outcome accountability are not the same thing. Governments have built robust infrastructure for the first and almost nothing for the second. That is not a California problem. It is a government technology problem with a precise technical solution: define measurable outcomes at authorization, record immutable baselines before programs begin, and maintain append-only, externally anchored outcome records that any qualified party can verify without trusting the program being measured. clawql-government composes ClawQL\'s WORM audit, Merkle chaining, and Arweave anchoring into that outcome layer — the same architecture used for AI agent trails and surveillance evidence integrity, under a different authorization surface. The framing that works: financial audit has required immutable baseline records for decades. Outcome measurement deserves the same standard. Programs that cannot be measured cannot be found to have failed — and that incentive is why the infrastructure must push integrity outside the control of the party being measured.',
  marketHeadline: 'Spending records are not outcome records',
  marketSubheadline:
    'California tracks where bond dollars go. It does not consistently measure whether those investments delivered what voters expected — and new bond measures are still moving without that requirement.',
  marketContext:
    'A CalMatters commentary put the gap bluntly: after hundreds of billions in bond authorization, whether outcomes materialized is "surprisingly difficult to answer." Outcome records are harder than spending ledgers because results are distributed, delayed, and contested — but "hard to measure" is not the same as "not measured at all." The current failure mode is structural: bond language often promises goals that cannot survive contact with data, baselines are not recorded immutably before programs start, and operational logs live inside systems controlled by the programs being measured. The Oak Park, Illinois surveillance case is the same pattern at contract scale — cameras paid for on promised crime-reduction outcomes, operated for years without measurement, then found to have played no meaningful role in investigations once an oversight board actually checked. New California measures — including university facilities/housing and a proposed $10 billion housing bond — will again promise outcomes without requiring independently verifiable measurement. The legislative opening is clear: write measurable outcomes and baselines into authorization language, require WORM storage with external anchoring for outcome records, expose public verification APIs, and give auditors a standing mandate to cryptographically verify active programs. clawql-government is the infrastructure that makes those requirements implementable rather than aspirational.',
  audiencesHeadline: 'Two audiences, one outcome engine',
  audiencesSubheadline:
    'Same Merkle-chained WORM audit and Arweave anchoring — positioned for agencies that must prove program results, and for legislators and auditors who need machine-verifiable accountability without trusting program self-reporting.',
  audiences: [
    {
      id: 'agencies',
      name: 'State and local agencies',
      headline: 'Prove program outcomes without rewriting every ledger.',
      overview:
        'Agencies already generate operational records for program management. clawql-government turns those records into audit-grade outcome trails: baselines locked at inception, measurements appended immutably, Merkle roots anchored externally, and FOIA/public verification paths that do not require trusting the program database alone.',
      stackPlacement: [
        {
          system: 'Bond / program authorization',
          role: 'Define measurable outcomes, baselines, and measurement periods',
          provider: 'Legislature / agency',
        },
        {
          system: 'clawql-government',
          role: 'Record baselines, ingest outcome measures, Merkle-chain + Arweave anchor',
          provider: 'ClawQL',
        },
        {
          system: 'Program operations systems',
          role: 'Source operational data (construction, housing units, water events, etc.)',
          provider: 'Agency / vendors',
        },
        {
          system: 'Auditors & public',
          role: 'Independently verify integrity via public transaction IDs and APIs',
          provider: 'Any qualified party',
        },
      ],
    },
    {
      id: 'oversight',
      name: 'Legislators, auditors, and oversight',
      headline: 'Authorization language that can be enforced in software.',
      overview:
        'Outcome accountability fails when it depends on political will alone. Model authorization requirements — measurable outcomes, immutable baselines, WORM + external anchors, public verification, standing cryptographic audit — become enforceable when the infrastructure is already available. clawql-government is that infrastructure.',
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
          body: 'Anyone with an Arweave transaction ID can confirm that published outcome roots have not been altered.',
        },
      ],
    },
  ],
  painPointsHeadline: 'Problems clawql-government solves',
  painPointsSubheadline:
    'These are the structural gaps the vertical targets — on top of ClawQL Core WORM audit, Arweave anchoring, document IDP, FOIA-oriented redaction, and FedRAMP-ready deployment patterns.',
  painPoints: [
    {
      title: 'Spending trails exist; outcome trails do not',
      body: 'Bond dollars move through accounts auditors can follow. Outcomes — reduced system failures, housing units delivered, student-capacity targets — are rarely recorded in a form that survives independent scrutiny. clawql-government treats outcome events as first-class WORM audit entries chained to an immutable baseline.',
    },
    {
      title: 'Goals written as slogans cannot be measured',
      body: '"Improve water systems" is not an outcome definition. "Reduce system failure events 30% within five years against a defined baseline" is. The vertical expects measurable authorization language and rejects blank or non-quantified outcome registrations the way surveillance blocks blank case numbers.',
    },
    {
      title: 'Baselines can be rewritten after the fact',
      body: 'Without an immutable baseline recorded before the program begins, "improvement" is whatever the program later claims. Baselines are hash-chained at inception and anchored externally so retroactive adjustment is detectable.',
    },
    {
      title: 'Program-controlled logs are not independent evidence',
      body: 'Operational databases designed for management can be amended, selectively retained, or purged. Outcome integrity requires append-only storage, cryptographic chaining, and an external anchor outside the program\'s control — the same properties that make financial audit trails trustworthy.',
    },
    {
      title: 'FOIA and citizen access without a second system of record',
      body: 'Public records requests and citizen service routing still need document intelligence — classify, redact, route — on the same gateway that holds outcome trails. clawql-government composes IDP + memory with outcome audit rather than bolting a separate transparency portal onto unverifiable ledgers.',
    },
  ],
  platformSubheadline:
    'Every vertical package composes these horizontal layers — security, audit, documents, and supply chain integrity.',
  platformCapabilities: [
    'WORM forensic audit — Merkle-chained, hash-linked outcome and access events; same architecture as ClawQL inference and payments audit',
    'Arweave anchoring — external immutable roots for baselines and outcome windows; publicly verifiable; typically under $1/day per program',
    'IDP pipeline — FOIA packets, permit applications, tax forms, bid documents: classify, extract, redact, archive',
    'Vault memory — durable program context, authorization language, and prior audit findings across agent sessions',
    'Supply chain signing — Cosign-signed images, CycloneDX SBOM, startup hash verification via clawql-release',
    'FedRAMP-oriented defaults — self-hosted deployment patterns for agencies that cannot put program data in unmanaged SaaS',
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
      description:
        'Lock an immutable baseline at program inception — hash-chained and scheduled for external anchor.',
    },
    {
      name: 'outcome_measure_ingest',
      description:
        'Ingest a timed outcome measurement against the registered definition; append to the WORM chain.',
    },
    {
      name: 'outcome_verify',
      description:
        'Verify an outcome record against the Merkle chain and Arweave anchor; returns a machine-readable report for auditors.',
    },
    {
      name: 'authorization_compliance_report',
      description:
        'Generate a section-by-section compliance report against model bond/program authorization requirements (measurable outcomes, baselines, WORM, public verify, auditor mandate).',
    },
    {
      name: 'foia_route',
      description: 'Classify and route FOIA / public records requests with redaction checkpoints and audit correlation IDs.',
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
      body: 'outcome_verify and merkle_verify return cryptographic proofs and Arweave transaction IDs. Auditors validate integrity without asking the program to "confirm" its own numbers — the same independence standard financial audit already assumes.',
    },
    {
      title: 'Housing and facilities bonds under public scrutiny',
      body: 'University facilities, student housing, and multifamily housing programs can publish unit-delivery and timeline outcomes as anchored records. Voters and journalists verify progress against the authorization baseline instead of relying on press releases.',
    },
    {
      title: 'Contract-scale outcome failure detection',
      body: 'Oak Park-style failures happen when promised outcomes are never measured. Mandatory measurement windows and WORM trails surface non-delivery while contracts are still active — not years later when the officials who made the promises have moved on.',
    },
    {
      title: 'FOIA and permitting on the same gateway',
      body: 'Citizen-facing document workflows (foia_route, permit_classify, record_redact) share audit correlation with outcome trails, so transparency requests and program performance evidence live in one Agentic Gateway rather than disconnected portals.',
    },
  ],
  examples: [],
  auditEventsSubheadline:
    'Every government outcome and access event appends a hash-chained entry to the WORM audit log. Entries cannot be modified or deleted after writing. Correlation IDs link agent-assisted processing to the permanent record.',
  auditEvents: [
    { event: 'PROGRAM_REGISTERED', trigger: 'Bond or authorized program registered with measurable outcomes' },
    { event: 'BASELINE_RECORDED', trigger: 'Immutable baseline locked at program inception' },
    { event: 'OUTCOME_MEASURE_INGESTED', trigger: 'Timed outcome measurement appended to the chain' },
    { event: 'OUTCOME_VERIFIED', trigger: 'Verification pass or fail against Merkle chain + anchor' },
    { event: 'OUTCOME_DEFINITION_REJECTED', trigger: 'Registration blocked — outcome not measurable / baseline missing' },
    { event: 'MERKLE_ROOT_COMPUTED', trigger: 'New Merkle root calculated for an outcome window' },
    { event: 'ARWEAVE_ANCHOR_CONFIRMED', trigger: 'Root published to Arweave, transaction ID recorded' },
    { event: 'AUTHORIZATION_COMPLIANCE_VERIFIED', trigger: 'Compliance report generated against model language' },
    { event: 'FOIA_REQUEST_ROUTED', trigger: 'Public records request classified and routed' },
    { event: 'RECORD_REDACTED', trigger: 'Exempt/PII material redacted before release' },
    { event: 'AUDIT_PACKAGE_GENERATED', trigger: 'Examiner package linking spend refs to outcome proofs' },
    { event: 'UNAUTHORIZED_ACCESS_BLOCKED', trigger: 'Access attempt outside provisioned agency/role scope' },
  ],
  complianceHeadline: 'Built for the accountability standard auditors already understand',
  compliance: [
    'WORM Merkle audit trail for baselines and outcomes — independently verifiable; same pattern as ClawQL inference and payments',
    'External immutable anchoring — Arweave transaction IDs publicly accessible without agency cooperation on every request',
    'Model authorization alignment — measurable outcomes, baselines, WORM storage, public verify API, standing auditor verification',
    'FOIA / public records tooling — classify, redact, route with structured audit events',
    'FedRAMP-ready deployment posture — self-hosted Helm/K8s patterns; Cosign + SBOM via clawql-release',
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
    'clawql-government is infrastructure for agencies, auditors, and oversight bodies. It does not authorize bonds, appropriate funds, or replace statutory audit mandates. Outcome definitions and baselines must be set by the authorizing body; ClawQL provides the immutable measurement and verification layer.',
  ctaHeadline: 'Ready to demo ClawQL for government outcome accountability?',
  ctaSubheadline:
    'Self-host ClawQL Core with WORM audit and Arweave anchoring today, or contact us about clawql-government early access for bond and program outcome pilots.',
  ctaSecondaryHref: 'https://docs.clawql.com/vision/modularization',
  ctaSecondaryLabel: 'Modularization roadmap',
  closingNote:
    'clawql-government provides outcome-accountability infrastructure. Agencies define measurable outcomes; ClawQL records baselines and results in a form voters, auditors, and courts can independently verify.',
  demoPitch:
    'California can already prove where bond dollars went. It still cannot consistently prove whether voters got the outcomes they were promised. clawql-government closes that gap with measurable authorization hooks, immutable baselines, Merkle-chained outcome records, and Arweave anchors — the same independently verifiable audit architecture ClawQL uses for AI agents and evidence integrity, applied to public programs.',
}
