import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Agent setup',
  description:
    'ClawQL agent setup: vault-first onboarding, ~/.ClawQL memory and secrets, MCP client wiring, and copy-paste first-run prompt.',
  path: '/agent-setup',
})

export default function AgentSetupLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
