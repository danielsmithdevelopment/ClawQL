import type { Industry } from './types'

export const legalIndustry: Industry = {
  slug: 'legal',
  name: 'Legal',
  headline: 'Contract intelligence with privilege-aware automation.',
  subheadline:
    'The planned clawql-legal vertical adds clause extraction, precedent search, privilege redaction, and filing validation on ClawQL’s IDP pipeline — agents handle due diligence and litigation support without leaking attorney-client material into prompts or vault notes.',
  packageName: 'clawql-legal',
  status: 'planned',
  overview:
    'Law firms and in-house teams drown in PDF data rooms, discovery productions, and contract versions — while ethical walls and privilege rules forbid casual indexing of client material. clawql-legal registers clause_extract, risk_flag, precedent_search, redact_privilege, timeline_generate, brief_draft, motion_draft, and filing_validate on the shared Agentic Gateway. Documents pass Stirling and redact_privilege before archive or knowledge_search_onyx; memory_recall with graph depth surfaces prior matter notes without cross-contaminating walled teams. Human attorneys remain in the loop — agents handle retrieval, first-pass organization, and citation gathering.',
  painPoints: [
    {
      title: 'Privilege leaks into enterprise search',
      body: 'Indexing full productions without redact_privilege risks attorney-client exposure. IDP redaction runs before Onyx or Paperless; ethical-wall scoping planned via vertical RLS.',
    },
    {
      title: 'Associates re-read every exhibit',
      body: 'M&A and litigation data rooms repeat the same diligence questions. clause_extract and memory_recall surface prior deal patterns and cited clauses with char_interval provenance.',
    },
    {
      title: 'Discovery timelines are manual',
      body: 'timeline_generate composes structured chronologies from ingested depositions and emails — associates refine instead of building from scratch in Word.',
    },
  ],
  platformCapabilities: [
    'Clause extraction and risk_flag scoring with provenance citations',
    'Privilege redaction before archive and hybrid search',
    'Precedent search across vault notes and Onyx firm index',
    'HITL review queues for privilege and extraction confidence',
    'Immutable audit trails for agent actions on client documents',
  ],
  domainTools: [
    { name: 'clause_extract', description: 'Extract indemnity, change-of-control, and limitation-of-liability clauses with citations.' },
    { name: 'risk_flag', description: 'Score contract sections against firm playbooks and prior deal outcomes.' },
    { name: 'precedent_search', description: 'Search vault and firm indexes for similar language and outcomes.' },
    { name: 'redact_privilege', description: 'Strip privileged content before documents enter archive or search.' },
    { name: 'timeline_generate', description: 'Build litigation chronologies from ingested discovery materials.' },
    { name: 'brief_draft / motion_draft', description: 'First-pass drafts from retrieved citations — attorney review required.' },
    { name: 'filing_validate', description: 'Check court filing rules and required fields before submission APIs.' },
  ],
  documentTypes: [
    'M&A purchase agreements and disclosure schedules',
    'Commercial contracts and amendments',
    'Discovery productions and deposition transcripts',
    'Pleadings, motions, and briefs',
    'Regulatory filings and correspondence',
  ],
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
    {
      title: 'Contract lifecycle monitoring',
      body: 'Agents recall renewal dates, notice periods, and amendment history from vault notes — in-house counsel gets proactive signals without maintaining parallel spreadsheets.',
    },
  ],
  examples: [
    {
      title: 'M&A data room intake',
      summary: 'Classify, extract, and cite key commercial terms.',
      body: 'run_idp_pipeline normalizes seller disclosures; classify_document routes contracts vs financials; extract_document returns party and indemnity fields with char_interval citations.',
      tools: ['run_idp_pipeline', 'classify_document', 'extract_document', 'clause_extract'],
      steps: [
        { label: 'Normalize', detail: 'Gotenberg converts Word exhibits; run_idp_pipeline tags matter_id metadata.' },
        { label: 'Classify', detail: 'classify_document separates customer contracts, IP assignments, and financial statements.' },
        { label: 'Extract', detail: 'clause_extract surfaces indemnity caps and MAC definitions with char_interval citations.' },
        { label: 'Flag risk', detail: 'risk_flag scores non-standard clauses against firm playbook thresholds.' },
      ],
    },
    {
      title: 'Precedent search across matters',
      summary: 'Vault graph + Onyx for grounded citations.',
      body: 'memory_recall with elevated graph depth surfaces prior vault notes on similar clauses; knowledge_search_onyx queries the firm index — agents cite paths and snippets.',
      tools: ['memory_recall', 'knowledge_search_onyx', 'precedent_search', 'audit'],
      steps: [
        { label: 'Recall', detail: 'memory_recall "change of control indemnity cap 2024" with maxDepth for wikilinks.' },
        { label: 'Search index', detail: 'knowledge_search_onyx queries firm corpus for matching language.' },
        { label: 'Precedent', detail: 'precedent_search ranks prior matters with outcome notes.' },
        { label: 'Audit', detail: 'audit logs matter access for ethical-wall compliance.' },
      ],
    },
    {
      title: 'Privilege review queue',
      summary: 'HITL before privileged text enters search.',
      body: 'Low-confidence privilege calls route to hitl_enqueue_label_studio; reviewer decisions append to the vault via memory_ingest with wikilinks to the matter file.',
      tools: ['redact_privilege', 'hitl_enqueue_label_studio', 'memory_ingest', 'audit'],
      steps: [
        { label: 'Scan', detail: 'redact_privilege scores segments for attorney-client and work-product markers.' },
        { label: 'Enqueue', detail: 'Low confidence → hitl_enqueue_label_studio privilege review project.' },
        { label: 'Review', detail: 'Attorney confirms redact vs produce; webhook validates CLAWQL_HITL_WEBHOOK_TOKEN.' },
        { label: 'Persist', detail: 'memory_ingest appends privilege log with wikilinks to matter note — append: true.' },
      ],
    },
    {
      title: 'Discovery timeline for motion practice',
      summary: 'timeline_generate from ingested productions.',
      body: 'Agents ingest de-duplicated email and deposition PDFs, generate a chronology draft, and brief_draft a summary for partner review.',
      tools: ['timeline_generate', 'brief_draft', 'memory_ingest', 'workflow'],
      steps: [
        { label: 'Ingest', detail: 'run_idp_pipeline on production batch with matter_id and bates range metadata.' },
        { label: 'Timeline', detail: 'timeline_generate orders events with source document citations.' },
        { label: 'Draft', detail: 'brief_draft produces first-pass summary — attorney edits before filing.' },
        { label: 'Thread', detail: 'memory_ingest stores approved timeline with wikilinks to source exhibits.' },
      ],
    },
  ],
  compliance: [
    'Attorney-client privilege redaction before archive and search',
    'Ethical-wall and matter-scoping via planned vertical RLS',
    'Immutable audit trails for agent actions on client documents',
    'Self-hosted deployment keeps matter files on firm-controlled infrastructure',
    'ABA standards and data sovereignty hooks in modularization v2.1',
  ],
  relatedResources: [
    { label: 'Modularization v2.1 — clawql-legal', href: 'https://docs.clawql.com/vision/modularization' },
    { label: 'IDP pipeline reference', href: 'https://docs.clawql.com/providers/idp-pipeline' },
    { label: 'Security overview', href: 'https://docs.clawql.com/security' },
    { label: 'Grounded extraction', href: 'https://docs.clawql.com/providers/idp-pipeline' },
  ],
  docsHref: 'https://docs.clawql.com/vision/modularization',
  disclaimer:
    'Legal workflows are planned — not legal advice. Privilege, ethical-wall, and e-discovery rules require qualified counsel and tenant configuration.',
}
