import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'

const industry = industriesBySlug.lending

export const metadata = {
  title: `${industry.name} — ClawQL for lending & mortgage`,
  description: industry.subheadline,
}

export default function Page() {
  return <IndustryPage industry={industry} />
}
