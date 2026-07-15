import HomeBody from './home-body.mdx'

import { docsPageMetadata } from '@/lib/seo'

export const dynamic = 'force-static'

export const metadata = docsPageMetadata({
  title: 'ClawQL documentation',
  absoluteTitle: 'ClawQL documentation',
  description:
    'ClawQL documentation — connect an MCP client, search and execute APIs, and deploy with Docker or Kubernetes.',
  path: '/',
})

export default function Page() {
  return <HomeBody />
}
