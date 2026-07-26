import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

/** Canonical docs live at `/plugins#verticals`; this layout only wraps the redirect. */
export const metadata = docsPageMetadata({
  title: 'Domain verticals',
  description:
    'Domain verticals are ClawQL plugin presets — see /plugins for the registry and vertical composition guide.',
  path: '/plugins',
})

export default function VerticalsGuideLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
