import { IdpLanding } from '@/components/sections/idp-landing'
import { pricing } from '@/lib/pricing'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Intelligent Document Processing',
  description: `ClawQL IDP — full document lifecycle from ingest to VDR for ${pricing.starter.monthlyPrice}/mo. Compete with ABBYY, Hyperscience, and Intralinks on price, deployment speed, and agentic access.`,
  path: '/idp',
})

export default function Page() {
  return <IdpLanding />
}
