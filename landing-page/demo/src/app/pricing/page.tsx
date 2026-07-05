import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { CompetitivePricingSection } from '@/components/sections/competitive-pricing-section'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { FAQsAccordion, Faq } from '@/components/sections/faqs-accordion'
import { PlanComparisonTable } from '@/components/sections/plan-comparison-table'
import { Plan, PricingHeroMultiTier } from '@/components/sections/pricing-hero-multi-tier'
import { Section } from '@/components/elements/section'
import {
  annualBillingNoteText,
  annualBillingSavingsLabel,
  managedPrice,
  pricing,
  pricingPlanNames,
  sovereignSecurityPack,
  type BillingPeriod,
} from '@/lib/pricing'
import { site } from '@/lib/site'

function managedPlans(billing: BillingPeriod) {
  const annualNote = annualBillingNoteText(billing)

  return (
    <>
      <Plan
        name={pricing.managedFree.name}
        price={pricing.managedFree.monthlyPrice}
        period={pricing.managedFree.period}
        subheadline={<p>{pricing.managedFree.subheadline}</p>}
        badge={pricing.managedFree.badge}
        features={[...pricing.managedFree.features]}
        cta={
          <ButtonLink href={site.urls.signup} size="lg">
            Join early access
          </ButtonLink>
        }
      />
      <Plan
        name={pricing.starter.name}
        price={managedPrice('starter', billing)}
        period={pricing.starter.period}
        subheadline={
          <p>
            {pricing.starter.subheadline}
            {annualNote ? <span className="block text-mist-500">{annualNote}</span> : null}
          </p>
        }
        badge={pricing.starter.badge}
        features={[...pricing.starter.features]}
        cta={
          <ButtonLink href={site.urls.signup} size="lg">
            Join early access
          </ButtonLink>
        }
      />
      <Plan
        name={pricing.business.name}
        price={managedPrice('business', billing)}
        period={pricing.business.period}
        subheadline={
          <p>
            {pricing.business.subheadline}
            {annualNote ? <span className="block text-mist-500">{annualNote}</span> : null}
          </p>
        }
        badge={pricing.business.badge}
        features={[...pricing.business.features]}
        cta={
          <ButtonLink href={site.urls.signup} size="lg">
            Join early access
          </ButtonLink>
        }
      />
      <Plan
        name={pricing.professional.name}
        price={managedPrice('professional', billing)}
        period={pricing.professional.period}
        subheadline={
          <p>
            {pricing.professional.subheadline}
            {annualNote ? <span className="block text-mist-500">{annualNote}</span> : null}
          </p>
        }
        badge={pricing.professional.badge}
        features={[...pricing.professional.features]}
        cta={
          <ButtonLink href={site.urls.signup} size="lg">
            Join early access
          </ButtonLink>
        }
      />
    </>
  )
}

export const metadata = {
  title: 'Pricing',
}

export default function Page() {
  return (
    <>
      <Section id="self-hosted" eyebrow="Open source" headline="Self-host free on your hardware">
        <div className="flex flex-col gap-6 rounded-xl bg-mist-950/2.5 p-6 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5">
          <div className="max-w-2xl">
            <p className="text-sm/7 text-mist-700 dark:text-mist-400">{pricing.selfHosted.subheadline}</p>
            <ul className="mt-4 space-y-1 text-sm/7 text-mist-600 dark:text-mist-500">
              {pricing.selfHosted.features.map((feature) => (
                <li key={feature}>· {feature}</li>
              ))}
            </ul>
          </div>
          <ButtonLink href={`${site.urls.docs}/readme/getting-started`} size="lg" className="shrink-0">
            Quick start
          </ButtonLink>
        </div>
      </Section>

      <PricingHeroMultiTier
        id="pricing"
        headline="Managed hosting"
        subheadline={
          <p>
            {site.earlyAccess.summary} Document volume and storage limits apply per tier; storage overage billed at
            $0.02/GB on Starter and Business, $0.015/GB pass-through on Professional.
          </p>
        }
        options={['Monthly', 'Yearly']}
        annualSavingsLabel={annualBillingSavingsLabel}
        plans={{ Monthly: managedPlans('Monthly'), Yearly: managedPlans('Yearly') }}
      />

      <Section id="early-access" eyebrow="Early access" headline="Managed hosting is onboarding its first tenants">
        <p className="max-w-3xl text-sm/7 text-mist-700 dark:text-mist-400">{site.earlyAccess.pricingNote}</p>
        <p className="mt-4 max-w-3xl text-sm/7 text-mist-600 dark:text-mist-500">{site.waitlistPromise}</p>
      </Section>

      <CompetitivePricingSection />

      <PlanComparisonTable
        id="pricing-compare"
        plans={[...pricingPlanNames]}
        features={[
          {
            title: 'Usage & storage',
            features: [
              {
                name: 'Documents / month',
                value: {
                  'Self-hosted': 'Unlimited (your infra)',
                  Free: '200',
                  Starter: '5,000',
                  Business: '25,000',
                  Professional: '75,000',
                },
              },
              {
                name: 'Users',
                value: {
                  'Self-hosted': 'Unlimited',
                  Free: '1',
                  Starter: '5',
                  Business: '25',
                  Professional: 'Unlimited',
                },
              },
              {
                name: 'Storage included',
                value: {
                  'Self-hosted': 'Your choice',
                  Free: '5 GB',
                  Starter: '50 GB',
                  Business: '500 GB',
                  Professional: '2 TB',
                },
              },
              {
                name: 'Storage overage',
                value: {
                  'Self-hosted': 'N/A',
                  Free: 'N/A',
                  Starter: '$0.02/GB',
                  Business: '$0.02/GB',
                  Professional: '$0.015/GB',
                },
              },
            ],
          },
          {
            title: 'Document intelligence',
            features: [
              {
                name: 'Coneshare VDR',
                value: {
                  'Self-hosted': 'Self-deploy optional',
                  Free: false,
                  Starter: true,
                  Business: true,
                  Professional: 'Full + advanced analytics',
                },
              },
              {
                name: 'Onyx semantic search',
                value: {
                  'Self-hosted': 'Self-managed',
                  Free: 'Basic',
                  Starter: 'Full',
                  Business: 'Full + cross-doc',
                  Professional: 'Full + cross-doc',
                },
              },
              {
                name: 'Processing priority',
                value: {
                  'Self-hosted': '—',
                  Free: 'Low',
                  Starter: 'Standard',
                  Business: 'Priority',
                  Professional: 'Dedicated queue',
                },
              },
              {
                name: 'Obsidian memory vault',
                value: {
                  'Self-hosted': 'Self-managed',
                  Free: false,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
              {
                name: 'Dynamic watermarking (VDR)',
                value: {
                  'Self-hosted': 'Self-deploy optional',
                  Free: false,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
              {
                name: 'ClawQL Archive Layer (managed)',
                value: {
                  'Self-hosted': 'Paperless-ngx optional',
                  Free: true,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
            ],
          },
          {
            title: 'Platform',
            features: [
              {
                name: 'Hosted HTTP MCP',
                value: {
                  'Self-hosted': false,
                  Free: true,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
              {
                name: 'Tenant isolation',
                value: {
                  'Self-hosted': 'Your hardware',
                  Free: 'Shared',
                  Starter: 'Shared',
                  Business: 'Shared',
                  Professional: 'Dedicated namespace',
                },
              },
              {
                name: 'Merkle cryptographic audit trail',
                value: true,
              },
              {
                name: 'Sovereign inference (no external LLM APIs)',
                value: {
                  'Self-hosted': 'Your deployment',
                  Free: false,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
              {
                name: 'HITL review (Label Studio)',
                value: {
                  'Self-hosted': 'Self-deploy',
                  Free: false,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
              {
                name: 'Pre-trained document skill library',
                value: {
                  'Self-hosted': 'Vertical adapters',
                  Free: 'Vertical adapters',
                  Starter: 'Vertical adapters',
                  Business: 'Vertical adapters',
                  Professional: 'One vertical fine-tune included',
                },
              },
            ],
          },
          {
            title: 'Support & SLA',
            features: [
              {
                name: 'SLA',
                value: {
                  'Self-hosted': '—',
                  Free: 'None',
                  Starter: '99% uptime',
                  Business: '99.5% uptime',
                  Professional: '99.9% uptime',
                },
              },
              {
                name: 'Support',
                value: {
                  'Self-hosted': 'Community',
                  Free: 'Community',
                  Starter: 'Email (48 hr)',
                  Business: 'Email (24 hr)',
                  Professional: 'Slack Connect + email',
                },
              },
              {
                name: 'SSO / SAML',
                value: {
                  'Self-hosted': false,
                  Free: false,
                  Starter: false,
                  Business: false,
                  Professional: true,
                },
              },
            ],
          },
        ]}
      />

      <Section
        id="sovereign-security-pack"
        eyebrow="Add-on"
        headline={`${sovereignSecurityPack.name} — ${sovereignSecurityPack.monthlyPrice}${sovereignSecurityPack.period}`}
        subheadline={<p>{sovereignSecurityPack.subheadline}</p>}
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sovereignSecurityPack.features.map((feature) => (
            <li
              key={feature}
              className="rounded-xl bg-mist-950/2.5 px-4 py-3 text-sm/7 text-mist-700 dark:bg-white/5 dark:text-mist-400"
            >
              {feature}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="enterprise"
        eyebrow="Enterprise"
        headline={`Enterprise from ${pricing.enterprise.priceFrom}${pricing.enterprise.period}`}
        subheadline={
          <p>
            {pricing.enterprise.subheadline} Contact sales for annual terms, EU residency, and custom SLAs beyond
            Professional.
          </p>
        }
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pricing.enterprise.features.map((feature) => (
            <li
              key={feature}
              className="rounded-xl bg-mist-950/2.5 px-4 py-3 text-sm/7 text-mist-700 dark:bg-white/5 dark:text-mist-400"
            >
              {feature}
            </li>
          ))}
        </ul>
        <ButtonLink href={site.urls.contact} size="lg" className="mt-8">
          Contact sales
        </ButtonLink>
      </Section>

      <FAQsAccordion id="faqs" headline="Pricing questions">
        <Faq
          id="faq-1"
          question="Is self-hosted really free?"
          answer="Yes. ClawQL is open source. You pay only for compute and storage on your hardware. All core MCP tools and the full IDP pipeline are included with no license fee."
        />
        <Faq
          id="faq-2"
          question="What's the difference between Starter, Business, and Professional?"
          answer={`Starter (${pricing.starter.monthlyPrice}/mo) and Business (${pricing.business.monthlyPrice}/mo) run on shared multi-tenant infrastructure with document volume limits (5,000 and 25,000 documents/month). Professional (${pricing.professional.monthlyPrice}/mo) gives your organization a dedicated namespace, one vertical fine-tune adapter, SSO/SAML, and 99.9% uptime SLA. All managed tiers are in early access with founder-led onboarding.`}
        />
        <Faq
          id="faq-3"
          question="What is the managed Free tier?"
          answer="Free ($0/mo) lets you process up to 200 documents/month on hosted infrastructure with basic Onyx search — a way to try the real pipeline before upgrading to Starter for Coneshare VDR, sovereign inference, and higher limits. It is not the same as self-hosting, which has no document cap enforced by ClawQL."
        />
        <Faq
          id="faq-4"
          question="Can I switch tiers later?"
          answer="Yes. Vault exports, provider auth, and pipeline configuration can migrate between tiers. Upgrade when you hit document quotas or need Professional isolation and vertical fine-tuning for compliance."
        />
        <Faq
          id="faq-5"
          question="How does ClawQL pricing compare to Hyperscience or ABBYY?"
          answer={`Incumbent IDP vendors often charge per page ($0.02–$1.50+) or $40K–$100K+/year in enterprise contracts. A Business customer processing 25,000 documents/month at ~5 pages each would pay tens of thousands per month at per-page IDP rates. ClawQL Business is ${pricing.business.monthlyPrice}/month flat with IDP, VDR, semantic search, and agent orchestration bundled — see the competitive section above for illustrative TCO math.`}
        />
        <Faq
          id="faq-6"
          question="Why is ClawQL priced below legacy VDR and IDP stacks?"
          answer={`Intralinks, Datasite, and similar vendors price per deal, per page, or $10K–$200K+/year with storage overages and setup fees. Starter at ${pricing.starter.monthlyPrice}/month includes Coneshare VDR in the subscription. Pricing is anchored to replacement value — still 6–20× below the incumbent stack — while remaining credible to enterprise procurement teams.`}
        />
        <Faq
          id="faq-7"
          question="Do you match ABBYY's pre-trained document skills?"
          answer="Not on day one. ABBYY Vantage ships 150+ pre-built skills for common document types. ClawQL composes classify, extract, and HITL per vertical — lending W-2 samples ship today; broader skill libraries build with vertical packages. We state this openly in competitive evaluations rather than overclaiming."
        />
        <Faq
          id="faq-8"
          question="What is the Sovereign Security Pack?"
          answer={`The Sovereign Security Pack (${sovereignSecurityPack.monthlyPrice}${sovereignSecurityPack.period}) is an optional add-on on Starter, Business, and Professional. It bundles Kata VM isolation, model weight integrity verification, WORM Merkle audit logs, Panguard fail-closed ATR, and monthly posture reports. Enterprise includes it by default.`}
        />
        <Faq
          id="faq-9"
          question="Do you publish enterprise pricing?"
          answer={`Enterprise contracts start from ${pricing.enterprise.priceFrom}${pricing.enterprise.period} for dedicated nodes, custom fine-tuning with retraining, EU multi-region, DPA/BAA, and a dedicated CSM. Contact sales to discuss annual terms.`}
        />
      </FAQsAccordion>

      <CallToActionSimpleCentered
        id="call-to-action"
        headline="Self-host free or join early access"
        subheadline={
          <p>
            Install clawql-mcp on your hardware, or join the waitlist for managed Free, Starter, Business, or Professional
            hosting.
          </p>
        }
        cta={
          <div className="flex items-center gap-4">
            <ButtonLink href={site.urls.signup} size="lg">
              Join early access
            </ButtonLink>
            <PlainButtonLink href={site.urls.docs} size="lg">
              Self-host guide <ChevronIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
