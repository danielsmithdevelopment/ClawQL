import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title:
    'Case study: TrueNAS Scale corgicave — homelab networking, errno 49, vault memory, SSH',
  description:
    'Full narrative: office switch island, Mac mini dual-homing and utun/Docker, memory_ingest/recall, Thunderbolt vs SSH, resolution and SSH hardening — same detail as docs/case_studies in the repo.',
  path: '/case-studies/truenas-scale-corgicave-homelab',
  ogType: 'article',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
