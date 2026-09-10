import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Resources',
  description:
    'ClawQL resources: changelog, migration notes, benchmarks, and links to release documentation.',
  path: '/resources',
})

export default function ResourcesLayout({ children }: { children: ReactNode }) {
  return children
}
