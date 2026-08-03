import HomeBody from './home-body.mdx'

import { docsPageMetadata } from '@/lib/seo'

export const dynamic = 'force-static'

export const metadata = docsPageMetadata({
  title: 'ClawQL documentation',
  absoluteTitle: 'ClawQL documentation',
  description:
    'ClawQL documentation: MCP server for OpenAPI 3, Swagger 2, Google Discovery, optional native GraphQL and gRPC — search and execute, optional sandbox, vault memory, schedule synthetics, notify, Onyx, Ouroboros, stdio or HTTP or MCP gRPC, Docker and Kubernetes.',
  path: '/',
})

export default function Page() {
  return <HomeBody />
}
