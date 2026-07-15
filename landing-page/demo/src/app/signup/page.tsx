import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { InstallCommand } from '@/components/elements/install-command'
import { Section } from '@/components/elements/section'
import { WaitlistSignupForm } from '@/components/elements/waitlist-signup-form'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CheckmarkIcon } from '@/components/icons/checkmark-icon'
import { IdpStageCard, ToolCard } from '@/components/sections/clawql-marketing'
import { Feature, FeaturesThreeColumn } from '@/components/sections/features-three-column'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { idpPipelineStages, mcpToolTiers } from '@/lib/marketing'
import { hostedFreeTrial, pricing } from '@/lib/pricing'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Sign up for managed ClawQL',
  description:
    'Start a 14-day ClawQL Developer trial or book a demo — edge-hosted MCP with vault memory, or self-host free on Apache 2.0.',
  path: '/signup',
})

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="signup-hero"
        headline="Start your 14-day trial or book a demo"
        subheadline={
          <p>
            {site.earlyAccess.summary} Real estate teams: see the{' '}
            <a href="/industries/real-estate#demo-pitch" className="underline">
              one-paragraph pitch
            </a>{' '}
            to forward before your demo. Developer trial is {hostedFreeTrial.durationDays} days, no credit card. Gateway
            from {pricing.developer.monthlyPrice}/mo, Teams {pricing.teams.monthlyPrice}/mo, IDP bundle from{' '}
            {pricing.starter.monthlyPrice}/mo. {site.waitlistPromise}
          </p>
        }
        cta={<WaitlistSignupForm className="mx-auto" />}
      />

      <Section
        id="managed-tools"
        eyebrow="Included on managed"
        headline="The same MCP tools — hosted for you."
        subheadline={
          <p>Every tier below ships with core discovery and execution. Managed adds persistence, IDP, and ops.</p>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {mcpToolTiers.core.tools.map((tool) => (
            <ToolCard key={tool.name} name={tool.name} help={tool.help} />
          ))}
        </div>
      </Section>

      <FeaturesThreeColumn
        id="signup-benefits"
        eyebrow="Why managed"
        headline="IDP pipeline + vault memory, minus the Helm charts."
        subheadline={
          <p>
            Self-hosters run <code className="text-sm">clawql-idp</code> with eight co-deployed vendors. Managed
            accounts deliver the same compose path with upgrades, backups, and observability handled.
          </p>
        }
        features={
          <>
            <Feature
              icon={<CheckmarkIcon />}
              headline="run_idp_pipeline"
              subheadline={
                <p>
                  Automated Nextcloud → Docling/Tika → Gotenberg → Stirling → archive → Onyx → Coneshare — one tool
                  call, retries and Merkle snapshots included.
                </p>
              }
            />
            <Feature
              icon={<CheckmarkIcon />}
              headline="memory_recall across clients"
              subheadline={
                <p>
                  Cursor, OpenClaw, and Claude Desktop share one vault. Agents recall prior session notes without
                  copy-paste — proven in production case studies.
                </p>
              }
            />
            <Feature
              icon={<CheckmarkIcon />}
              headline="knowledge_search_onyx"
              subheadline={
                <p>
                  Hybrid enterprise search over your indexed documents. Agents ground answers in Onyx hits, not model
                  improvisation.
                </p>
              }
            />
          </>
        }
      />

      <Section id="idp-stages" headline="Eight vendors, one pipeline.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {idpPipelineStages.map((stage) => (
            <IdpStageCard key={stage.vendor} {...stage} />
          ))}
        </div>
      </Section>

      <section className="py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 text-center">
          <p className="text-sm/7 text-mist-700 dark:text-mist-400">
            Want full control? Self-host with npm or Helm — every tool, every vendor, zero license fee.
          </p>
          <InstallCommand className="w-full max-w-lg" snippet={site.installCommand} />
          <PlainButtonLink href={`${site.urls.docs}/deployment/clawql-idp-helm`} size="lg">
            IDP Helm guide <ArrowNarrowRightIcon />
          </PlainButtonLink>
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 text-center">
          <p className="text-sm/7 text-mist-700 dark:text-mist-400">
            Enterprise: dedicated node, custom fine-tuning, EU multi-region — from {pricing.enterprise.priceFrom}
            {pricing.enterprise.period}.{' '}
            <a href={site.urls.contact} className="underline">
              Contact sales
            </a>{' '}
            to scope requirements.
          </p>
          <ButtonLink href={site.urls.contact} size="lg">
            Contact sales
          </ButtonLink>
        </div>
      </section>
    </>
  )
}
