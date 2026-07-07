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
  executionOveragePerThousand,
  managedPrice,
  pluginBundles,
  pricing,
  pricingPlanNames,
  sovereignSecurityPack,
  type BillingPeriod,
  type GatewayTierId,
  type IdpTierId,
} from '@/lib/pricing'
import { site } from '@/lib/site'

function gatewayPlans(billing: BillingPeriod) {
  const gatewayTiers: GatewayTierId[] = ['developer', 'teams']

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
      {gatewayTiers.map((tier) => {
        const plan = pricing[tier]
        const annualNote = annualBillingNoteText(billing, tier)
        return (
          <Plan
            key={tier}
            name={plan.name}
            price={managedPrice(tier, billing)}
            period={plan.period}
            subheadline={
              <p>
                {plan.subheadline}
                {annualNote ? <span className="block text-mist-500">{annualNote}</span> : null}
              </p>
            }
            badge={plan.badge}
            features={[...plan.features]}
            cta={
              <ButtonLink href={site.urls.signup} size="lg">
                Join early access
              </ButtonLink>
            }
          />
        )
      })}
    </>
  )
}

function idpPlans(billing: BillingPeriod) {
  const idpTiers: IdpTierId[] = ['starter', 'business', 'professional']

  return (
    <>
      {idpTiers.map((tier) => {
        const plan = pricing[tier]
        const annualNote = annualBillingNoteText(billing, tier)
        return (
          <Plan
            key={tier}
            name={plan.name}
            price={managedPrice(tier, billing)}
            period={plan.period}
            subheadline={
              <p>
                {plan.subheadline}
                {annualNote ? <span className="block text-mist-500">{annualNote}</span> : null}
              </p>
            }
            badge={plan.badge}
            features={[...plan.features]}
            cta={
              <ButtonLink href={site.urls.signup} size="lg">
                Join early access
              </ButtonLink>
            }
          />
        )
      })}
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

      <Section
        id="plugin-bundles"
        eyebrow="Plugin model"
        headline="Pay for the plugins you activate"
        subheadline={
          <p>
            ClawQL Core (<code className="text-sm">search</code>, <code className="text-sm">execute</code>,{' '}
            <code className="text-sm">audit</code>, <code className="text-sm">cache</code>) is always on. Memory, IDP,
            and vertical packages activate via <code className="text-sm">CLAWQL_ENABLE_*</code> flags — managed tiers map
            to plugin bundles, not one-size-fits-all document quotas.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {Object.values(pluginBundles).map((bundle) => (
            <div key={bundle.name} className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-5 dark:bg-white/5">
              <h3 className="text-base font-semibold text-mist-950 dark:text-white">{bundle.name}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{bundle.description}</p>
              <p className="text-xs text-mist-500">Tiers: {bundle.tiers.join(' · ')}</p>
            </div>
          ))}
        </div>
      </Section>

      <PricingHeroMultiTier
        id="pricing-gateway"
        headline="Agent gateway & memory"
        subheadline={
          <p>
            MCP gateway + vault memory for teams connecting agents to APIs — no IDP pipeline, no GPU inference. Execution
            overage {executionOveragePerThousand}/1,000 beyond included volume.
          </p>
        }
        options={['Monthly', 'Yearly']}
        annualSavingsLabel={annualBillingSavingsLabel}
        plans={{ Monthly: gatewayPlans('Monthly'), Yearly: gatewayPlans('Yearly') }}
      />

      <PricingHeroMultiTier
        id="pricing-idp"
        headline="IDP plugin bundle"
        subheadline={
          <p>
            Document processing, Coneshare VDR, and sovereign inference — explicitly opted in. Storage overage $0.02/GB
            on Starter and Business, $0.015/GB on Professional.
          </p>
        }
        options={['Monthly', 'Yearly']}
        annualSavingsLabel={annualBillingSavingsLabel}
        plans={{ Monthly: idpPlans('Monthly'), Yearly: idpPlans('Yearly') }}
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
            title: 'Plugin bundle',
            features: [
              {
                name: 'MCP Gateway (Core)',
                value: {
                  'Self-hosted': true,
                  Free: true,
                  Developer: true,
                  Teams: true,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
              {
                name: 'Memory vault + Onyx search',
                value: {
                  'Self-hosted': 'Self-managed',
                  Free: 'Basic vault',
                  Developer: true,
                  Teams: 'Full Onyx',
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
              {
                name: 'IDP plugin bundle',
                value: {
                  'Self-hosted': 'Opt-in',
                  Free: false,
                  Developer: false,
                  Teams: false,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
            ],
          },
          {
            title: 'Usage & metering',
            features: [
              {
                name: 'Executions / month',
                value: {
                  'Self-hosted': 'Unlimited (your infra)',
                  Free: '10,000',
                  Developer: '50,000',
                  Teams: '250,000',
                  Starter: '—',
                  Business: '—',
                  Professional: '—',
                },
              },
              {
                name: 'Execution overage',
                value: {
                  'Self-hosted': 'N/A',
                  Free: executionOveragePerThousand + '/1K',
                  Developer: executionOveragePerThousand + '/1K',
                  Teams: executionOveragePerThousand + '/1K',
                  Starter: '—',
                  Business: '—',
                  Professional: '—',
                },
              },
              {
                name: 'Documents / month',
                value: {
                  'Self-hosted': 'Unlimited (your infra)',
                  Free: '—',
                  Developer: '—',
                  Teams: '—',
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
                  Developer: '3',
                  Teams: '10',
                  Starter: '5',
                  Business: '25',
                  Professional: 'Unlimited',
                },
              },
            ],
          },
          {
            title: 'Document intelligence (IDP bundle)',
            features: [
              {
                name: 'Coneshare VDR',
                value: {
                  'Self-hosted': 'Self-deploy optional',
                  Free: false,
                  Developer: false,
                  Teams: false,
                  Starter: true,
                  Business: true,
                  Professional: 'Full + advanced analytics',
                },
              },
              {
                name: 'Sovereign inference',
                value: {
                  'Self-hosted': 'Your deployment',
                  Free: false,
                  Developer: false,
                  Teams: false,
                  Starter: true,
                  Business: true,
                  Professional: true,
                },
              },
              {
                name: 'classify / extract / HITL',
                value: {
                  'Self-hosted': 'Opt-in',
                  Free: false,
                  Developer: false,
                  Teams: false,
                  Starter: true,
                  Business: true,
                  Professional: true,
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
                  Developer: 'None',
                  Teams: '99% uptime',
                  Starter: '99% uptime',
                  Business: '99.5% uptime',
                  Professional: '99.9% uptime',
                },
              },
              {
                name: 'SSO / SAML',
                value: {
                  'Self-hosted': false,
                  Free: false,
                  Developer: false,
                  Teams: false,
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
          answer="Yes. ClawQL is open source. You pay only for compute and storage on your hardware. Enable plugins via CLAWQL_ENABLE_* flags — Core is always on; IDP vendors activate when you need document processing."
        />
        <Faq
          id="faq-2"
          question="What's the difference between Developer, Teams, and Starter?"
          answer={`Developer (${pricing.developer.monthlyPrice}/mo) is MCP gateway + memory vault — no IDP. Teams (${pricing.teams.monthlyPrice}/mo) adds full Onyx semantic search. Starter (${pricing.starter.monthlyPrice}/mo) activates the IDP plugin bundle (classify, extract, VDR, sovereign inference). You only pay for document processing when you opt into IDP tiers.`}
        />
        <Faq
          id="faq-3"
          question="How does ClawQL compare to executor.sh?"
          answer={`executor.sh is a stateless MCP tool router — one token-efficiency layer, basic audit log, no memory, no semantic search, no document pipeline. ClawQL Developer (${pricing.developer.monthlyPrice}/mo) and Teams (${pricing.teams.monthlyPrice}/mo) implement the same search/execute pattern plus seven additional efficiency layers, persistent Obsidian vault memory, and Onyx semantic search. IDP tiers from ${pricing.starter.monthlyPrice}/mo add document processing, Coneshare VDR, and sovereign inference — none of which executor.sh offers at any price.`}
        />
        <Faq
          id="faq-4"
          question="Can I switch tiers later?"
          answer="Yes. Vault exports, provider auth, and plugin flags migrate between tiers. Start on Teams for agent memory; upgrade to Starter when you need IDP document processing."
        />
        <Faq
          id="faq-5"
          question="How does ClawQL IDP pricing compare to Hyperscience or ABBYY?"
          answer={`Incumbent IDP vendors charge per page or $40K–$100K+/year. ClawQL Business (IDP bundle) is ${pricing.business.monthlyPrice}/month flat with VDR, semantic search, and agent orchestration included — see the competitive section for TCO math.`}
        />
        <Faq
          id="faq-6"
          question="What tier fits real estate teams on Command + Google Drive?"
          answer={`Teams (${pricing.teams.monthlyPrice}/mo) for MCP gateway + Onyx search over Drive folders + vault memory across deals. Add Starter (${pricing.starter.monthlyPrice}/mo) when you need title commitment classify/extract or Coneshare VDR for trackable disclosure packages. See /industries/real-estate.`}
        />
        <Faq
          id="faq-7"
          question="What is the Sovereign Security Pack?"
          answer={`The Sovereign Security Pack (${sovereignSecurityPack.monthlyPrice}${sovereignSecurityPack.period}) is an optional add-on on any paid tier. Enterprise includes it by default.`}
        />
        <Faq
          id="faq-8"
          question="Do you publish enterprise pricing?"
          answer={`Enterprise contracts start from ${pricing.enterprise.priceFrom}${pricing.enterprise.period} for dedicated nodes, custom fine-tuning, EU multi-region, DPA/BAA, and a dedicated CSM.`}
        />
      </FAQsAccordion>

      <CallToActionSimpleCentered
        id="call-to-action"
        headline="Self-host free or join early access"
        subheadline={
          <p>
            Install clawql-mcp on your hardware, or join the waitlist — gateway from {pricing.developer.monthlyPrice}/mo,
            IDP bundle from {pricing.starter.monthlyPrice}/mo.
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
