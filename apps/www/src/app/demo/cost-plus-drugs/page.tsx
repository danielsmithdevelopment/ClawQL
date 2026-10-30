import { CostPlusDrugsDemoLanding } from '@/components/sections/cost-plus-drugs-demo-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Cost Plus Drugs demo',
  description:
    'Independent ClawQL governance demo (not affiliated with Cost Plus Drugs): live public pricing MCP, digest-bound mock refill approval, BAA-aware multi-model routing, token-efficient search, and hash-chained audit. Not medical advice.',
  path: '/demo/cost-plus-drugs',
})

export default function Page() {
  return <CostPlusDrugsDemoLanding />
}
