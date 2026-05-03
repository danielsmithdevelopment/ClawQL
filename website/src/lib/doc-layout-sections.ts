import type { Section } from '@/components/SectionProvider'

import { caseStudyCloudflareDocsSections } from '@/lib/case-study-cloudflare-docs-sections'
import { caseStudyCrossThreadVaultRecallSections } from '@/lib/case-study-cross-thread-vault-recall-sections'
import { caseStudySlideDeckGithubParitySections } from '@/lib/case-study-slide-deck-github-parity-sections'
import { caseStudyTruenasCorgicaveSections } from '@/lib/case-study-truenas-corgicave-sections'
import { caseStudyVaultMemorySessionSections } from '@/lib/case-study-vault-memory-session-sections'
import { caseStudyWorker1102McpMemorySections } from '@/lib/case-study-worker-1102-mcp-memory-sections'
import { homePageSections } from '@/lib/home-page-sections'
import { learnAuditObservabilitySections } from '@/lib/learn-audit-observability-sections'
import { learnCacheHandoffSections } from '@/lib/learn-cache-handoff-sections'
import { learnDocumentPipelineSections } from '@/lib/learn-document-pipeline-sections'
import { learnExternalIngestKnowledgeSections } from '@/lib/learn-external-ingest-knowledge-sections'
import { learnKnowledgeSearchOnyxSections } from '@/lib/learn-knowledge-search-onyx-sections'
import { learnOpenclawClawqlSections } from '@/lib/learn-openclaw-clawql-sections'
import { learnOuroborosToolsSections } from '@/lib/learn-ouroboros-tools-sections'
import { learnPageSections } from '@/lib/learn-page-sections'
import { learnSandboxExecSections } from '@/lib/learn-sandbox-exec-sections'
import { learnScheduleNotifyWorkflowsSections } from '@/lib/learn-schedule-notify-workflows-sections'
import { learnSearchExecuteSections } from '@/lib/learn-search-execute-sections'
import { learnVaultMemoryHandoffSections } from '@/lib/learn-vault-memory-handoff-sections'

/**
 * In-page section nav (TOC) keyed by path. Kept in a **client** module so the
 * root RSC does not embed this map in the RSC flight payload for every page.
 */
export const DOC_LAYOUT_SECTIONS_BY_PATH: Record<string, Array<Section>> = {
  '/': homePageSections,
  '/learn': learnPageSections,
  '/learn/search-and-execute-mcp': learnSearchExecuteSections,
  '/learn/external-ingest-knowledge': learnExternalIngestKnowledgeSections,
  '/learn/knowledge-search-onyx': learnKnowledgeSearchOnyxSections,
  '/learn/sandbox-exec': learnSandboxExecSections,
  '/learn/openclaw-and-clawql': learnOpenclawClawqlSections,
  '/learn/ouroboros-tools': learnOuroborosToolsSections,
  '/learn/schedule-notify-workflows': learnScheduleNotifyWorkflowsSections,
  '/learn/cache-handoff-between-chats': learnCacheHandoffSections,
  '/learn/document-pipeline': learnDocumentPipelineSections,
  '/learn/vault-memory-between-chats': learnVaultMemoryHandoffSections,
  '/learn/audit-tool-and-observability': learnAuditObservabilitySections,
  '/case-studies/cloudflare-docs-mcp': caseStudyCloudflareDocsSections,
  '/case-studies/vault-memory-github-session-2026-04':
    caseStudyVaultMemorySessionSections,
  '/case-studies/cross-thread-vault-recall':
    caseStudyCrossThreadVaultRecallSections,
  '/case-studies/truenas-scale-corgicave-homelab':
    caseStudyTruenasCorgicaveSections,
  '/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04':
    caseStudyWorker1102McpMemorySections,
  '/case-studies/slide-deck-github-parity-cache-memory-recall-2026-04':
    caseStudySlideDeckGithubParitySections,
}
