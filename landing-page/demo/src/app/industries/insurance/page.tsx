import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'

const industry = industriesBySlug.insurance

export const metadata = {
  title: `${industry.name} — ClawQL for carriers & claims`,
  description: industry.subheadline,
}

export default function Page() {
  return <IndustryPage industry={industry} />
}
