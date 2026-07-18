import HomeBody from './home-body.mdx'

import { docsPageMetadata } from '@/lib/seo'

export const dynamic = 'force-static'

export const metadata = docsPageMetadata({
  title: 'ClawQL documentation',
  absoluteTitle: 'ClawQL documentation',
  description:
    'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — docs for MCP, inference, and the Zero-Trust Agentic Fabric.',
  path: '/',
})

export default function Page() {
  return <HomeBody />
}
