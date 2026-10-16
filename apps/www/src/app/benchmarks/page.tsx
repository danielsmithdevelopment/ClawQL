import { BenchmarksLanding } from '@/components/sections/benchmarks-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Benchmarks',
  absoluteTitle: 'Benchmarks · ClawQL vs MCP gateways',
  description:
    'Cloudflare zone-audit board and equal-arm multi-gateway benchmarks: ClawQL vs Executor v1/v2, MCPJungle, and agentgateway — tokens, memory, HTTP and stdio concurrency, equal task success.',
  path: '/benchmarks',
})

export default function Page() {
  return <BenchmarksLanding />
}
