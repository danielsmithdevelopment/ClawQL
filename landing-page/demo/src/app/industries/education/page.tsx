import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'

const industry = industriesBySlug.education

export const metadata = {
  title: `${industry.name} — ClawQL for faculty & LMS workflows`,
  description: industry.subheadline,
}

export default function Page() {
  return <IndustryPage industry={industry} />
}
