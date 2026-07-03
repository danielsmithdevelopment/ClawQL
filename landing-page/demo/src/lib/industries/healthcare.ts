import type { Industry } from './types'

export const healthcareIndustry: Industry = {
  slug: 'healthcare',
  name: 'Healthcare',
  headline: 'HIPAA-aware clinical document processing.',
  subheadline:
    'The planned clawql-healthcare vertical extends ClawQL’s document pipeline for FHIR bundles, HL7 messages, DICOM imaging, and clinical notes — PHI de-identification, structured extraction, and audit trails on the same MCP gateway as the rest of your stack.',
  packageName: 'clawql-healthcare',
  status: 'planned',
  overview:
    'Health systems and digital health vendors juggle unstructured clinical PDFs, HL7 v2 feeds, FHIR R4 bundles, and imaging studies — often with separate OCR pipelines, manual de-identification, and brittle point-to-point integrations. clawql-healthcare (modularization v2.1) registers domain tools — fhir_parse, hl7_extract, dicom_analyze, ehr_structure, deidentify, medical_image_analyze, clinical_note_structure — on the same MCP gateway as search, execute, memory, and audit. PHI never enters vault notes or Onyx indexes without passing Stirling redaction in run_idp_pipeline; hitl_enqueue_label_studio routes ambiguous coding or medication extractions to clinical reviewers before downstream persistence.',
  painPoints: [
    {
      title: 'PHI in agent prompts and vault notes',
      body: 'Chat transcripts and Obsidian pages are not HIPAA audit systems. deidentify and IDP redaction stages strip identifiers before memory_ingest; dedicated managed hosting isolates tenant workloads.',
    },
    {
      title: 'Interop specs overwhelm planning context',
      body: 'FHIR and vendor EHR OpenAPI exports are huge. search surfaces the right read/search operations; execute runs validated calls with scoped credentials.',
    },
    {
      title: 'Low-confidence clinical extraction',
      body: 'Diagnosis codes, medication doses, and allergy fields need human sign-off. hitl_enqueue_label_studio suspends workflows until a clinician confirms extractions.',
    },
  ],
  platformCapabilities: [
    'FHIR and HL7 parsing tools with structured output for agents',
    'DICOM metadata and medical image analysis under redaction policies',
    'HIPAA-oriented de-identification via Stirling in run_idp_pipeline',
    '6-year audit retention targets for PHI-handling tenants (security curriculum)',
    '32-module security curriculum maps controls to HIPAA evidence collection',
  ],
  domainTools: [
    { name: 'fhir_parse', description: 'Parse FHIR R4 bundles into agent-friendly structured summaries.' },
    { name: 'hl7_extract', description: 'Extract segments and fields from HL7 v2 messages for routing and structuring.' },
    { name: 'dicom_analyze', description: 'Expose imaging metadata to agents under HIPAA-friendly redaction policies.' },
    { name: 'ehr_structure', description: 'Normalize discharge summaries and referral letters into queryable fields.' },
    { name: 'deidentify', description: 'Strip PHI before documents enter vault, archive, or search indexes.' },
    { name: 'clinical_note_structure', description: 'Structure free-text notes with provenance for coder review.' },
  ],
  documentTypes: [
    'Discharge summaries and referral letters',
    'FHIR DocumentReference and DiagnosticReport bundles',
    'HL7 ADT and ORU messages',
    'DICOM imaging studies (metadata and reports)',
    'Prior authorization and clinical PDF attachments',
  ],
  useCases: [
    {
      title: 'Clinical document structuring',
      body: 'Parse discharge summaries and referral letters with Docling/Tika, de-identify PHI before persistence, and archive with correspondent and document-type metadata agents can query later via memory_recall.',
    },
    {
      title: 'Interop without spec dumps',
      body: 'search surfaces FHIR and HL7 operations from bundled providers; execute calls run with validated args — keeping planning context lean when agents touch EHR or imaging APIs.',
    },
    {
      title: 'Human review on low confidence',
      body: 'hitl_enqueue_label_studio routes ambiguous extractions — for example diagnosis coding or medication fields — to clinical reviewers before results enter the vault or downstream systems.',
    },
    {
      title: 'Care-coordination memory',
      body: 'De-identified summaries in the vault with wikilinks let care teams recall prior interventions across sessions without storing PHI in chat transcripts.',
    },
  ],
  examples: [
    {
      title: 'Clinical PDF → redact → archive',
      summary: 'Full IDP chain before any PHI touches search or vault.',
      body: 'run_idp_pipeline chains intake through Stirling PII redaction and the archive layer; agents recall prior patient-context runbooks from de-identified vault notes.',
      tools: ['run_idp_pipeline', 'memory_recall', 'audit'],
      steps: [
        { label: 'Intake', detail: 'Clinical PDF arrives via secure upload or EHR export trigger.' },
        { label: 'Parse', detail: 'Docling layout OCR for scanned notes; Tika for native PDF text layers.' },
        { label: 'De-identify', detail: 'Stirling + deidentify strip MRNs, names, and dates before archive.' },
        { label: 'Recall runbooks', detail: 'memory_recall returns de-identified care-coordination notes — no PHI in chat.' },
      ],
    },
    {
      title: 'FHIR bundle extraction',
      summary: 'search → execute → vault summary for care teams.',
      body: 'Agent searches for FHIR read/search operations, executes with scoped credentials, and ingests a de-identified summary to the vault with wikilinks.',
      tools: ['search', 'execute', 'memory_ingest', 'fhir_parse'],
      steps: [
        { label: 'Discover', detail: 'search "Patient/$everything" or Condition read operations from bundled FHIR provider.' },
        { label: 'Execute', detail: 'execute with OAuth bearer scoped to patient compartment.' },
        { label: 'Parse', detail: 'fhir_parse reduces bundle to agent-friendly conditions, meds, and encounters.' },
        { label: 'Ingest', detail: 'memory_ingest appends de-identified summary with wikilinks to care plan note.' },
      ],
    },
    {
      title: 'Radiology metadata (planned)',
      summary: 'Imaging studies without exposing pixels in prompts.',
      body: 'dicom_analyze and medical_image_analyze expose study metadata and report text under redaction policies — documented in modularization v2.1.',
      tools: ['search', 'execute', 'deidentify', 'dicom_analyze'],
      steps: [
        { label: 'Query PACS', detail: 'search discovers DICOMweb or vendor imaging API operations.' },
        { label: 'Analyze', detail: 'dicom_analyze returns modality, series, and report text — not raw pixel data in chat.' },
        { label: 'Redact', detail: 'deidentify strips accession-linked identifiers before vault persistence.' },
        { label: 'Audit', detail: 'audit logs imaging access with correlation_id for compliance review.' },
      ],
    },
    {
      title: 'Clinical coding HITL queue',
      summary: 'Ambiguous ICD/CPT extractions await coder sign-off.',
      body: 'clinical_note_structure proposes codes; low confidence routes to Label Studio; approved codes sync via execute to coding systems.',
      tools: ['clinical_note_structure', 'hitl_enqueue_label_studio', 'workflow'],
      steps: [
        { label: 'Structure', detail: 'clinical_note_structure extracts candidate codes with confidence scores.' },
        { label: 'Route', detail: 'Scores below threshold → hitl_enqueue_label_studio for certified coder.' },
        { label: 'Suspend', detail: 'Argo workflow suspends until webhook confirms reviewer decision.' },
        { label: 'Finalize', detail: 'workflow resume posts approved codes; audit captures reviewer identity.' },
      ],
    },
  ],
  compliance: [
    'HIPAA-oriented de-identification via IDP redaction stage (Stirling)',
    '6-year audit retention targets for PHI-handling tenants (security curriculum)',
    'Dedicated managed hosting for workload isolation',
    '32-module security curriculum maps controls to HIPAA evidence collection',
    'Planned vertical RLS and ATR scoping for clinical vs admin agent roles',
  ],
  relatedResources: [
    { label: 'Modularization v2.1 — clawql-healthcare', href: 'https://docs.clawql.com/vision/modularization' },
    { label: 'Security overview', href: 'https://docs.clawql.com/security' },
    { label: 'IDP pipeline reference', href: 'https://docs.clawql.com/providers/idp-pipeline' },
    { label: 'Vault memory workflows', href: 'https://docs.clawql.com/' },
  ],
  docsHref: 'https://docs.clawql.com/security',
  disclaimer:
    'Healthcare vertical tools are planned — not medical advice. BAAs, BRA processes, and production PHI handling require your compliance review.',
}
