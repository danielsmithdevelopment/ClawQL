import { SecurityLanding } from '@/components/sections/security-landing'
import { securityStackHeadline, securityStackSummary } from '@/lib/security-stack'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Security',
  absoluteTitle: 'Security · ClawQL defense in depth',
  description: `${securityStackHeadline} ${securityStackSummary}`,
  path: '/security',
})

export default function Page() {
  return <SecurityLanding />
}
