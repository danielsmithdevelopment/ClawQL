import type { Industry } from './types'

export const lendingIndustry: Industry = {
  slug: 'lending',
  name: 'Lending',
  headline: 'Agent-native lending and mortgage operations.',
  subheadline:
    'ClawQL’s lending vertical (clawql-lending) composes the IDP pipeline, vault memory, HITL review, and workflow automation for loan origination — W-2s, bank statements, and underwriting packages without pasting specs or losing audit trails.',
  packageName: 'clawql-lending',
  status: 'partial',
  overview:
    'Mortgage, auto, BNPL, payday, and commercial lending share the same document-heavy intake problem: borrowers submit heterogeneous PDFs, underwriters re-ask for the same conditions, and API integrations sprawl across LOS, credit, and document vendors. Modularization v2.1 defines clawql-lending as five sub-verticals on one gateway — MortgagePlugin, AutoPlugin, BNPLPlugin, PaydayPlugin, and CommercialPlugin — plus shared UnderwritingPlugin and CompliancePlugin for Reg Z, ECOA, and fair-lending guardrails. Today you can run the lending Docker Compose stack and the shipped W-2 reference pack; full LOS tool registration ships with the vertical package.',
  painPoints: [
    {
      title: 'Spec dumps burn planning tokens',
      body: 'Credit bureau, GSE, and LOS OpenAPI surfaces are enormous. Pasting them into agent prompts is expensive and brittle. search returns ranked operationIds; execute validates args server-side.',
    },
    {
      title: 'Context dies between underwriting sessions',
      body: 'Cleared conditions and vendor analysis live in email threads. memory_ingest and memory_recall give underwriters durable borrower context across Cursor, OpenClaw, and your LOS-adjacent automations.',
    },
    {
      title: 'Low-confidence OCR needs humans in the loop',
      body: 'W-2 box misreads create repurchase risk. classify_document routes by type; hitl_enqueue_label_studio suspends Argo workflows until a reviewer confirms fields.',
    },
  ],
  platformCapabilities: [
    'Eight-vendor IDP pipeline (Docling, Tika, Gotenberg, Stirling, archive, Onyx, Coneshare)',
    'Vault memory with wikilinks for borrower files and underwriting decisions',
    'Argo Workflows suspend/resume integrated with Label Studio HITL',
    'Cosign-signed MCP images with Kyverno admission on Helm deploys',
    'Optional Fabric consortium features via clawql-blockchain peer dependency',
  ],
  domainTools: [
    { name: 'gse_validate', description: 'Validate loan data against agency guidelines indexed in Onyx.' },
    { name: 'condition_clear', description: 'Record and recall underwriting conditions with vault threading.' },
    { name: 'pii_redact', description: 'Strip borrower PII before documents enter search indexes.' },
    { name: 'loan_archive', description: 'Tag and archive loan packages in Paperless or the native archive layer.' },
    { name: 'bnpl_decision / fraud_check', description: 'Sub-second decision loops for BNPL with Cuckoo dedup on doc batches.' },
  ],
  documentTypes: [
    'W-2 and 1099 income forms',
    'Pay stubs and VOE letters',
    'Bank statements and asset statements',
    'Appraisal and title commitments',
    'Purchase agreements and closing disclosures',
  ],
  useCases: [
    {
      title: 'Income document ingestion',
      body: 'Parse W-2s and pay stubs with Docling layout OCR, classify by document type, route low-confidence extractions to Label Studio, and archive tagged outcomes for underwriters with correspondent metadata.',
    },
    {
      title: 'Underwriting memory across sessions',
      body: 'memory_recall surfaces prior borrower conditions, cleared stipulations, and vendor analysis — underwriters do not re-derive context every time a loan file reopens in a new agent thread.',
    },
    {
      title: 'Multi-product LOS coverage',
      body: 'Mortgage, auto, BNPL, payday, and commercial modules share compliance plugins but register distinct MCP tools — enable only the products you originate via CLAWQL_ENABLE_* and Operator vertical flags.',
    },
    {
      title: 'Compliance-aware automation',
      body: 'Shared CompliancePlugin targets Reg Z, ECOA, and fair-lending checks. audit logs structured MCP events; dedicated managed hosting isolates tenant workloads for strict lenders.',
    },
  ],
  examples: [
    {
      title: 'W-2 intake with confidence routing',
      summary: 'Shipped reference path — synthetic W-2 through Docling, classify, HITL, vault.',
      body: 'The lending W-2 pack demonstrates the full pattern agents use for income verification: parse, score confidence, human review when needed, persist decisions durably.',
      tools: ['execute', 'classify_document', 'hitl_enqueue_label_studio', 'memory_ingest'],
      steps: [
        { label: 'Parse layout', detail: 'execute docling_convert_file on fixtures/synthetic-w2.txt — layout-aware OCR for boxed forms.' },
        { label: 'Classify', detail: 'classify_document routes W-2 vs pay stub vs bank statement before extraction schema selection.' },
        { label: 'Route low confidence', detail: 'Score below threshold → hitl_enqueue_label_studio with Label Studio project from label-studio-config.xml.' },
        { label: 'Persist review', detail: 'Webhook fires → memory_ingest appends reviewer fields with wikilinks to the loan file note.' },
      ],
    },
    {
      title: 'Argo suspend / resume for underwriting HITL',
      summary: 'Production-style workflow template with explicit suspend step.',
      body: 'workflow submits clawql-lending-w2-ingest; operators resume after Label Studio without losing pipeline state.',
      tools: ['workflow', 'hitl_enqueue_label_studio', 'memory_recall'],
      steps: [
        { label: 'Submit workflow', detail: 'workflow operation submits WorkflowTemplate clawql-lending-w2-ingest with confidence_threshold parameter.' },
        { label: 'Suspend', detail: 'Template hits suspend when classify confidence < threshold — file waits in Argo, not in chat context.' },
        { label: 'Human review', detail: 'Underwriter completes Label Studio task; webhook validates CLAWQL_HITL_WEBHOOK_TOKEN.' },
        { label: 'Resume', detail: 'workflow resume continues to finalize step; audit captures correlation_id for the loan.' },
      ],
    },
    {
      title: 'Cross-session borrower recall',
      summary: 'OpenClaw or Cursor picks up where the last underwriter left off.',
      body: 'A fresh agent thread calls memory_recall with the borrower name and condition keywords — vault returns ranked snippets without re-uploading prior PDFs.',
      tools: ['memory_recall', 'audit', 'search'],
      steps: [
        { label: 'Recall', detail: 'memory_recall query "borrower Smith conditions cleared 2026" with maxDepth for wikilink graph.' },
        { label: 'Discover APIs', detail: 'search finds LOS or credit APIs for status updates — no 9 MB spec in prompt.' },
        { label: 'Execute', detail: 'execute updates condition status with validated args and bearer token from env.' },
        { label: 'Ingest outcome', detail: 'memory_ingest appends what changed with append: true on stable title.' },
      ],
    },
    {
      title: 'One-command local lending stack',
      summary: 'POC underwriting environment via Docker Compose.',
      body: 'docker compose -f lending.compose.yml brings up MCP, Docling, classifier, LangExtract demo, and Label Studio CE — documented in docker/compose/README.md.',
      tools: ['search', 'execute', 'audit'],
      steps: [
        { label: 'Bootstrap', detail: 'cp lending.env.example; docker compose up -d --build.' },
        { label: 'Wire HITL', detail: 'Paste label-studio-config.xml; set CLAWQL_LABEL_STUDIO_API_TOKEN; configure webhook to /hitl/label-studio/webhook.' },
        { label: 'Connect agent', detail: 'Point Cursor or OpenClaw at http://localhost:8080/mcp (streamable-http).' },
        { label: 'Smoke W-2 flow', detail: 'Run classify → HITL path from deployment/samples/lending-w2/README.md.' },
      ],
    },
  ],
  compliance: [
    'PII redaction via Stirling in the IDP pipeline before archive and Onyx indexing',
    'Structured audit ring buffer plus optional vault postmortems for examiner requests',
    'Vertical RLS and ATR scoping planned via clawql-auth — underwriter role bound to mortgage vertical',
    'Cosign-signed images and Kyverno verifyImages on self-hosted Helm',
    'Fair-lending and Reg Z hooks in shared CompliancePlugin (modularization v2.1)',
  ],
  relatedResources: [
    { label: 'Lending W-2 sample pack', href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/deployment/samples/lending-w2' },
    { label: 'Lending Docker Compose', href: 'https://github.com/danielsmithdevelopment/ClawQL/tree/main/docker/compose' },
    { label: 'IDP pipeline reference', href: 'https://docs.clawql.com/providers/idp-pipeline' },
    { label: 'Modularization v2.1 — clawql-lending', href: 'https://docs.clawql.com/vision/modularization' },
  ],
  docsHref: 'https://docs.clawql.com/vision/modularization',
  disclaimer:
    'Lending compose stacks and W-2 samples use synthetic data only — not tax, legal, or underwriting advice. Train tenant-specific classifiers before production.',
}
