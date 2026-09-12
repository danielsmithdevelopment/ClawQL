import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { IdpGtmPlaybook } from '@/components/sections/idp-gtm-playbook'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'IDP-first GTM playbook',
  description:
    'Standalone ClawQL IDP go-to-market: market reality, honest positioning, sales motion, landing-page brief, and competitive tables vs ABBYY, Hyperscience, and Intralinks.',
  path: '/idp/gtm',
})

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow={<p className="text-sm/7 font-medium text-mist-600 dark:text-mist-300">IDP-first GTM · July 2026</p>}
        headline="Document processing that doesn't stop at extraction"
        subheadline={
          <p>
            Standalone Intelligent Document Processing motion for ops, compliance, legal, lending, and M&amp;A — full
            lifecycle from ingest to secure distribution, Merkle audit trails, MCP-native agents, Starter at $299/mo.
            Developer motion: <Link href={site.urls.inferenceGtm}>inference-first GTM</Link>. Enterprise motion:{' '}
            <Link href={site.urls.enterpriseGtm}>enterprise GTM</Link>.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.idp} size="lg">
              View IDP landing
            </ButtonLink>
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/vision/idp-platform`} size="lg">
              IDP platform docs <ArrowNarrowRightIcon />
            </PlainButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/deployment/kubernetes`} size="lg">
              Deploy with Helm <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />

      <IdpGtmPlaybook />

      <CallToActionSimpleCentered
        id="cta"
        headline="Land with pipeline, VDR, and auditability at a price incumbents cannot match."
        subheadline={
          <p>
            Land with pipeline + VDR + auditability at a price incumbents cannot match. When buyers are ready, the same
            endpoint is also an inference gateway and memory system — without a second vendor conversation.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start 14-day trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/vision/idp-platform`} size="lg">
              Read IDP docs <ArrowNarrowRightIcon />
            </PlainButtonLink>
            <PlainButtonLink href={site.urls.pricing} size="lg">
              View pricing <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
