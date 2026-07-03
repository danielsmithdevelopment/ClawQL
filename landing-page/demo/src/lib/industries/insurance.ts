import type { Industry } from './types'

export const insuranceIndustry: Industry = {
  slug: 'insurance',
  name: 'Insurance',
  headline: 'Claims and policy intelligence on one MCP surface.',
  subheadline:
    'The planned clawql-insurance vertical targets carriers, brokers, and MGAs: claim extraction, policy analysis, loss-run reconciliation, and fraud signals — with HIPAA/SOC2-friendly redaction and Merkle audit trails on the same gateway as lending and healthcare.',
  packageName: 'clawql-insurance',
  status: 'planned',
  overview:
    'Insurance operations span FNOL intake, adjuster reports, policy endorsements, loss runs, and SIU referrals — often across legacy policy admin systems, document portals, and Slack war rooms. clawql-insurance registers claim_extract, policy_analyze, loss_run_reconcile, fraud_flag, payout_validate, and coverage_check on the ClawQL gateway. The same IDP pipeline parses unstructured claim packets; extract_document returns grounded policy limits and injury fields; fraud_flag composes with memory_recall of prior claim patterns. Merkle audit trails (modularization v2.1) anchor claim-processing provenance for carrier compliance teams.',
  painPoints: [
    {
      title: 'FNOL packets are unstructured',
      body: 'Photos, police reports, and medical bills arrive as heterogeneous PDFs. classify_document routes health vs P&C vs commercial lines before extraction schema selection.',
    },
    {
      title: 'Loss runs don’t match policy systems',
      body: 'Carrier statements need reconciliation against internal books. loss_run_reconcile compares extracted rows; search discovers carrier API operations without spec dumps.',
    },
    {
      title: 'Fraud signals lack durable context',
      body: 'SIU analysts re-derive prior claim patterns every time a file reopens. memory_recall surfaces explicit, permissioned prior incidents via ATR-scoped vault notes.',
    },
  ],
  platformCapabilities: [
    'Claim and policy extraction with grounded char_interval provenance',
    'Loss-run reconciliation against internal policy systems',
    'Fraud scoring with HITL routing to SIU via Argo suspend/resume',
    'HIPAA and SOC2-oriented redaction paths in the IDP pipeline',
    'Merkle audit trails for claim-processing provenance',
  ],
  domainTools: [
    { name: 'claim_extract', description: 'Extract claimant, injury, and loss details from FNOL and adjuster reports.' },
    { name: 'policy_analyze', description: 'Compare endorsements against master policy text indexed in Onyx.' },
    { name: 'loss_run_reconcile', description: 'Match carrier loss-run rows to internal policy and claim records.' },
    { name: 'fraud_flag', description: 'Score claims against pattern libraries and cross-claim signals.' },
    { name: 'payout_validate', description: 'Validate reserve and payment amounts against policy limits.' },
    { name: 'coverage_check', description: 'Confirm coverage applies to reported loss type and jurisdiction.' },
  ],
  documentTypes: [
    'First notice of loss (FNOL) packets',
    'Adjuster reports and investigation notes',
    'Policy declarations and endorsements',
    'Loss runs and carrier statements',
    'Medical bills and police reports (P&C and health lines)',
  ],
  useCases: [
    {
      title: 'First notice of loss automation',
      body: 'Agents parse FNOL packets and supporting photos through the IDP pipeline, extract_document returns grounded policy and claimant fields, and classify_document routes health vs P&C vs commercial lines.',
    },
    {
      title: 'Loss run reconciliation',
      body: 'loss_run_reconcile compares carrier statements against internal policy systems — search discovers the right API operations; execute runs validated calls without pasting multi-megabyte carrier specs.',
    },
    {
      title: 'Fraud and coverage checks',
      body: 'fraud_flag and coverage_check tools compose with memory_recall of prior claim patterns — cross-vertical recall stays explicit and permissioned via ATR claims.',
    },
    {
      title: 'Endorsement and renewal review',
      body: 'policy_analyze diffs endorsement PDFs against master policy text; memory_ingest captures underwriter decisions for the next renewal cycle.',
    },
  ],
  examples: [
    {
      title: 'Claim packet → extract → adjudicate',
      summary: 'Docling parse through reserve update and Slack notify.',
      body: 'Docling parses adjuster reports; extract_document surfaces injury and policy limits; agents execute carrier APIs for reserve updates and post notify milestones.',
      tools: ['execute', 'extract_document', 'claim_extract', 'notify', 'audit'],
      steps: [
        { label: 'Parse', detail: 'run_idp_pipeline on FNOL packet — classify_document routes line of business.' },
        { label: 'Extract', detail: 'claim_extract returns injury description, policy limits, and deductible with citations.' },
        { label: 'Adjudicate', detail: 'execute carrier reserve API with validated args; payout_validate checks limits.' },
        { label: 'Notify', detail: 'notify posts milestone to #claims with audit correlation_id.' },
      ],
    },
    {
      title: 'Policy endorsement review',
      summary: 'Onyx-grounded diff against master policy.',
      body: 'policy_analyze compares endorsement PDFs against master policy text indexed in Onyx; memory_ingest captures underwriter decisions.',
      tools: ['knowledge_search_onyx', 'policy_analyze', 'memory_ingest', 'search'],
      steps: [
        { label: 'Index', detail: 'Master policy and prior endorsements indexed via IDP pipeline into Onyx.' },
        { label: 'Analyze', detail: 'policy_analyze diffs new endorsement limits and exclusions against master.' },
        { label: 'Search', detail: 'knowledge_search_onyx retrieves conflicting clauses from prior renewals.' },
        { label: 'Decide', detail: 'memory_ingest appends underwriter approval with wikilinks to policy note.' },
      ],
    },
    {
      title: 'SIU referral on fraud signals',
      summary: 'Argo HITL pattern — same as lending workflows.',
      body: 'fraud_flag raises a score; hitl_enqueue_label_studio routes high-risk claims to SIU; workflow suspends until review completes.',
      tools: ['workflow', 'fraud_flag', 'hitl_enqueue_label_studio', 'memory_recall'],
      steps: [
        { label: 'Score', detail: 'fraud_flag combines pattern match and memory_recall of prior related claims.' },
        { label: 'Route', detail: 'Score above threshold → hitl_enqueue_label_studio SIU review project.' },
        { label: 'Suspend', detail: 'workflow suspends adjudication until SIU webhook confirms decision.' },
        { label: 'Resume', detail: 'Approved or referred path continues; Merkle audit anchors provenance chain.' },
      ],
    },
    {
      title: 'Loss run reconciliation batch',
      summary: 'Carrier statement vs internal books.',
      body: 'Agents parse carrier loss-run PDFs, reconcile rows with loss_run_reconcile, and execute policy-system updates for mismatches.',
      tools: ['loss_run_reconcile', 'search', 'execute', 'audit'],
      steps: [
        { label: 'Parse', detail: 'extract_document on loss-run PDF returns tabular loss rows with provenance.' },
        { label: 'Reconcile', detail: 'loss_run_reconcile matches claim numbers and incurred amounts to internal DB.' },
        { label: 'Fix', detail: 'search + execute updates policy admin APIs for unmatched rows.' },
        { label: 'Audit', detail: 'audit logs batch_id and row-level reconciliation outcomes.' },
      ],
    },
  ],
  compliance: [
    'HIPAA and SOC2-oriented redaction paths in the IDP pipeline',
    'Merkle audit trails for claim-processing provenance (modularization v2.1)',
    'Dedicated managed hosting for carrier workload isolation',
    '32-module security curriculum for SOC 2 evidence collection',
    'Planned ATR scoping for claims adjuster vs SIU agent roles',
  ],
  relatedResources: [
    { label: 'Modularization v2.1 — clawql-insurance', href: 'https://docs.clawql.com/vision/modularization' },
    { label: 'Security overview', href: 'https://docs.clawql.com/security' },
    { label: 'IDP pipeline reference', href: 'https://docs.clawql.com/providers/idp-pipeline' },
    { label: 'Argo HITL workflows', href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/deployment/samples/lending-w2' },
  ],
  docsHref: 'https://docs.clawql.com/security',
  disclaimer:
    'Insurance tools are planned — not underwriting or claims-handling advice. State filing and licensing requirements remain the carrier’s responsibility.',
}
