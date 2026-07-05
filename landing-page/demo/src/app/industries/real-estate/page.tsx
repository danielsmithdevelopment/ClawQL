import { IndustryPage } from '@/components/sections/industry-page'
import { industriesBySlug } from '@/lib/industries'

const industry = industriesBySlug['real-estate']

export const metadata = {
  title: 'Real estate — intelligent document layer for KW Command + Drive',
  description:
    'ClawQL classifies title commitments and purchase agreements, routes Schedule B exceptions to HITL review, and unifies deal documents with vault memory — without replacing KW Command or Google Drive.',
}

export default function Page() {
  return <IndustryPage industry={industry} />
}
