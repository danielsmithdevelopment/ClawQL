import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'

const industry = industriesBySlug.healthcare

export const metadata = {
  title: `${industry.name} — ClawQL for clinical documents`,
  description: industry.subheadline,
}

export default function Page() {
  return <IndustryPage industry={industry} />
}
