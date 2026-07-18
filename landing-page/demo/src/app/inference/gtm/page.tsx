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
    'ClawQL inference-first go-to-market playbook — Unified Gateway from npx clawql-inference to the full sovereign platform, with MCP and OpenAI drop-in entry points.',
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
        headline="Lead with the Unified Gateway"
        subheadline={
          <p>
            ClawQL’s default go-to-market playbook — land with an OpenAI-compatible inference control plane and native{' '}
            <code>/mcp</code> access, then expand into memory, Flywheel, Virtual Gateway governance, and the full
            sovereign agent operating system.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/inference/clawql-inference`} size="lg">
              Inference docs <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />

      <InferenceGtmPlaybook />

      <CallToActionSimpleCentered
        id="cta"
        headline="Start with three minutes. Own the stack later."
        subheadline={
          <p>
            Drop in an OpenAI-compatible base URL or connect Cursor to <code>/mcp</code>. Expand product-led into cache,
            routing, Flywheel, memory, and documents — without changing your endpoint.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start 14-day trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/getting-started`} size="lg">
              Self-host free <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
