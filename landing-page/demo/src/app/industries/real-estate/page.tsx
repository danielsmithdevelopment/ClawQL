import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'

const industry = industriesBySlug['real-estate']

export const metadata = {
  title: 'Real estate — document layer for brokerages and FSBO sellers',
  description:
    'ClawQL classifies title commitments, purchase agreements, and buyer offers for brokerages (Command, BoldTrail, FUB, Dotloop) and FSBO sellers — without replacing your CRM or listing platform.',
}

export default function Page() {
  return <IndustryPage industry={industry} />
}
