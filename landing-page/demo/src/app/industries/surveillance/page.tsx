import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'
import { pageMetadata } from '@/lib/seo'

const industry = industriesBySlug.surveillance

export const metadata = pageMetadata({
  title: industry.name,
  description:
    "ClawQL's surveillance vertical (clawql-surveillance) provides cryptographic chain of custody for camera footage — hardware attestation at capture, Merkle-chained audit logs, external Arweave anchoring, and mandatory access enforcement — so footage can be independently authenticated as criminal evidence.",
  path: '/industries/surveillance',
  absoluteTitle: 'Surveillance · ClawQL',
})

export default function Page() {
  return <IndustryPage industry={industry} />
}
