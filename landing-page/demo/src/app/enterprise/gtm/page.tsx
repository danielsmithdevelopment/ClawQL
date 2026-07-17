import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { EnterpriseGtmPlaybook } from '@/components/sections/enterprise-gtm-playbook'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Enterprise GTM playbook',
  description:
    'ClawQL enterprise go-to-market playbook — the sovereign alternative to Palantir AIP, with Inference, IDP, and agentic infrastructure positioning.',
  path: '/enterprise/gtm',
})

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        eyebrow={<p className="text-sm/7 font-medium text-mist-600 dark:text-mist-300">Enterprise GTM · July 2026</p>}
        headline="The sovereign alternative to Palantir AIP"
        subheadline={
          <p>
            ClawQL’s enterprise go-to-market playbook for regulated buyers — CISOs, CTOs, and FinOps — built around
            agentic transparency, verifiable governance, and a three-phase adoption motion.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/getting-started`} size="lg">
              Self-host free <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />

      <EnterpriseGtmPlaybook />

      <CallToActionSimpleCentered
        id="cta"
        headline="Start with observation. Own the stack later."
        subheadline={
          <p>
            Deploy inference observability in an afternoon, then layer governance and sovereignty as your audit trail
            and FinOps case strengthen.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Start 14-day trial
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/architecture`} size="lg">
              Read architecture docs <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
