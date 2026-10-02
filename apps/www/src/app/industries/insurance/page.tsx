import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'
import { pageMetadata } from '@/lib/seo'

const industry = industriesBySlug.insurance

export const metadata = pageMetadata({
  title: industry.name,
  description: industry.subheadline,
  path: '/industries/insurance',
})

export default function Page() {
  return <IndustryPage industry={industry} />
}
