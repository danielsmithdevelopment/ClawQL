import { BenchmarksLanding } from '@/components/sections/benchmarks-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Benchmarks',
  absoluteTitle: 'Benchmarks · ClawQL vs MCP gateways',
  description:
    'Fail-closed security: fair defaults (tied at 2/5) and best-config columns on equal-arm vault-write, then design cells allowlists cannot match — plus Cloudflare and multi-gateway boards.',
  path: '/benchmarks',
})

export default function Page() {
  return <BenchmarksLanding />
}
