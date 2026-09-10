import { Section } from '@/components/elements/section'
import { StatusProbeClient } from '@/components/elements/status-probe-client'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Status',
  description: 'ClawQL edge gateway status — health, bindings, and MCP execution policy.',
  path: '/status',
})

export default function StatusPage() {
  return (
    <>
      <HeroSimpleCentered
        id="status-hero"
        headline="ClawQL status"
        subheadline={
          <p>
            Live probe of the edge gateway at gateway.clawql.app. Self-host operators: check your
            own <code className="text-sm">/healthz</code> and cluster dashboards.
          </p>
        }
      />
      <Section
        id="status-live"
        eyebrow="Edge"
        headline="Gateway components"
        subheadline={
          <p>
            Product links: <a href={site.urls.demo}>interactive demo</a> ·{' '}
            <a href={site.urls.signup}>start trial</a> ·{' '}
            <a href={site.urls.docs}>docs</a>
          </p>
        }
      >
        <StatusProbeClient />
      </Section>
    </>
  )
}
