import type { Industry } from './types'

export const realEstateIndustry: Industry = {
  slug: 'real-estate',
  name: 'Real estate',
  headline: 'The intelligent document layer for property transactions.',
  subheadline:
    'Unify deal documents, extracted fields, and transaction memory in one place — without replacing your brokerage CRM, cloud storage, or transaction platform. ClawQL classifies title commitments and purchase agreements, routes Schedule B exceptions to human review, and answers diligence questions with grounded citations.',
  packageName: 'real-estate transaction samples',
  status: 'partial',
  statusLabel: 'Title + PSA workflows shipped · CRM-agnostic integration',
  productionReference:
    'Shipped reference workflows mirror the lending W-2 pattern used for See The Greens LOS — parse, classify, extract, HITL, vault recall — applied to transaction coordinators at any brokerage running an all-in-one CRM or a best-of-breed stack.',
  marketContext:
    'Major brokerages standardize on different CRM operating systems — Keller Williams (Command), eXp (BoldTrail/kvCORE), Compass and Anywhere brands (Home Platform), and thousands of high-volume teams on Follow Up Boss — but none of them classify title commitments, extract Schedule B exceptions with citations, or answer cross-deal diligence questions from indexed transaction files. AI investment in 2026 skews toward lead gen, listing copy, and routing; the transaction coordination layer — where deals actually close — still runs on Google Drive folders and manual re-reads. Teams that add an intelligent document layer first compress coordinator hours per file; brokerages that wait inherit a compounding disadvantage as competitors build institutional memory deal by deal.',
  demoPitch:
    'Every major brokerage runs a CRM for contacts and pipeline, a transaction tool for e-sign and compliance, and Google Drive or Dropbox for transaction folders — but nothing connects them intelligently. When a title commitment or PSA lands in a deal folder, ClawQL classifies it, extracts purchase price and Schedule B exceptions with citations, routes low-confidence reads to a coordinator for review, and indexes everything for semantic search — so teams stop re-reading the same 200-page diligence folder. Your CRM keeps contacts and compliance; your storage keeps the files; ClawQL is the layer that understands what is in the documents and remembers it across deals. Works alongside Command, BoldTrail, Follow Up Boss, Compass, Dotloop, or SkySlope — no migration required. Live demo uses synthetic data only; early access includes founder-led setup.',
  stackPlacement: [
    {
      system: 'Brokerage CRM',
      role: 'Contacts, pipeline, lead routing — Command, BoldTrail/kvCORE, Follow Up Boss, Compass Home Platform, Lofty, etc. ClawQL does not replace your CRM.',
    },
    {
      system: 'Cloud storage',
      role: 'Transaction folders (Google Drive, Dropbox, SharePoint) — agents keep vendor independence; ClawQL adds intelligence on top.',
    },
    {
      system: 'Transaction / e-sign',
      role: 'Dotloop, SkySlope, DocuSign Rooms, Paperless Pipeline — forms, signatures, broker compliance checklists.',
    },
    {
      system: 'ClawQL',
      role: 'Classify, extract, redact PII, semantic search, vault memory, Coneshare VDR — the document intelligence layer no CRM ships today.',
    },
  ],
  overview:
    'Residential transactions generate dozens of PDFs per deal — purchase agreements, title commitments, appraisals, HOA disclosures — often split across a brokerage CRM (pipeline), cloud storage (folders), and a transaction platform (e-sign). Coordinators re-read the same files because nothing shares a semantic index, regardless of franchise. ClawQL is the intelligent document layer: shipped reference packs for title commitments and PSAs demonstrate parse → classify → extract → HITL → vault threading with deal_id metadata. Financed purchases can reuse clawql-lending mortgage tools; Coneshare VDR closes the loop when external parties access sensitive files.',
  painPoints: [
    {
      title: 'CRM knows the deal — folders hold the files',
      body: 'Brokerage CRMs track contacts and pipeline stages, but Drive folders do not classify, extract, or link back to the deal record. Coordinators manually match filenames to transactions and re-open PDFs for every question — at every franchise.',
    },
    {
      title: 'Schedule B exceptions need human judgment',
      body: 'Title commitments arrive with exceptions that require curative review — not fully automatable. classify_document and extract_document surface Schedule B items; hitl_enqueue_label_studio routes ambiguous exceptions to coordinators before they enter the vault.',
    },
    {
      title: 'Cross-deal memory lives in someone\'s head',
      body: '"How did we handle this utility easement last time?" has no answer in CRM or storage. memory_recall threads title exceptions, cleared conditions, and party notes across sessions with wikilinks per deal_id.',
    },
  ],
  platformCapabilities: [
    'Shipped title commitment + PSA reference workflows (Argo suspend/resume + Label Studio HITL)',
    'CRM-agnostic — works with Command, BoldTrail, Follow Up Boss, Compass, or custom stacks',
    'classify_document labels: title_commitment, purchase_agreement, appraisal, hoa_disclosure',
    'extract_document presets with char_interval citations for PSA and Schedule A/B fields',
    'Eight-vendor IDP pipeline — Gotenberg normalization, Stirling PII redaction, Onyx search',
    'Coneshare VDR share links with viewer activity webhooks for external counsel and lenders',
  ],
  domainTools: [
    { name: 'classify_document', description: 'Route PSA vs title commitment vs appraisal before extraction schema selection.' },
    { name: 'extract_document', description: 'Grounded fields: purchase_price, earnest_money, closing_date, Schedule B exceptions.' },
    { name: 'workflow', description: 'Submit clawql-realestate-title-ingest or clawql-realestate-psa-ingest with deal_id.' },
    { name: 'hitl_enqueue_label_studio', description: 'Schedule B exception review or PSA field confirmation with auto-resume.' },
    { name: 'memory_recall / memory_ingest', description: 'Thread deal notes — [[Deal {id}]], [[Title — {id}]], [[PSA — {id}]].' },
    { name: 'loan_archive', description: 'Financed purchases: tag transaction packages when mortgage module is enabled.' },
  ],
  documentTypes: [
    'Purchase and sale agreements',
    'Title commitments (Schedule A + B)',
    'Appraisals and inspection reports',
    'HOA and condo disclosure packages',
    'Closing disclosures and settlement statements',
  ],
  useCases: [
    {
      title: 'Title commitment intake',
      body: 'Parse title commitments with Docling, classify Schedule B routing, extract policy amount and exceptions with citations, HITL when confidence is low — vault note links to the deal_id used in your folder naming convention.',
    },
    {
      title: 'PSA field extraction',
      body: 'Extract purchase price, earnest money, closing date, and parties from purchase agreements — cross-check against title policy amount via memory_recall before closing.',
    },
    {
      title: 'CRM + storage without the re-read loop',
      body: 'ClawQL does not replace your CRM or cloud folders. It makes transaction PDFs intelligible to agents: "What is the earnest money on 123 Main?" returns a grounded answer with char_interval, not a Ctrl+F hunt.',
    },
    {
      title: 'Secure external sharing',
      body: 'After redaction, Coneshare VDR share links with viewer webhooks notify Slack when buyer\'s attorney or lender opens the title package — coordinators follow up in real time.',
    },
  ],
  examples: [
    {
      title: 'Title commitment — Schedule B HITL',
      summary: 'Shipped reference path — synthetic title commitment through classify, extract, HITL, vault.',
      body: 'The real-estate-title pack demonstrates the pattern transaction coordinators need: parse, score confidence on Schedule B, human review for curative exceptions, persist to vault linked to deal_id.',
      tools: ['execute', 'classify_document', 'extract_document', 'hitl_enqueue_label_studio', 'memory_ingest'],
      steps: [
        { label: 'Parse layout', detail: 'execute docling_convert_file on fixtures/synthetic-title-commitment.txt.' },
        { label: 'Classify', detail: 'classify_document routes title_commitment — threshold 0.90 for HITL gate.' },
        { label: 'Extract', detail: 'extract_document schema_preset title_commitment — property_address, policy_amount, schedule_b_exception with char_interval.' },
        { label: 'HITL + vault', detail: 'Low confidence → hitl_enqueue_label_studio (Schedule B UI) → memory_ingest "Title — {deal_id}" with wikilinks.' },
      ],
    },
    {
      title: 'PSA intake with deal threading',
      summary: 'Shipped reference path — purchase agreement fields with cross-doc recall.',
      body: 'The real-estate-psa pack extracts contract fields and links vault notes to the title commitment note for the same deal_id.',
      tools: ['execute', 'classify_document', 'extract_document', 'workflow', 'memory_recall'],
      steps: [
        { label: 'Parse + classify', detail: 'classify_document label purchase_agreement on synthetic-psa.txt fixture.' },
        { label: 'Extract', detail: 'schema_preset purchase_agreement — purchase_price, earnest_money, closing_date, buyer_name, seller_name.' },
        { label: 'Submit workflow', detail: 'workflow submits clawql-realestate-psa-ingest with deal_id demo-deal-123-main.' },
        { label: 'Cross-check', detail: 'memory_recall "purchase price and title policy for {deal_id}" — verify PSA vs title alignment.' },
      ],
    },
    {
      title: 'Argo suspend / resume for coordinator HITL',
      summary: 'Production-style workflow templates with explicit suspend step.',
      body: 'Same pattern as lending W-2: workflow hits suspend at hitl-review; coordinators complete Label Studio; webhook auto-resumes.',
      tools: ['workflow', 'hitl_enqueue_label_studio', 'audit'],
      steps: [
        { label: 'Submit', detail: 'clawql-realestate-title-ingest or clawql-realestate-psa-ingest with confidence_threshold.' },
        { label: 'Suspend', detail: 'Template waits at hitl-gate — deal state preserved in Argo, not chat context.' },
        { label: 'Review', detail: 'Coordinator completes Label Studio task; CLAWQL_HITL_WEBHOOK_TOKEN validates webhook.' },
        { label: 'Finalize', detail: 'workflow resume writes title-result.json or psa-result.json artifact with deal_id.' },
      ],
    },
    {
      title: 'Local demo stack (reuse lending Compose)',
      summary: 'POC environment via Docker Compose — same Docling + classifier + Label Studio as lending.',
      body: 'Point agents at synthetic fixtures; bootstrap Label Studio with real-estate-title or real-estate-psa label-studio-config.xml.',
      tools: ['search', 'execute', 'classify_document'],
      steps: [
        { label: 'Bootstrap', detail: 'docker compose -f lending.compose.yml up -d — see docker/compose/README.md real estate section.' },
        { label: 'Label Studio', detail: 'Paste label-studio-config.xml from deployment/samples/real-estate-title/ or real-estate-psa/.' },
        { label: 'Connect agent', detail: 'Cursor or OpenClaw at http://localhost:8080/mcp.' },
        { label: 'Smoke flow', detail: 'Run title or PSA path from deployment/samples/real-estate/README.md.' },
      ],
    },
  ],
  compliance: [
    'PII redaction via Stirling before documents enter Onyx or archive indexes',
    'Merkle audit trail on agent processing steps — not just activity logs',
    'Self-hosted option keeps transaction docs on your infrastructure',
    'Synthetic fixtures only in reference packs — no real client data in demos',
    'VDR viewer webhooks for external access audit without replacing broker compliance workflows',
  ],
  relatedResources: [
    { label: 'Real estate workflow overview', href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/deployment/samples/real-estate' },
    { label: 'Title commitment sample pack', href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/deployment/samples/real-estate-title' },
    { label: 'PSA sample pack', href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/deployment/samples/real-estate-psa' },
    { label: 'Lending W-2 pack (same pattern)', href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/deployment/samples/lending-w2' },
    { label: 'IDP pipeline reference', href: 'https://docs.clawql.com/providers/idp-pipeline' },
  ],
  docsHref: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/deployment/samples/real-estate',
  disclaimer:
    'Reference packs and demos use synthetic data only — not legal, title, or brokerage advice. Third-party CRM, storage, and transaction products are not affiliated with ClawQL; integration is as an intelligent document layer, not a CRM replacement.',
}
