import { BenchmarksLanding } from '@/components/sections/benchmarks-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Benchmarks',
  absoluteTitle: 'Benchmarks · ClawQL vs MCP gateways',
  description:
    'Fail-closed security: ClawQL 5/5 vs Obot 2, Bifrost 2, and Executor resume 2 on equal-arm vault-write — plus Cloudflare zone-audit, fan-out, and multi-gateway token boards.',
  path: '/benchmarks',
})

export default function Page() {
  return <BenchmarksLanding />
}
