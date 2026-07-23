import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { InferenceGtmPlaybook } from '@/components/sections/inference-gtm-playbook'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Inference-first GTM playbook',
  description:
    'ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI — Regional Hubs, Dedicated Virtual Gateways, and Edge swarm nodes.',
  path: '/inference/gtm',
})

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow={
          <p className="text-sm/7 font-medium text-mist-600 dark:text-mist-300">Inference-first GTM · July 2026</p>
        }
        headline="The Foundational Platform for Auditable Production AI"
        subheadline={
          <p>
            ClawQL provides the <strong>Agentic Gateway</strong> as the Foundational Platform for Auditable Production
            AI — land with an OpenAI-compatible inference control plane and native <code>/mcp</code> access, then expand
            into memory, model provenance, Dedicated Virtual Gateway audit-trail enforcement, and a Zero-Trust Agentic
            Fabric of Regional Hubs, private Virtual Gateways, and Edge Gateways on every laptop.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/getting-started/inference`} size="lg">
              Get started <ArrowNarrowRightIcon />
            </PlainButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/inference/clawql-inference`} size="lg">
              Inference docs <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />

      <InferenceGtmPlaybook />

      <CallToActionSimpleCentered
        id="cta"
        headline="Start with three minutes. Reach auditable production."
        subheadline={
          <p>
            Drop in an OpenAI-compatible base URL or connect Cursor to <code>/mcp</code>. Expand product-led into
            infrastructure optimization, model provenance, memory, Dedicated Virtual Gateways, and Edge swarm
            coordination — without changing your endpoint.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start 14-day trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/getting-started/inference`} size="lg">
              Inference setup <ArrowNarrowRightIcon />
            </PlainButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/getting-started`} size="lg">
              Self-host free <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
