import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'clawql-release MVP (Layer 0)',
  description:
    'Immutable release manifests for ClawQL 7.0.0 — GitHub and GHCR anchor, Arweave deferred, and Layer 0 release tooling.',
  path: '/getting-started/clawql-release-mvp',
})

export default function ClawqlReleaseMvpLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
