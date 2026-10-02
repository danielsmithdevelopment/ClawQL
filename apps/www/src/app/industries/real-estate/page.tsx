import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'
import { pageMetadata } from '@/lib/seo'

const industry = industriesBySlug['real-estate']

export const metadata = pageMetadata({
  title: industry.name,
  description: industry.subheadline,
  path: '/industries/real-estate',
})

export default function Page() {
  return <IndustryPage industry={industry} />
}
