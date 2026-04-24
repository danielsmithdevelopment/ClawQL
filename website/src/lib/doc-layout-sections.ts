import type { Section } from '@/components/SectionProvider'

import { caseStudyCloudflareDocsSections } from '@/lib/case-study-cloudflare-docs-sections'
import { caseStudyCrossThreadVaultRecallSections } from '@/lib/case-study-cross-thread-vault-recall-sections'
import { caseStudyTruenasCorgicaveSections } from '@/lib/case-study-truenas-corgicave-sections'
import { caseStudyVaultMemorySessionSections } from '@/lib/case-study-vault-memory-session-sections'
import { caseStudyWorker1102McpMemorySections } from '@/lib/case-study-worker-1102-mcp-memory-sections'
import { homePageSections } from '@/lib/home-page-sections'

/**
 * In-page section nav (TOC) keyed by path. Kept in a **client** module so the
 * root RSC does not embed this map in the RSC flight payload for every page.
 */
export const DOC_LAYOUT_SECTIONS_BY_PATH: Record<string, Array<Section>> = {
  '/': homePageSections,
  '/case-studies/cloudflare-docs-mcp': caseStudyCloudflareDocsSections,
  '/case-studies/vault-memory-github-session-2026-04':
    caseStudyVaultMemorySessionSections,
  '/case-studies/cross-thread-vault-recall':
    caseStudyCrossThreadVaultRecallSections,
  '/case-studies/truenas-scale-corgicave-homelab':
    caseStudyTruenasCorgicaveSections,
  '/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04':
    caseStudyWorker1102McpMemorySections,
}
