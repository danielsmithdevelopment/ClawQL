import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Examples & walkthroughs',
  description:
    'ClawQL examples: session walkthroughs, vault memory case studies, deployment postmortems, and homelab deep dives.',
  path: '/examples',
})

export default function ExamplesLayout({ children }: { children: ReactNode }) {
  return children
}
