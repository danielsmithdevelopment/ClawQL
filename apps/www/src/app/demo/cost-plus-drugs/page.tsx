import { CostPlusDrugsDemoLanding } from '@/components/sections/cost-plus-drugs-demo-landing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Cost Plus Drugs demo',
  description:
    'ClawQL governance demo for Cost Plus Drugs: live public pricing MCP, digest-bound mock refill approval, BAA-aware multi-model routing, token-efficient search, and audit trail. Not medical advice.',
  path: '/demo/cost-plus-drugs',
})

export default function Page() {
  return <CostPlusDrugsDemoLanding />
}
