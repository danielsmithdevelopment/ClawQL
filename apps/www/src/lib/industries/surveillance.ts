import type { Industry } from './types'

export const surveillanceIndustry: Industry = {
  slug: 'surveillance',
  name: 'Surveillance',
  headline: 'The audit layer that makes camera footage trustworthy as evidence.',
  subheadline:
    "ClawQL's surveillance vertical (clawql-surveillance) composes hardware attestation receipt, Merkle-chained write-once audit logging where configured, optional public hash anchoring, and mandatory case number enforcement into a single audit layer for surveillance camera vendors — so footage authenticity can be checked from a known hash point, officer access is permanently recorded when write-once storage is enabled, and the chain of custody can survive independent scrutiny.",
  packageName: 'clawql-surveillance',
  status: 'planned',
  statusLabel: 'Planned — Core audit patterns available · hardware attestation per vendor',
  heroEyebrow: 'Cryptographic chain of custody · independently verifiable · mandatory access enforcement',
  overviewHeadline: 'ClawQL for surveillance camera vendors',
  overview:
    'Courts increasingly ask a question many deployments struggle to answer: how do you know this footage is what the camera originally recorded, unaltered? Authentication often depends on vendor assertion rather than independently verifiable mathematical proof — a gap FRE 901(b)(9) and Daubert-style scrutiny can expose. Practical consequences are compounding: civil ALPR challenges are reaching federal courts, public defenders are filing authenticity and reliability motions, and procurement conversations increasingly ask about hash-at-capture and access logging. clawql-surveillance gives camera vendors planned audit infrastructure to receive hardware attestation proofs, Merkle-chain footage from ingestion, optionally anchor Merkle root hashes publicly, and enforce case-number policy — so agencies can self-host the evidence layer on their own infrastructure rather than implying hosted CJIS readiness. Cryptographic chain of custody serves defendants who need to challenge unreliable evidence, officers who need legitimate work to be checkable in court, and agencies that need to demonstrate surveillance programs meet evolving standards. Deploy agency data self-hosted.',
  marketHeadline: 'The gap the market is moving to close',
  marketSubheadline:
    'The authentication problem is not theoretical. It is being litigated — and procurement language is getting more specific about integrity and access logging.',
  marketContext:
    'Active federal litigation has produced civil ALPR challenges that survive motions to dismiss, establishing that courts will hear authentication arguments about surveillance footage. Public defenders are filing FRE 901 and FRE 702 motions. The Institute for Justice has documented cases of innocent people detained due to misidentification errors and cases of officers using ALPR networks to track personal interests (verify IJ publications for current counts). Some cities have canceled or declined to renew surveillance contracts; newer RFPs increasingly ask about hash at capture, Merkle-chained audit logs, and external immutable anchoring. The procurement conversation is shifting from "does it work" toward "can you prove it hasn\'t been tampered with and can you prove every query had a legitimate purpose." clawql-surveillance is designed to support model integrity clauses — Merkle chaining, optional public hash anchoring, mandatory access logging, prohibition on undetectable alteration integrations, and independent audit rights — with Section 1 (hash at capture within camera hardware) requiring camera hardware integration. clawql-surveillance receives attestation proofs from camera HSEs and incorporates them into the chain at ingestion. Agency footage and audit logs should stay self-hosted.',
  audiencesHeadline: 'Two audiences, one audit engine',
  audiencesSubheadline:
    'Same Merkle-chained write-once audit infrastructure — positioned for camera vendors building compliant products and for cities and agencies that need independently verifiable chain of custody on footage already in the field.',
  audiences: [
    {
      id: 'vendors',
      name: 'Camera vendors and integrators',
      headline: 'Cryptographic chain of custody as a product differentiator.',
      overview:
        'Vendors that can meet integrity clauses without negotiating them out are better positioned in procurements where city attorneys have read IJ litigation or seen authenticity motions in their jurisdiction. clawql-surveillance provides the planned audit infrastructure; the camera hardware vendor provides the HSE for hash at capture.',
      stackPlacement: [
        {
          system: 'Camera hardware + HSE',
          role: 'Hash footage at capture, generate attestation proof',
          provider: 'Camera vendor',
        },
        {
          system: 'clawql-surveillance',
          role: 'Receive attestation, build Merkle chain, optionally anchor hashes, enforce access',
          provider: 'ClawQL',
        },
        {
          system: 'Contracting agency',
          role: 'Self-host, configure authorized users, set case number policy, receive audit access',
          provider: 'Agency',
        },
        {
          system: 'Courts and defense',
          role: 'Independently verify chain via public anchor transaction IDs (hashes)',
          provider: 'Any party',
        },
      ],
    },
    {
      id: 'agencies',
      name: 'Cities and agencies',
      headline: 'Independent verification of footage already in the field.',
      overview:
        'For agencies operating existing camera networks that do not yet meet these standards, clawql-surveillance provides a planned audit layer that can be retrofitted around existing infrastructure — Merkle-chained access logging, optional public hash anchoring, and mandatory case number enforcement even where hash at capture has not yet been implemented at the hardware level. Keep agency data self-hosted; this page does not claim hosted CJIS readiness.',
    },
  ],
  painPointsHeadline: 'Problems clawql-surveillance solves',
  painPointsSubheadline:
    'These are the specific gaps the clawql-surveillance vertical targets — on top of ClawQL Core write-once audit patterns, optional public hash anchoring, access enforcement, and the supply chain signing infrastructure from clawql-release.',
  painPoints: [
    {
      title: 'Footage authentication depends on vendor assertion',
      body: 'Without hash at capture and Merkle chaining, "this is what the camera recorded" is an assertion the proponent cannot independently verify. Courts may treat this as an FRE 901(b)(9) problem. clawql-surveillance receives hardware attestation proofs from camera HSEs, incorporates them into a Merkle chain from ingestion, and can optionally anchor Merkle root hashes publicly so any party can verify the chain from that point forward without vendor cooperation. A hash proves integrity from the moment it was computed — not earlier capture events the system never saw.',
    },
    {
      title: 'Access logs can be cleaned up after unauthorized use',
      body: 'When audit logs are stored in mutable vendor infrastructure, unauthorized access — including documented patterns of officers using ALPR networks for personal interests — can be quietly addressed before it surfaces. Write-once storage and Merkle chaining make the audit log tamper-evident where configured. Unauthorized queries become durable records that are hard to silently rewrite; they do not magically surface themselves without operational review.',
    },
    {
      title: 'Case number requirements are optional and therefore meaningless',
      body: 'Across the industry, case number fields are often optional or advisory. The documented result is that many queries carry no case number — making unauthorized personal use harder to detect. clawql-surveillance blocks queries without valid case numbers at the system level. A search without a case number does not generate a result. It generates a permanent CASE_NUMBER_REJECTED audit event with the officer ID, timestamp, and agency.',
    },
    {
      title: 'Procurement integrity clauses need implementable infrastructure',
      body: 'Model contract language at github.com/danielsmithdevelopment/surveillance-evidence-integrity describes integrity capabilities many deployments still lack. clawql-surveillance is planned infrastructure to meet those requirements and to generate a machine-readable compliance report against each contract section that vendors can provide in procurement conversations and courts can reference in authentication hearings. Self-host for agency data.',
    },
    {
      title: "Accuracy certifications don't exist at meaningful standards",
      body: 'Published reporting has documented substantial misidentification error rates in some ALPR contexts (verify current sources). No court has established a universal acceptable floor. clawql-surveillance can ingest independent third-party accuracy certification results, optionally publish them alongside Merkle roots, and surface certification status in compliance reports and footage export chain-of-custody documentation. Vendors who commission independent testing can demonstrate results; vendors who do not cannot invent them.',
    },
  ],
  platformSubheadline:
    'Every vertical package composes these horizontal layers — security, audit, and supply chain integrity.',
  platformCapabilities: [
    'Write-once forensic audit — Merkle-chained, hash-linked, independently verifiable where Object Lock / WORM storage is configured; same architecture as ClawQL\'s inference audit trail',
    'Optional public hash anchoring — external immutable anchoring of Merkle root hashes; publicly verifiable by any party with the transaction ID',
    'Supply chain signing — Cosign-signed images, CycloneDX SBOM, startup hash verification via clawql-release; the audit infrastructure itself is verifiable',
    'Mandatory access enforcement — case number required on all queries; federal agency access logged with the same specificity as local agency access; unauthorized attempts blocked and recorded when write-once is configured',
    'Public verification API — no-auth endpoint for independent chain verification; designed for use by defense experts, courts, and journalists without vendor cooperation',
    'Hardware attestation receipt — accepts HSE attestation proofs from camera hardware and incorporates them into the Merkle chain at ingestion',
  ],
  domainToolsSubheadline: 'Registered when CLAWQL_SURVEILLANCE_ENABLED=1 (planned package enable flag):',
  domainTools: [
    {
      name: 'footage_ingest',
      description:
        'Receive a footage segment with hardware attestation proof, verify the attestation, record the segment hash, and append to the Merkle chain.',
    },
    {
      name: 'footage_verify',
      description:
        'Verify a footage file against the Merkle chain and optional public hash anchor. Returns a machine-readable verification result suitable for court production. Proves integrity from the hash/attestation point recorded at ingest — not events the system never observed.',
    },
    {
      name: 'footage_query',
      description:
        'Query footage with mandatory case number enforcement. Blocked queries generate a permanent CASE_NUMBER_REJECTED event.',
    },
    {
      name: 'footage_export',
      description:
        'Export footage with full chain of custody documentation — Merkle proof, optional public anchor transaction ID, attestation proof, and complete access history.',
    },
    {
      name: 'audit_log_query',
      description:
        'Query the access audit log by camera, time range, officer, agency, or case number. Returns tamper-evident results from the Merkle-chained log where write-once storage is configured.',
    },
    {
      name: 'merkle_verify',
      description:
        'Verify Merkle chain integrity from any entry forward. Produces a verification report for court or procurement use.',
    },
    {
      name: 'arweave_anchor_status',
      description:
        'Check optional public hash-anchoring status, retrieve transaction IDs for specific time ranges, and verify published roots against the local chain.',
    },
    {
      name: 'accuracy_report_ingest',
      description:
        'Ingest third-party accuracy certification results. Optionally published alongside Merkle roots.',
    },
    {
      name: 'contract_compliance_report',
      description:
        'Generate a machine-readable compliance report against each section of the model contract language. Publishable for procurement and court use.',
    },
    {
      name: 'federal_access_log',
      description:
        'Specialized logging for federal agency access events with mandatory agency identifier and authorization reference fields.',
    },
  ],
  documentTypes: [],
  useCasesSubheadline:
    'Procurement, authentication hearings, unauthorized-access detection, accuracy certification, and retrofit deployments — all on the same audit engine.',
  useCases: [
    {
      title: 'Procurement conversations vendors can win',
      body: 'The contract compliance report generates a section-by-section status against the model contract language. Vendors who meet the standards can produce it in procurement conversations. Vendors who do not can identify exactly which gaps to close. The report itself can be published as a hash-anchored record of compliance status at a specific point in time.',
    },
    {
      title: 'Authentication hearings with independent verification',
      body: 'When a defense expert requests verification of footage at issue, footage_verify() returns a Merkle proof and optional public anchor transaction ID that the expert can validate without requesting anything from the vendor. What the hash proves is integrity from the attestation/hash moment recorded at ingest onward — not a court outcome guarantee under FRE 901.',
    },
    {
      title: 'Unauthorized access that leaves a durable trail',
      body: 'When access logging is write-once and case numbers are mandatory, unauthorized personal use generates a durable record: the officer ID, the query, the timestamp, and the CASE_NUMBER_REJECTED or FOOTAGE_QUERY event with no associated case. Pattern analysis across the audit log can surface systematic misuse when agencies actually run those reviews — the trail makes silent rewrite harder; it does not make misuse impossible to overlook without operational diligence.',
    },
    {
      title: 'Accuracy certification that travels with footage',
      body: 'When footage is exported for court production, footage_export() includes the current accuracy certification status — error rate, certification date, testing organization, validity period, and optional public anchor transaction ID for the published certification. Defense counsel receives what they need to assess reliability alongside the footage itself.',
    },
    {
      title: 'Retrofitting existing deployments',
      body: 'For agencies operating camera networks that do not yet implement hash at capture at the hardware level, clawql-surveillance provides the planned audit layer for everything downstream — access logging, Merkle chaining, optional public hash anchoring, and mandatory case number enforcement — while the hardware attestation layer matures. Partial compliance is documented in the compliance report; the gap is explicit rather than hidden. Self-host agency data.',
    },
  ],
  examples: [],
  auditEventsSubheadline:
    'Every surveillance event can append a hash-chained entry to a write-once audit log where Object Lock / WORM storage is configured. MCP audit() is a session buffer only. Entries are not silently rewritable when write-once is enabled. All events carry a correlation_id linking to the inference call store when AI-assisted processing is involved.',
  auditEvents: [
    { event: 'FOOTAGE_INGESTED', trigger: 'New segment received and attestation verified' },
    { event: 'FOOTAGE_VERIFIED', trigger: 'Verification pass or fail against Merkle chain' },
    { event: 'FOOTAGE_QUERY', trigger: 'Search against footage or metadata — case number required' },
    { event: 'FOOTAGE_EXPORT', trigger: 'Footage exported to agency or court' },
    { event: 'FOOTAGE_FEDERAL_ACCESS', trigger: 'Federal agency access event' },
    { event: 'CASE_NUMBER_REJECTED', trigger: 'Query blocked — missing or invalid case number' },
    { event: 'UNAUTHORIZED_ACCESS_BLOCKED', trigger: 'Access attempt from unprovisioned agency or user' },
    { event: 'ATTESTATION_FAILED', trigger: 'Footage rejected — invalid HSE attestation proof' },
    { event: 'MERKLE_ROOT_COMPUTED', trigger: 'New Merkle root calculated' },
    { event: 'ARWEAVE_ANCHOR_CONFIRMED', trigger: 'Root hash published to public anchor store, transaction ID recorded' },
    { event: 'ACCURACY_REPORT_INGESTED', trigger: 'New third-party certification result recorded' },
    { event: 'CONTRACT_COMPLIANCE_VERIFIED', trigger: 'Compliance report generated' },
  ],
  complianceHeadline: 'Built for the standards courts are moving toward',
  compliance: [
    'Hash-chained write-once audit trail where configured — same architecture as ClawQL\'s inference and payment audit logs; independently verifiable; chain integrity verifiable by clawql surveillance audit verify',
    'Optional public hash anchoring — transaction IDs are permanent and publicly accessible without vendor cooperation; anchors are hashes of records',
    'Supply chain integrity — clawql-surveillance images are Cosign-signed with CycloneDX SBOM; startup hash verification via clawql doctor --smoke; the audit infrastructure\'s own provenance is verifiable',
    'Mandatory enforcement architecture — case number blocking and unauthorized agency blocking are structural controls, not policy recommendations; disabling them is itself an auditable configuration change when write-once is configured',
    'Public verification endpoint — GET /surveillance/verify/:arweave_tx_id requires no authentication; designed for use by any party without vendor involvement',
    'Self-hosted for agency data — keeps footage and audit logs on agency or vendor infrastructure; optional public hash anchoring is the only external dependency required. Not a claim of hosted CJIS readiness.',
  ],
  relatedResources: [
    {
      label: 'clawql-surveillance specification',
      href: 'https://docs.clawql.com/surveillance/clawql-surveillance',
    },
    {
      label: 'Model contract language',
      href: 'https://github.com/danielsmithdevelopment/surveillance-evidence-integrity/blob/main/model-contract-language.md',
    },
    {
      label: 'Technical standards',
      href: 'https://github.com/danielsmithdevelopment/surveillance-evidence-integrity/blob/main/technical-standards.md',
    },
    {
      label: 'For vendors',
      href: 'https://github.com/danielsmithdevelopment/surveillance-evidence-integrity/blob/main/FOR-VENDORS.md',
    },
    {
      label: 'challengethefootage.com',
      href: 'https://challengethefootage.com',
    },
    {
      label: 'WORM forensic audit reference',
      href: 'https://docs.clawql.com/security/audit-trail',
    },
    {
      label: 'Immutable releases — Arweave',
      href: 'https://docs.clawql.com/getting-started/immutable-releases',
    },
    {
      label: 'Modularization v2.1',
      href: 'https://docs.clawql.com/vision/modularization',
    },
  ],
  docsHref: 'https://docs.clawql.com/surveillance/clawql-surveillance',
  disclaimer:
    'clawql-surveillance is planned infrastructure for camera vendors and integrators. It does not operate cameras, collect footage, or provide law enforcement services. It does not claim hosted CJIS readiness — self-host agency data. Hash/attestation proofs establish integrity from the recorded hash point forward; they are not a guarantee of any particular FRE 901 court outcome. The same controls that authenticate footage also make unauthorized access harder to silently erase when write-once storage is configured — not impossible to overlook without operational review.',
  ctaHeadline: 'Ready to discuss ClawQL for surveillance?',
  ctaSubheadline:
    'Self-host the surveillance compose stack or contact us about vendor integration. Core audit patterns are available; the vertical package and hardware attestation integration are planned / scoped per camera vendor.',
  ctaSecondaryHref: 'https://docs.clawql.com/surveillance/clawql-surveillance',
  ctaSecondaryLabel: 'Technical specification',
  closingNote:
    'clawql-surveillance provides audit infrastructure. It does not operate surveillance cameras or provide law enforcement services. Camera vendors integrate their hardware; agencies configure access policy and self-host; ClawQL provides the durable record of what happened when write-once storage is configured.',
  demoPitchEyebrow: 'Share with agency or vendor staff',
  demoPitchHint:
    'Copy and send this to city attorneys, procurement leads, camera-vendor product teams, or tech evaluators before a briefing.',
}
