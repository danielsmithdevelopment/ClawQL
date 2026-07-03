export type IndustryExample = {
  title: string
  body: string
  tools: readonly string[]
}

export type Industry = {
  slug: string
  name: string
  headline: string
  subheadline: string
  /** Planned package name from modularization v2.1 */
  packageName: string
  status: 'shipped' | 'partial' | 'planned'
  useCases: readonly { title: string; body: string }[]
  examples: readonly IndustryExample[]
  compliance: readonly string[]
  docsHref: string
  disclaimer?: string
}

export const industries: readonly Industry[] = [
  {
    slug: 'lending',
    name: 'Lending',
    headline: 'Agent-native lending and mortgage operations.',
    subheadline:
      'ClawQL’s lending vertical (clawql-lending) composes the IDP pipeline, vault memory, HITL review, and workflow automation for loan origination — W-2s, income docs, and underwriting packages without pasting specs or losing audit trails.',
    packageName: 'clawql-lending',
    status: 'partial',
    useCases: [
      {
        title: 'Income document ingestion',
        body: 'Parse W-2s and pay stubs with Docling, classify by document type, route low-confidence extractions to Label Studio, and archive tagged outcomes for underwriters.',
      },
      {
        title: 'Underwriting memory across sessions',
        body: 'memory_recall surfaces prior borrower conditions, cleared stipulations, and vendor notes — underwriters do not re-derive context every time a loan file reopens.',
      },
      {
        title: 'Compliance-aware automation',
        body: 'Shared compliance plugins target Reg Z, ECOA, and fair-lending guardrails. audit logs structured MCP events; dedicated managed hosting isolates tenant workloads.',
      },
    ],
    examples: [
      {
        title: 'W-2 intake with confidence routing',
        body: 'Agent executes docling_convert_file on a synthetic W-2, calls classify_document, and enqueues hitl_enqueue_label_studio when confidence is below threshold. Label Studio webhook persists the reviewer decision via memory_ingest.',
        tools: ['execute', 'classify_document', 'hitl_enqueue_label_studio', 'memory_ingest'],
      },
      {
        title: 'Argo suspend / resume for HITL',
        body: 'workflow submits clawql-lending-w2-ingest; the template suspends on low confidence. After human review, workflow resume continues the pipeline — same pattern as the shipped lending W-2 reference pack.',
        tools: ['workflow', 'hitl_enqueue_label_studio', 'memory_recall'],
      },
      {
        title: 'One-command local lending stack',
        body: 'docker compose -f lending.compose.yml brings up MCP, Docling, classifier, LangExtract demo, and Label Studio CE for POC underwriting flows — documented in the repo compose README.',
        tools: ['search', 'execute', 'audit'],
      },
    ],
    compliance: [
      'PII redaction via Stirling in the IDP pipeline before archive',
      'Structured audit ring buffer plus optional vault postmortems',
      'Vertical RLS and ATR scoping planned via clawql-auth (modularization v2.1)',
      'Cosign-signed images and Kyverno admission on self-hosted Helm',
    ],
    docsHref: 'https://docs.clawql.com/vision/modularization',
    disclaimer:
      'Lending compose stacks and W-2 samples use synthetic data only — not tax, legal, or underwriting advice. Train tenant-specific models before production.',
  },
  {
    slug: 'real-estate',
    name: 'Real estate',
    headline: 'Document intelligence for property transactions.',
    subheadline:
      'Real estate workflows map to ClawQL’s mortgage module plus the eight-vendor IDP pipeline: title packages, purchase agreements, disclosures, and deal-room distribution — agents search, execute, redact, archive, and share without bespoke integrations per vendor.',
    packageName: 'clawql-lending (mortgage)',
    status: 'planned',
    useCases: [
      {
        title: 'Transaction document packages',
        body: 'Ingest deeds, title reports, appraisals, and disclosure PDFs through run_idp_pipeline — normalize to PDF, redact PII, archive with metadata, and index for hybrid search.',
      },
      {
        title: 'Grounded field extraction',
        body: 'extract_document returns purchase-price, closing-date, and party fields with char_interval provenance — grounded extraction for contracts and leases, not free-form LLM guesses.',
      },
      {
        title: 'Secure deal-room distribution',
        body: 'Coneshare VDR share links and viewer webhooks close the loop — agents notify Slack when external parties open sensitive transaction documents.',
      },
    ],
    examples: [
      {
        title: 'Purchase agreement → archive → search',
        body: 'Nextcloud intake triggers classify_document routing; Gotenberg normalizes Office exhibits; Stirling redacts borrower PII; Onyx indexes content for knowledge_search_onyx during diligence.',
        tools: ['run_idp_pipeline', 'classify_document', 'knowledge_search_onyx'],
      },
      {
        title: 'Multi-doc closing package',
        body: 'Agents search bundled vendor APIs for the right operationId per hop instead of pasting OpenAPI — the same search → execute pattern used in production case studies, applied to title and escrow APIs in the merge.',
        tools: ['search', 'execute', 'memory_ingest'],
      },
      {
        title: 'Transaction room with notify',
        body: 'After archive, agents create a Coneshare share link and post a notify milestone to the deal channel with Paperless and Onyx links for the closing team.',
        tools: ['execute', 'notify', 'audit'],
      },
    ],
    compliance: [
      'PII redaction before documents enter archive or search indexes',
      'Immutable audit breadcrumbs for agent actions on sensitive files',
      'Self-hosted option keeps transaction docs on your infrastructure',
      'VDR viewer activity can trigger webhook-driven review workflows',
    ],
    docsHref: 'https://docs.clawql.com/providers/idp-pipeline',
    disclaimer:
      'Real estate examples describe target workflows from modularization v2.1 — not legal or title advice. Verify recording and disclosure rules for your jurisdiction.',
  },
  {
    slug: 'healthcare',
    name: 'Healthcare',
    headline: 'HIPAA-aware clinical document processing.',
    subheadline:
      'The planned clawql-healthcare vertical extends ClawQL’s document pipeline for FHIR bundles, HL7 messages, DICOM imaging, and clinical notes — PHI de-identification, structured extraction, and audit trails on the same MCP gateway as the rest of your stack.',
    packageName: 'clawql-healthcare',
    status: 'planned',
    useCases: [
      {
        title: 'Clinical document structuring',
        body: 'Parse discharge summaries and referral letters with Docling/Tika, de-identify PHI before persistence, and archive with correspondent and document-type metadata agents can query later.',
      },
      {
        title: 'Interop without spec dumps',
        body: 'search surfaces FHIR and HL7 operations from bundled providers; execute calls run with validated args — keeping planning context lean when agents touch EHR or imaging APIs.',
      },
      {
        title: 'Human review on low confidence',
        body: 'hitl_enqueue_label_studio routes ambiguous extractions — for example diagnosis coding or medication fields — to clinical reviewers before results enter the vault or downstream systems.',
      },
    ],
    examples: [
      {
        title: 'Clinical PDF → redact → archive',
        body: 'run_idp_pipeline chains intake through Stirling PII redaction and the archive layer; agents recall prior patient-context runbooks from the vault without storing PHI in the chat transcript.',
        tools: ['run_idp_pipeline', 'memory_recall', 'audit'],
      },
      {
        title: 'FHIR bundle extraction',
        body: 'Agent searches for FHIR read/search operations, executes with scoped credentials, and ingests a de-identified summary to the vault with wikilinks — durable context for care-coordination workflows.',
        tools: ['search', 'execute', 'memory_ingest'],
      },
      {
        title: 'Radiology metadata (planned)',
        body: 'dicom_analyze and medical_image_analyze tools from clawql-healthcare will expose imaging metadata to agents under HIPAA-friendly redaction policies — documented in modularization v2.1.',
        tools: ['search', 'execute', 'deidentify'],
      },
    ],
    compliance: [
      'HIPAA-oriented de-identification via IDP redaction stage (Stirling)',
      '6-year audit retention targets for PHI-handling tenants (security curriculum)',
      'Dedicated managed hosting for workload isolation',
      '32-module security curriculum maps controls to HIPAA evidence collection',
    ],
    docsHref: 'https://docs.clawql.com/security',
    disclaimer:
      'Healthcare vertical tools are planned — not medical advice. BAAs, BRA processes, and production PHI handling require your compliance review.',
  },
  {
    slug: 'legal',
    name: 'Legal',
    headline: 'Contract intelligence with privilege-aware automation.',
    subheadline:
      'The planned clawql-legal vertical adds clause extraction, precedent search, privilege redaction, and filing validation on ClawQL’s IDP pipeline — agents handle due diligence and litigation support without leaking attorney-client material into prompts or vault notes.',
    packageName: 'clawql-legal',
    status: 'planned',
    useCases: [
      {
        title: 'Due diligence at scale',
        body: 'Ingest data-room PDFs, extract clauses and risk flags with provenance, and recall prior deal patterns from the vault — associates start from indexed precedent instead of re-reading every exhibit.',
      },
      {
        title: 'Privilege-safe redaction',
        body: 'redact_privilege and Stirling PII stages strip sensitive content before documents enter archive or enterprise search — ethical walls enforced by vertical RLS and ATR scoping (modularization v2.1).',
      },
      {
        title: 'Litigation timelines and drafts',
        body: 'timeline_generate and brief_draft tools compose structured outputs from ingested discovery — human attorneys review; agents handle retrieval, citation gathering, and first-pass organization.',
      },
    ],
    examples: [
      {
        title: 'M&A data room intake',
        body: 'run_idp_pipeline normalizes seller disclosures; classify_document routes contracts vs financials; extract_document returns party and indemnity fields with char_interval citations for associate review.',
        tools: ['run_idp_pipeline', 'classify_document', 'extract_document'],
      },
      {
        title: 'Precedent search across matters',
        body: 'memory_recall with elevated graph depth surfaces prior vault notes on similar clauses; knowledge_search_onyx queries the firm index — agents cite paths and snippets, not model improvisation.',
        tools: ['memory_recall', 'knowledge_search_onyx', 'audit'],
      },
      {
        title: 'Privilege review queue',
        body: 'Low-confidence privilege calls route to hitl_enqueue_label_studio; reviewer decisions append to the vault via memory_ingest with wikilinks to the matter file.',
        tools: ['hitl_enqueue_label_studio', 'memory_ingest', 'audit'],
      },
    ],
    compliance: [
      'Attorney-client privilege redaction before archive and search',
      'Ethical-wall and matter-scoping via planned vertical RLS',
      'Immutable audit trails for agent actions on client documents',
      'Self-hosted deployment keeps matter files on firm-controlled infrastructure',
    ],
    docsHref: 'https://docs.clawql.com/vision/modularization',
    disclaimer:
      'Legal workflows are planned — not legal advice. Privilege, ethical-wall, and e-discovery rules require qualified counsel and tenant configuration.',
  },
  {
    slug: 'insurance',
    name: 'Insurance',
    headline: 'Claims and policy intelligence on one MCP surface.',
    subheadline:
      'The planned clawql-insurance vertical targets carriers, brokers, and MGAs: claim extraction, policy analysis, loss-run reconciliation, and fraud signals — with HIPAA/SOC2-friendly redaction and Merkle audit trails on the same gateway as lending and healthcare.',
    packageName: 'clawql-insurance',
    status: 'planned',
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
    ],
    examples: [
      {
        title: 'Claim packet → extract → adjudicate',
        body: 'Docling parses adjuster reports; extract_document surfaces injury and policy limits; agents execute carrier APIs for reserve updates and post notify milestones to the claims Slack channel.',
        tools: ['execute', 'extract_document', 'notify', 'audit'],
      },
      {
        title: 'Policy endorsement review',
        body: 'policy_analyze compares endorsement PDFs against master policy text indexed in Onyx; memory_ingest captures underwriter decisions for the next renewal cycle.',
        tools: ['knowledge_search_onyx', 'memory_ingest', 'search'],
      },
      {
        title: 'SIU referral on fraud signals',
        body: 'fraud_flag raises a score; hitl_enqueue_label_studio routes high-risk claims to SIU; workflow suspends until review completes — same Argo HITL pattern as lending.',
        tools: ['workflow', 'hitl_enqueue_label_studio', 'memory_recall'],
      },
    ],
    compliance: [
      'HIPAA and SOC2-oriented redaction paths in the IDP pipeline',
      'Merkle audit trails for claim-processing provenance (modularization v2.1)',
      'Dedicated managed hosting for carrier workload isolation',
      '32-module security curriculum for SOC 2 evidence collection',
    ],
    docsHref: 'https://docs.clawql.com/security',
    disclaimer:
      'Insurance tools are planned — not underwriting or claims-handling advice. State filing and licensing requirements remain the carrier’s responsibility.',
  },
  {
    slug: 'education',
    name: 'Education',
    headline: 'Faculty productivity and LMS-connected agents.',
    subheadline:
      'The planned clawql-education vertical connects Canvas, Moodle, and Blackboard with syllabus generation, rubric scaffolding, and progress analysis — course content and student data stay behind the same MCP gateway, audit, and vault policies as the rest of ClawQL.',
    packageName: 'clawql-education',
    status: 'planned',
    useCases: [
      {
        title: 'Course content scaffolding',
        body: 'syllabus_generate and content_scaffold produce draft outlines from department templates; faculty edit and memory_ingest approved versions so the next semester recalls institutional style guides.',
      },
      {
        title: 'LMS sync without bespoke scripts',
        body: 'lms_sync and search → execute against bundled LMS APIs publish assignments and rubrics — agents discover operationIds instead of pasting entire OpenAPI exports into chat.',
      },
      {
        title: 'Adaptive learning signals',
        body: 'progress_analyze aggregates anonymized outcomes; agents recall prior intervention notes from the vault when TAs pick up mid-semester without full handoff meetings.',
      },
    ],
    examples: [
      {
        title: 'Syllabus → Canvas publish',
        body: 'Agent drafts syllabus sections, ingests the approved version to the vault, searches Canvas REST operations, and executes course-module creates with validated args.',
        tools: ['memory_ingest', 'search', 'execute'],
      },
      {
        title: 'Rubric generation with HITL',
        body: 'rubric_create proposes criteria; instructor reviews in Label Studio via hitl_enqueue_label_studio; finalized rubric syncs through lms_sync.',
        tools: ['hitl_enqueue_label_studio', 'execute', 'audit'],
      },
      {
        title: 'Cross-semester recall',
        body: 'memory_recall surfaces prior course postmortems and accommodation notes — a new TA thread inherits department context without copying last year’s chat logs.',
        tools: ['memory_recall', 'memory_ingest', 'cache'],
      },
    ],
    compliance: [
      'FERPA-aware handling — student PII redacted before vault persistence',
      'Self-hosted option for institutions that cannot send LMS data to third-party SaaS',
      'Role-scoped ATR for faculty vs student-facing agent tools (planned)',
      'Audit breadcrumbs for agent-published gradebook or content changes',
    ],
    docsHref: 'https://docs.clawql.com/vision/modularization',
    disclaimer:
      'Education vertical tools are planned — not academic policy advice. FERPA, accessibility, and institutional review requirements vary by jurisdiction and school.',
  },
] as const

export const industriesBySlug = Object.fromEntries(industries.map((industry) => [industry.slug, industry])) as Record<
  string,
  Industry
>

export function getIndustry(slug: string): Industry | undefined {
  return industriesBySlug[slug]
}
