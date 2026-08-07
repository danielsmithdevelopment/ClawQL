import { Section } from '@/components/elements/section'
import { InteractiveDemoClient } from '@/components/elements/interactive-demo-client'
import { ButtonLink } from '@/components/elements/button'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Interactive demo',
  description:
    'Try ClawQL with your document — no signup. Sandboxed edge session with a 5-minute TTL, vault ingest/recall preview, and honest IDP stage status.',
  path: '/demo',
})

export default function DemoPage() {
  return (
    <>
      <HeroSimpleCentered
        id="demo-hero"
        headline="Try with your document"
        subheadline={
          <p>
            No signup. Paste text, run the edge sandbox, and see ingest → markdown preview → vault
            recall. Full Docling / Stirling / Onyx / Coneshare activate on Shared+. Unlimited MCP
            executions on every hosted tier — no caps, no overage, no meter.
          </p>
        }
        cta={
          <ButtonLink href={site.urls.signup} size="lg">
            Start your free trial
          </ButtonLink>
        }
      />

      <Section
        id="demo-sandbox"
        eyebrow="Sandboxed · 5-minute TTL"
        headline="Edge gateway demo"
        subheadline={
          <p>
            Sessions create a temporary tenant on the ClawQL gateway. Documents are deleted when the
            session expires. Compliance-friendly preview for prospects who will not upload to a
            permanent SaaS.
          </p>
        }
      >
        <InteractiveDemoClient />
      </Section>
    </>
  )
}
