import { BenchmarksLanding } from '@/components/sections/benchmarks-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Benchmarks',
  absoluteTitle: 'Benchmarks · ClawQL vs MCP gateways',
  description:
    'Equal-arm multi-gateway benchmarks: ClawQL vs Executor, MCPJungle, and agentgateway. Competitive feature matrix, 12-turn token scoreboard, and governed latency — measured with equal task success.',
  path: '/benchmarks',
})

export default function Page() {
  return <BenchmarksLanding />
}
