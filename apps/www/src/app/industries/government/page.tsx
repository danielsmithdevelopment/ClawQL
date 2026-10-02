import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'
import { pageMetadata } from '@/lib/seo'

const industry = industriesBySlug.government

export const metadata = pageMetadata({
  title: industry.name,
  description:
    "ClawQL's government vertical (clawql-government) provides independently verifiable outcome accountability for bond-funded and public programs — measurable definitions at authorization, immutable baselines, Merkle-chained WORM audit, and Arweave anchoring.",
  path: '/industries/government',
  absoluteTitle: 'Government · ClawQL',
})

export default function Page() {
  return <IndustryPage industry={industry} />
}
