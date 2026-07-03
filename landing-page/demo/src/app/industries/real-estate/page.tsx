import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'

const industry = industriesBySlug['real-estate']

export const metadata = {
  title: `${industry.name} — ClawQL for property transactions`,
  description: industry.subheadline,
}

export default function Page() {
  return <IndustryPage industry={industry} />
}
