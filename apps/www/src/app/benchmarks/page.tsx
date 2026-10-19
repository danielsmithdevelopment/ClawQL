import { BenchmarksLanding } from '@/components/sections/benchmarks-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Benchmarks',
  absoluteTitle: 'Benchmarks · ClawQL vs MCP gateways',
  description:
    'Fail-closed governance (Panguard vault-write deny vs Obot), Cloudflare zone-audit and fan-out boards, and equal-arm multi-gateway benchmarks — tokens, memory, concurrency, policy depth.',
  path: '/benchmarks',
})

export default function Page() {
  return <BenchmarksLanding />
}
