import type { Industry } from './types'

export const realEstateIndustry: Industry = {
  slug: 'real-estate',
  name: 'Real estate',
  headline: 'Document intelligence for property transactions.',
  subheadline:
    'Real estate workflows map to ClawQL’s mortgage module plus the eight-vendor IDP pipeline: title packages, purchase agreements, disclosures, and deal-room distribution — agents search, execute, redact, archive, and share without bespoke integrations per vendor.',
  packageName: 'clawql-lending (mortgage)',
  status: 'planned',
  overview:
    'Residential and commercial transactions generate dozens of PDFs per deal — purchase agreements, title commitments, appraisals, HOA disclosures, and closing statements — often arriving from email, Nextcloud, or a VDR with inconsistent naming and partial redaction. ClawQL treats the transaction as a document pipeline plus API surface: classify_document routes exhibits, run_idp_pipeline normalizes and redacts before archive, and knowledge_search_onyx grounds diligence questions in indexed content. MortgagePlugin tools (gse_validate, loan_archive, condition_clear) from clawql-lending overlap with financed purchases; Coneshare VDR share links and viewer webhooks close the loop when external parties access sensitive files.',
  painPoints: [
    {
      title: 'Diligence folders are opaque to agents',
      body: 'Associates and transaction coordinators re-read the same 200-page data room because prior extractions live in spreadsheets. extract_document returns grounded fields with char_interval provenance; memory_ingest threads deal notes across Cursor sessions.',
    },
    {
      title: 'PII leaks into search indexes',
      body: 'Borrower SSNs and account numbers in bank statements must not land in Onyx or Paperless without redaction. Stirling runs in the IDP pipeline before archive — agents never manually strip pages.',
    },
    {
      title: 'Vendor API sprawl per closing',
      body: 'Title, escrow, MLS, and e-signature APIs each ship multi-megabyte OpenAPI. search returns ranked operationIds; execute validates args — the same pattern as production ClawQL case studies.',
    },
  ],
  platformCapabilities: [
    'Eight-vendor IDP pipeline with Gotenberg normalization and Stirling PII redaction',
    'Grounded extraction via extract_document with char_interval citations',
    'Coneshare VDR share links with viewer activity webhooks',
    'Vault memory for deal-room notes, cleared title exceptions, and party contacts',
    'notify milestones to Slack or email when external viewers open sensitive docs',
  ],
  domainTools: [
    { name: 'gse_validate', description: 'Validate financed purchase data against agency guidelines when mortgage module is enabled.' },
    { name: 'loan_archive', description: 'Tag and archive transaction packages with correspondent and property metadata.' },
    { name: 'condition_clear', description: 'Record cleared title or underwriting conditions with vault threading.' },
    { name: 'pii_redact', description: 'Strip borrower and tenant PII before documents enter search indexes.' },
    { name: 'notify_underwriting', description: 'Alert internal teams when diligence milestones complete or exceptions arise.' },
  ],
  documentTypes: [
    'Purchase and sale agreements',
    'Title commitments and title policies',
    'Appraisals and inspection reports',
    'HOA and condo disclosure packages',
    'Closing disclosures and settlement statements',
  ],
  useCases: [
    {
      title: 'Transaction document packages',
      body: 'Ingest deeds, title reports, appraisals, and disclosure PDFs through run_idp_pipeline — normalize to PDF, redact PII, archive with metadata, and index for hybrid search during buyer and lender diligence.',
    },
    {
      title: 'Grounded field extraction',
      body: 'extract_document returns purchase-price, closing-date, earnest-money, and party fields with char_interval provenance — grounded extraction for contracts and leases, not free-form LLM guesses.',
    },
    {
      title: 'Secure deal-room distribution',
      body: 'Coneshare VDR share links and viewer webhooks close the loop — agents notify Slack when external parties open sensitive transaction documents so coordinators can follow up in real time.',
    },
    {
      title: 'Cross-deal precedent recall',
      body: 'memory_recall surfaces prior vault notes on similar property types, title exceptions, or seller reps — brokers and counsel start from institutional memory instead of blank threads.',
    },
  ],
  examples: [
    {
      title: 'Purchase agreement → archive → search',
      summary: 'Nextcloud intake through full IDP chain with Onyx indexing.',
      body: 'A coordinator drops a PSA and exhibits into Nextcloud; an agent orchestrates classification, normalization, redaction, and search indexing — the standard diligence intake pattern.',
      tools: ['run_idp_pipeline', 'classify_document', 'knowledge_search_onyx'],
      steps: [
        { label: 'Intake', detail: 'Nextcloud webhook or manual upload triggers run_idp_pipeline with deal_id metadata.' },
        { label: 'Classify', detail: 'classify_document routes PSA vs appraisal vs disclosure — selects extraction schema per type.' },
        { label: 'Normalize & redact', detail: 'Gotenberg converts Office exhibits; Stirling strips borrower PII before archive.' },
        { label: 'Ground diligence', detail: 'knowledge_search_onyx answers "indemnity cap" or "closing date" with indexed snippets and paths.' },
      ],
    },
    {
      title: 'Multi-doc closing package',
      summary: 'search → execute across title and escrow APIs without spec dumps.',
      body: 'Agents discover the right operationId per hop for recording fees, payoff requests, and wire instructions — validated server-side calls replace pasted OpenAPI in chat.',
      tools: ['search', 'execute', 'memory_ingest'],
      steps: [
        { label: 'Discover', detail: 'search "escrow payoff request" returns ranked operationIds from bundled providers.' },
        { label: 'Execute', detail: 'execute calls with bearer tokens from env — args validated against OpenAPI schema.' },
        { label: 'Extract fields', detail: 'extract_document on payoff letter returns grounded balance and per-diem with citations.' },
        { label: 'Thread context', detail: 'memory_ingest appends wire-instruction confirmation with wikilinks to the deal note.' },
      ],
    },
    {
      title: 'Transaction room with notify',
      summary: 'Coneshare share link plus Slack milestone for the closing team.',
      body: 'After archive, agents create a VDR share link and post notify when external counsel first opens the title package.',
      tools: ['execute', 'notify', 'audit'],
      steps: [
        { label: 'Archive', detail: 'loan_archive tags [transaction, property-{id}] in Paperless or native archive.' },
        { label: 'Share', detail: 'execute Coneshare create-share with expiry and viewer restrictions.' },
        { label: 'Notify', detail: 'notify posts to #closing-deals with Onyx and Paperless deep links.' },
        { label: 'Audit', detail: 'audit captures share creation and viewer webhook events with correlation_id.' },
      ],
    },
    {
      title: 'Title exception HITL review',
      summary: 'Low-confidence schedule B items route to human review.',
      body: 'When classify or extract confidence is low on title exceptions, hitl_enqueue_label_studio sends items to a coordinator queue before they enter the vault.',
      tools: ['hitl_enqueue_label_studio', 'memory_ingest', 'workflow'],
      steps: [
        { label: 'Flag', detail: 'classify_document scores title commitment schedule B below threshold.' },
        { label: 'Enqueue', detail: 'hitl_enqueue_label_studio creates Label Studio task with exception text highlighted.' },
        { label: 'Review', detail: 'Coordinator confirms exception type and curative path; webhook validates token.' },
        { label: 'Persist', detail: 'memory_ingest appends cleared vs outstanding exceptions with wikilinks to title note.' },
      ],
    },
  ],
  compliance: [
    'PII redaction before documents enter archive or search indexes',
    'Immutable audit breadcrumbs for agent actions on sensitive files',
    'Self-hosted option keeps transaction docs on your infrastructure',
    'VDR viewer activity can trigger webhook-driven review workflows',
    'Planned vertical RLS scopes agents to deal teams and ethical walls',
  ],
  relatedResources: [
    { label: 'IDP pipeline reference', href: 'https://docs.clawql.com/providers/idp-pipeline' },
    { label: 'Modularization v2.1 — MortgagePlugin', href: 'https://docs.clawql.com/vision/modularization' },
    { label: 'Security overview', href: 'https://docs.clawql.com/security' },
    { label: 'Coneshare VDR integration', href: 'https://docs.clawql.com/providers/idp-pipeline' },
  ],
  docsHref: 'https://docs.clawql.com/providers/idp-pipeline',
  disclaimer:
    'Real estate examples describe target workflows from modularization v2.1 — not legal or title advice. Verify recording and disclosure rules for your jurisdiction.',
}
