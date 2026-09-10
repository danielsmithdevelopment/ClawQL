import { ProtocolFabricLanding } from '@/components/sections/protocol-fabric-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Protocol Fabric',
  description:
    'ClawQL Protocol Fabric — any protocol to any protocol via MCP. ClawQL Core inbound, mcp-api-adapter outbound, proven end-to-end loop.',
  path: '/protocol-fabric',
})

export default function Page() {
  return <ProtocolFabricLanding />
}
