import type { Section } from '@/components/SectionProvider'

import { DOC_LAYOUT_SECTIONS_BY_PATH as GENERATED } from '@/generated/doc-layout-sections.generated'

/**
 * In-page section nav (TOC) keyed by path. Generated at build/dev time from
 * page MDX + synced bodies — Workers-safe (no runtime filesystem).
 *
 * Regenerate: `node scripts/generate-doc-layout-sections.mjs`
 */
export const DOC_LAYOUT_SECTIONS_BY_PATH: Record<
  string,
  Array<Section>
> = GENERATED
