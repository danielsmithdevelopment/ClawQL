import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'

const industry = industriesBySlug['real-estate']

export const metadata = {
  title: 'Real estate — intelligent document layer for brokerages',
  description:
    'ClawQL classifies title commitments and purchase agreements for any brokerage stack — Command, BoldTrail, Follow Up Boss, Compass, Dotloop, or Drive-based workflows — without replacing your CRM.',
}

export default function Page() {
  return <IndustryPage industry={industry} />
}
