import type { Industry } from './types'

export const educationIndustry: Industry = {
  slug: 'education',
  name: 'Education',
  headline: 'Faculty productivity and LMS-connected agents.',
  subheadline:
    'The planned clawql-education vertical connects Canvas, Moodle, and Blackboard with syllabus generation, rubric scaffolding, and progress analysis — course content and student data stay behind the same Agentic Gateway, audit, and vault policies as the rest of ClawQL.',
  packageName: 'clawql-education',
  status: 'planned',
  overview:
    'Faculty and instructional designers repeat the same semester setup — syllabi, rubrics, module scaffolding, and LMS publishing — while FERPA constraints limit what can live in chat logs or third-party SaaS. clawql-education registers syllabus_generate, rubric_create, assignment_generate, progress_analyze, lms_sync, and content_scaffold with connectors for Canvas, Moodle, and Blackboard. Approved content lands in the vault via memory_ingest; student PII is redacted before persistence; search discovers LMS REST operations instead of pasting entire OpenAPI exports. Role-scoped ATR (planned) separates faculty-facing tools from student-facing agents.',
  painPoints: [
    {
      title: 'Semester setup is repetitive',
      body: 'Syllabus and rubric drafts consume faculty hours every term. syllabus_generate and content_scaffold produce drafts from department templates; faculty edit and memory_ingest approved versions.',
    },
    {
      title: 'LMS APIs change and sprawl',
      body: 'Canvas, Moodle, and Blackboard each ship large REST surfaces. search returns operationIds; execute validates args — no multi-megabyte spec in the prompt.',
    },
    {
      title: 'TA handoffs lose context',
      body: 'Accommodation notes and intervention history live in email. memory_recall lets a new TA thread inherit department context without copying last year’s chat logs.',
    },
  ],
  platformCapabilities: [
    'LMS connectors for Canvas, Moodle, and Blackboard via search → execute',
    'Syllabus and rubric generation with HITL instructor review',
    'Progress analysis on anonymized outcome signals',
    'FERPA-aware redaction before vault persistence',
    'Audit breadcrumbs for agent-published gradebook or content changes',
  ],
  domainTools: [
    { name: 'syllabus_generate', description: 'Draft syllabus sections from department templates and learning outcomes.' },
    { name: 'rubric_create', description: 'Propose grading criteria aligned to assignment objectives.' },
    { name: 'assignment_generate', description: 'Scaffold assignments and prompts from course module plans.' },
    { name: 'progress_analyze', description: 'Aggregate anonymized learning outcomes for intervention signals.' },
    { name: 'lms_sync', description: 'Publish modules, assignments, and rubrics to connected LMS instances.' },
    { name: 'content_scaffold', description: 'Build weekly module outlines from textbook or OER source material.' },
  ],
  documentTypes: [
    'Syllabi and course outlines',
    'Rubrics and grading criteria',
    'Assignment prompts and lab instructions',
    'LMS module exports and Common Cartridge packages',
    'Anonymized grade and outcome reports',
  ],
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
    {
      title: 'Accessible content review',
      body: 'Draft assignments route through hitl_enqueue_label_studio for accessibility or instructional-design review before lms_sync publishes to students.',
    },
  ],
  examples: [
    {
      title: 'Syllabus → Canvas publish',
      summary: 'Draft, approve, vault, then LMS API publish.',
      body: 'Agent drafts syllabus sections, ingests the approved version to the vault, searches Canvas REST operations, and executes course-module creates.',
      tools: ['syllabus_generate', 'memory_ingest', 'search', 'execute', 'lms_sync'],
      steps: [
        { label: 'Draft', detail: 'syllabus_generate produces sections from department template and learning outcomes.' },
        { label: 'Approve', detail: 'Faculty edits; memory_ingest stores approved version with course wikilink.' },
        { label: 'Discover', detail: 'search "Canvas create module" returns ranked REST operationIds.' },
        { label: 'Publish', detail: 'lms_sync executes module and page creates with OAuth-scoped credentials.' },
      ],
    },
    {
      title: 'Rubric generation with HITL',
      summary: 'Instructor review before students see criteria.',
      body: 'rubric_create proposes criteria; instructor reviews in Label Studio via hitl_enqueue_label_studio; finalized rubric syncs through lms_sync.',
      tools: ['rubric_create', 'hitl_enqueue_label_studio', 'lms_sync', 'audit'],
      steps: [
        { label: 'Propose', detail: 'rubric_create drafts criteria aligned to assignment learning objectives.' },
        { label: 'Review', detail: 'hitl_enqueue_label_studio sends draft to instructional designer queue.' },
        { label: 'Finalize', detail: 'Instructor approves; memory_ingest threads rubric version history.' },
        { label: 'Sync', detail: 'lms_sync publishes rubric to Canvas assignment; audit logs publish event.' },
      ],
    },
    {
      title: 'Cross-semester recall',
      summary: 'New TA inherits vault context — not last year’s chat.',
      body: 'memory_recall surfaces prior course postmortems and accommodation notes; cache holds ephemeral session state during active labs.',
      tools: ['memory_recall', 'memory_ingest', 'cache', 'progress_analyze'],
      steps: [
        { label: 'Recall', detail: 'memory_recall "CS101 accommodations fall 2025" with department note wikilinks.' },
        { label: 'Analyze', detail: 'progress_analyze on anonymized midterm signals flags at-risk modules.' },
        { label: 'Intervene', detail: 'Agent drafts outreach template; faculty approves before any student contact.' },
        { label: 'Cache', detail: 'cache stores ephemeral lab session state — not durable student PII.' },
      ],
    },
    {
      title: 'OER module scaffold',
      summary: 'content_scaffold from open textbook chapters.',
      body: 'Agents ingest OER PDFs through IDP, scaffold weekly modules, and propose assignments for faculty review.',
      tools: ['content_scaffold', 'run_idp_pipeline', 'assignment_generate', 'memory_ingest'],
      steps: [
        { label: 'Ingest OER', detail: 'run_idp_pipeline normalizes textbook PDF chapters with course metadata.' },
        { label: 'Scaffold', detail: 'content_scaffold builds weekly outlines with readings and learning objectives.' },
        { label: 'Assignments', detail: 'assignment_generate proposes problem sets — faculty edits before publish.' },
        { label: 'Vault', detail: 'memory_ingest stores approved module map for next semester recall.' },
      ],
    },
  ],
  compliance: [
    'FERPA-aware handling — student PII redacted before vault persistence',
    'Self-hosted option for institutions that cannot send LMS data to third-party SaaS',
    'Role-scoped ATR for faculty vs student-facing agent tools (planned)',
    'Audit breadcrumbs for agent-published gradebook or content changes',
    'Accessibility review workflows via HITL before student-facing publish',
  ],
  relatedResources: [
    { label: 'Modularization v2.1 — clawql-education', href: 'https://docs.clawql.com/vision/modularization' },
    { label: 'Security overview', href: 'https://docs.clawql.com/security' },
    { label: 'Vault memory workflows', href: 'https://docs.clawql.com/' },
    { label: 'search → execute pattern', href: 'https://docs.clawql.com/' },
  ],
  docsHref: 'https://docs.clawql.com/vision/modularization',
  disclaimer:
    'Education vertical tools are planned — not academic policy advice. FERPA, accessibility, and institutional review requirements vary by jurisdiction and school.',
}
