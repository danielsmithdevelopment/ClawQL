import { BenchmarksLanding } from '@/components/sections/benchmarks-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Benchmarks',
  absoluteTitle: 'Benchmarks · ClawQL vs MCP gateways',
  description:
    'Durability crash boards (N=1000 fleet kill, zero duplicates), fair governance columns, a security suite beyond block lists, and equal-arm Cloudflare / multi-gateway boards.',
  path: '/benchmarks',
})

export default function Page() {
  return <BenchmarksLanding />
}
