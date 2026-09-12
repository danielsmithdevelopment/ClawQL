import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Section } from '@/components/elements/section'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { CompetitivePricingSection } from '@/components/sections/competitive-pricing-section'
import { FAQsAccordion, Faq } from '@/components/sections/faqs-accordion'
import { PlanComparisonTable } from '@/components/sections/plan-comparison-table'
import { Plan, PricingHeroMultiTier } from '@/components/sections/pricing-hero-multi-tier'
import {
  annualBillingNoteText,
  annualBillingSavingsLabel,
  hostedFreeTrial,
  managedPrice,
  pluginBundles,
  pricing,
  pricingPlanNames,
  sovereignSecurityPack,
  unlimitedExecutionsTagline,
  type BillingPeriod,
  type GatewayTierId,
  type IdpTierId,
} from '@/lib/pricing'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

function gatewayPlans(billing: BillingPeriod) {
  const gatewayTiers: GatewayTierId[] = ['developer', 'teams']

  return (
    <>
      {gatewayTiers.map((tier) => {
        const plan = pricing[tier]
        const annualNote = annualBillingNoteText(billing, tier)
        const isDeveloper = tier === 'developer'
        return (
          <Plan
            key={tier}
            name={plan.name}
            price={managedPrice(tier, billing)}
            period={plan.period}
            subheadline={
              <p>
                {plan.subheadline}
                {annualNote ? <span className="block text-mist-600">{annualNote}</span> : null}
              </p>
            }
            badge={plan.badge}
            features={[...plan.features]}
            cta={
              <ButtonLink href={site.urls.signup} size="lg">
                {isDeveloper ? 'Start free trial' : 'Join early access'}
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
                {annualNote ? <span className="block text-mist-600">{annualNote}</span> : null}
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

export const metadata = pageMetadata({
  title: 'Pricing',
  description:
    'ClawQL pricing for self-host, Developer trial, Teams gateway, and IDP tiers — unlimited MCP executions with vault memory on one endpoint.',
  path: '/pricing',
})

export default function Page() {
  return (
    <>
      <Section id="self-hosted" eyebrow="Open source" headline="Run it yourself, free forever">
        <div className="flex flex-col gap-6 rounded-xl bg-mist-950/2.5 p-6 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5">
          <div className="max-w-2xl">
            <p className="text-sm/7 text-mist-700 dark:text-mist-400">{pricing.selfHosted.subheadline}</p>
            <ul className="mt-4 space-y-1 text-sm/7 text-mist-600 dark:text-mist-600">
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
            <code className="text-sm">audit</code>, <code className="text-sm">cache</code>) is always on. Gateway
            bundles run at the global edge; the IDP bundle provisions dedicated document-processing infrastructure when
            you opt in — same MCP endpoint and vault across upgrades.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {Object.values(pluginBundles).map((bundle) => (
            <div key={bundle.name} className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-5 dark:bg-white/5">
              <h3 className="text-base font-semibold text-mist-950 dark:text-white">{bundle.name}</h3>
              <p className="text-sm/7 text-mist-700 dark:text-mist-400">{bundle.description}</p>
              <p className="text-xs text-mist-600">Tiers: {bundle.tiers.join(' · ')}</p>
            </div>
          ))}
        </div>
      </Section>

      <PricingHeroMultiTier
        id="pricing-gateway"
        headline="Agent gateway & memory"
        subheadline={
          <p>
            Global edge-hosted MCP endpoint + vault memory for teams connecting agents to APIs.{' '}
            {unlimitedExecutionsTagline}
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
            Dedicated tenant infrastructure for document processing, Coneshare VDR, and sovereign inference — explicitly
            opted in. Your MCP endpoint and vault memory stay the same when you upgrade from Teams. Storage overage
            $0.02/GB on Starter and Business, $0.015/GB on Professional.
          </p>
        }
        options={['Monthly', 'Yearly']}
        annualSavingsLabel={annualBillingSavingsLabel}
        plans={{ Monthly: idpPlans('Monthly'), Yearly: idpPlans('Yearly') }}
      />

      <Section
        id="free-trial"
        eyebrow="Hosted entry"
        headline={`${hostedFreeTrial.headline} — no credit card required`}
      >
        <p className="max-w-3xl text-sm/7 text-mist-700 dark:text-mist-400">{hostedFreeTrial.subheadline}</p>
        <p className="mt-4 max-w-3xl text-sm/7 text-mist-600 dark:text-mist-600">
          Evaluate the full Developer tier — not a crippled sandbox. When the trial ends, continue at{' '}
          {pricing.developer.monthlyPrice}/mo or upgrade to Teams. Prefer zero cost? Self-host the full Apache 2.0 stack
          with no feature restrictions.
        </p>
        <ButtonLink href={site.urls.signup} size="lg" className="mt-6">
          Start free trial
        </ButtonLink>
      </Section>

      <Section id="document-processing-tiers" eyebrow="IDP tiers" headline="Document processing tiers">
        <p className="max-w-3xl text-sm/7 text-mist-700 dark:text-mist-400">{site.earlyAccess.pricingNote}</p>
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
            title: 'Usage',
            features: [
              {
                name: 'MCP executions',
                value: {
                  'Self-hosted': 'Unlimited (your infra)',
                  Developer: 'Unlimited',
                  Teams: 'Unlimited',
                  Starter: 'Unlimited',
                  Business: 'Unlimited',
                  Professional: 'Unlimited',
                },
              },
              {
                name: 'Gateway hosting',
                value: {
                  'Self-hosted': 'Your infra',
                  Developer: 'Global edge',
                  Teams: 'Global edge',
                  Starter: 'Dedicated tenant',
                  Business: 'Dedicated tenant',
                  Professional: 'Dedicated tenant',
                },
              },
              {
                name: 'MCP endpoint',
                value: {
                  'Self-hosted': 'Your deployment',
                  Developer: 'Same URL all tiers',
                  Teams: 'Same URL all tiers',
                  Starter: 'Same URL all tiers',
                  Business: 'Same URL all tiers',
                  Professional: 'Same URL all tiers',
                },
              },
              {
                name: 'Vault on tier upgrade',
                value: {
                  'Self-hosted': 'Your data',
                  Developer: 'Carries over',
                  Teams: 'Carries over',
                  Starter: 'Carries over',
                  Business: 'Carries over',
                  Professional: 'Carries over',
                },
              },
              {
                name: 'Vault recall egress',
                value: {
                  'Self-hosted': 'Your infra',
                  Developer: 'No penalties',
                  Teams: 'No penalties',
                  Starter: 'Included',
                  Business: 'Included',
                  Professional: 'Included',
                },
              },
              {
                name: 'Documents / month',
                value: {
                  'Self-hosted': 'Unlimited (your infra)',
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
                  Developer: '1',
                  Teams: '5',
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
          answer="Yes — that is your free tier. ClawQL is Apache 2.0 open source. Run the full stack on your hardware with no license fee and no feature restrictions. You pay only for compute and storage. Enable plugins via CLAWQL_ENABLE_* flags — Core is always on; IDP vendors activate when you need document processing."
        />
        <Faq
          id="faq-1b"
          question="Do I need a credit card to start the free trial?"
          answer={`No. The ${hostedFreeTrial.durationDays}-day trial gives you the full Developer tier — persistent vault memory, unlimited executions, global edge endpoint. No credit card required. When the trial ends, continue at ${pricing.developer.monthlyPrice}/mo or upgrade to Teams.`}
        />
        <Faq
          id="faq-2"
          question="What's the difference between Developer, Teams, and Starter?"
          answer={`Developer (${pricing.developer.monthlyPrice}/mo) is MCP gateway + memory vault — no IDP. Teams (${pricing.teams.monthlyPrice}/mo) adds full Onyx semantic search. Starter (${pricing.starter.monthlyPrice}/mo) activates the IDP plugin bundle (classify, extract, VDR, sovereign inference). You only pay for document processing when you opt into IDP tiers.`}
        />
        <Faq
          id="faq-3"
          question="How does ClawQL compare to executor.sh?"
          answer={`executor.sh is a tool — it routes MCP calls well and has a head start on developer marketing. ClawQL covers the same Layer 1 search/execute pattern, plus seven additional efficiency layers, persistent vault memory, Onyx search, unlimited executions (no meter), and optional IDP from ${pricing.starter.monthlyPrice}/mo. At gateway tiers, ClawQL Developer (${pricing.developer.monthlyPrice}/mo) and Teams (${pricing.teams.monthlyPrice}/mo) deliver more for less than executor.sh Team ($150/mo + overage). We approached executor.sh about collaboration before publishing comparisons; buyers deserve an honest infrastructure evaluation.`}
        />
        <Faq
          id="faq-3b"
          question="Are MCP executions really unlimited?"
          answer="Yes. Every hosted tier — Developer through Enterprise — includes unlimited MCP executions. We price on hosting model, storage, and plugin bundles because those drive real infrastructure cost — not per-call metering or egress on memory recall. Gateway tiers scale at the global edge; taxing executions or recall only encourages customers to throttle their agents. executor.sh is the outlier with execution caps and overage billing."
        />
        <Faq
          id="faq-payments-p2p"
          question="Does managed ClawQL offer peer-to-peer payments or Venmo-like transfers?"
          answer="Managed hosting does not offer a public Venmo-like payments network. Companies can use closed-loop ClawQL credits: a company pool, role budgets (for example intern / employee / senior), CFO top-ups, and transfers only between people on the same company plan — redeemable solely for ClawQL services. Stripe handles real money in for subscriptions. Cross-company peer payments are not part of managed SaaS."
        />
        <Faq
          id="faq-4"
          question="Can I switch tiers later?"
          answer="Yes. Upgrade from Teams to Starter (or any IDP tier) without changing your MCP endpoint URL, auth token, or vault memory — agents pick up where they left off. Vault exports, provider auth, and plugin flags migrate between tiers. Start on Teams for agent memory; add the IDP bundle when you need document processing."
        />
        <Faq
          id="faq-4b"
          question="Why are gateway and IDP tiers priced differently?"
          answer="Gateway tiers (Developer, Teams) need only MCP routing, vault memory, cache, and audit — lightweight workloads that run at the global edge. IDP tiers (Starter+) activate document processing, Onyx at scale, Coneshare VDR, and sovereign inference on dedicated tenant infrastructure. You only pay for the heavy stack when you opt in. No perpetual free hosted plan — self-host free forever or start a 14-day Developer trial."
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
        headline="Self-host free or start your 14-day trial"
        subheadline={
          <p>
            Install clawql-mcp on your hardware — Apache 2.0, no license fee — or try hosted Developer free for{' '}
            {hostedFreeTrial.durationDays} days. Gateway from {pricing.developer.monthlyPrice}/mo, IDP bundle from{' '}
            {pricing.starter.monthlyPrice}/mo.
          </p>
        }
        cta={
          <div className="flex items-center gap-4">
            <ButtonLink href={site.urls.signup} size="lg">
              Start free trial
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
