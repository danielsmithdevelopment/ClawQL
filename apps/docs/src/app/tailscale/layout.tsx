import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Tailscale & Headscale',
  description:
    'Beginner guide: private tailnets for ClawQL MCP and execute—MagicDNS, Serve, Headscale, ACLs—plus how the pattern supports HIPAA, SOC 2, GDPR, and CCPA-style control themes (not legal advice).',
  path: '/tailscale',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
