import { AnnouncementBadge } from '@/components/elements/announcement-badge'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { InstallCommand } from '@/components/elements/install-command'
import { ClawQLHeroLogo } from '@/components/elements/clawql-hero-logo'
import { Link } from '@/components/elements/link'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import {
  CaseStudyCard,
  CaseStudyGrid,
  IdpStageCard,
  ToolTierSection,
} from '@/components/sections/clawql-marketing'
import { FAQsTwoColumnAccordion, Faq } from '@/components/sections/faqs-two-column-accordion'
import { HeroTwoColumnWithPhoto } from '@/components/sections/hero-two-column-with-photo'
import { Plan, PricingMultiTier } from '@/components/sections/pricing-multi-tier'
import { Stat, StatsFourColumns } from '@/components/sections/stats-four-columns'
import { Section } from '@/components/elements/section'
import { WorkflowFeedSection } from '@/components/sections/workflow-feed'
import { caseStudies, idpPipelineStages, mcpToolTiers, multiProviderBenchmark } from '@/lib/marketing'
import { workflowFeeds } from '@/lib/workflow-feeds'
import { managedPrice, pricing } from '@/lib/pricing'
import { site } from '@/lib/site'

export default function Page() {
  return (
    <>
      {/* Hero */}
      <HeroTwoColumnWithPhoto
        id="hero"
        eyebrow={
          <AnnouncementBadge
            href={site.urls.signup}
            text="Managed accounts with full IDP pipeline — join the waitlist"
            cta="Sign up"
          />
        }
        headline="Memory, APIs, and documents in one closed loop."
        subheadline={
          <p>
            ClawQL is an MCP server where agents <strong>recall</strong> what you know, <strong>search</strong> the
            right API operation, <strong>execute</strong> it, and <strong>ingest</strong> the outcome back into the
            vault. Token-efficient by design — bundled specs stay server-side, not in your prompt.
          </p>
        }
        cta={
          <div className="flex w-full max-w-xl flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={site.urls.signup} size="lg">
                Get a managed account
              </ButtonLink>
              <PlainButtonLink href={`${site.urls.docs}/providers/idp-pipeline`} size="lg">
                Explore IDP pipeline <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
            <InstallCommand className="w-full max-w-lg" snippet={site.installCommand} />
          </div>
        }
        photo={<ClawQLHeroLogo />}
        photoFrame={false}
      />

      {/* Multi-provider token savings benchmark */}
      <StatsFourColumns
        id="proof"
        eyebrow="Token savings benchmark"
        headline="7,174 indexed endpoints → 62 surfaced by search."
        subheadline={
          <p>
            Offline workflow across {multiProviderBenchmark.providers}: stand up GKE, configure Cloudflare DNS and
            caching, and draft a Jira rollout — without pasting megabyte specs into the prompt.
          </p>
        }
        cta={
          <Link href={multiProviderBenchmark.href}>
            Read the benchmark <ArrowNarrowRightIcon />
          </Link>
        }
      >
        <Stat
          stat={multiProviderBenchmark.indexedOperations}
          text="API operations indexed across Google Cloud (4,141), Cloudflare (2,697), and Jira (336) — specs stay in the MCP server."
        />
        <Stat
          stat={multiProviderBenchmark.workflowOperations}
          text="Unique operations returned by search across 14 workflow steps — the candidates an agent actually needs."
        />
        <Stat
          stat={`${multiProviderBenchmark.planningTokensBefore} → ${multiProviderBenchmark.planningTokensAfter}`}
          text="Planning-context tokens: naive full-spec paste vs compact workflow artifact (~99.9% reduction)."
        />
        <Stat
          stat={multiProviderBenchmark.compressionRatio}
          text="Compression ratio on the three-provider benchmark — measured with ceil(bytes ÷ 4) token estimates."
        />
      </StatsFourColumns>

      {/* MCP tool tiers */}
      <Section
        id="tools"
        eyebrow="MCP tools"
        headline="Every tool has a job — and a clear boundary."
        subheadline={
          <p>
            Core discovery and execution are always on. Memory, documents, automation, and the IDP pipeline opt in when
            you need them — same surface in Cursor, OpenClaw, or your Kubernetes cluster.
          </p>
        }
      >
        <div className="flex flex-col gap-10">
          <ToolTierSection {...mcpToolTiers.core} />
          <ToolTierSection {...mcpToolTiers.memory} />
          <ToolTierSection {...mcpToolTiers.automation} />
          <ToolTierSection {...mcpToolTiers.idp} />
        </div>
      </Section>

      {/* Workflow feeds — tool calling sequences from case studies */}
      <WorkflowFeedSection
        id="workflows"
        eyebrow="Workflows in practice"
        headline="What a real ClawQL session looks like."
        subheadline={
          <p>
            Published case studies document the same pattern: agents call MCP tools in sequence — recall context,
            discover operations with <code className="text-sm">search</code>, act with{' '}
            <code className="text-sm">execute</code>, then persist outcomes with{' '}
            <code className="text-sm">memory_ingest</code>. These feeds show the chronology without pasting specs into
            the chat.
          </p>
        }
        feeds={workflowFeeds}
      />

      {/* IDP pipeline */}
      <Section
        id="idp"
        eyebrow="Intelligent document processing"
        headline="Eight vendors. One agent-composable pipeline."
        subheadline={
          <p>
            Drop a file in Nextcloud; agents orchestrate layout parsing, PDF normalization, PII redaction, archival, hybrid
            search, and secure sharing — via <code className="text-sm">search</code> → <code className="text-sm">execute</code>{' '}
            or automated <code className="text-sm">run_idp_pipeline</code>. Self-host the full stack with Helm; managed
            accounts run the ClawQL-native archive layer.
          </p>
        }
        cta={
          <Link href={`${site.urls.docs}/providers/idp-pipeline`}>
            IDP pipeline reference <ArrowNarrowRightIcon />
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {idpPipelineStages.map((stage) => (
            <IdpStageCard key={stage.vendor} {...stage} />
          ))}
        </div>
      </Section>

      {/* Case studies */}
      <CaseStudyGrid
        id="case-studies"
        eyebrow="Case studies"
        headline="Published workflows — not marketing fiction."
        subheadline={
          <p>
            Each study documents real tool traces, failures, fixes, and token measurements. Read the full narratives on{' '}
            <a href={`${site.urls.docs}/case-studies`} className="underline">
              docs.clawql.com
            </a>
            .
          </p>
        }
        footer={
          <Link href={`${site.urls.docs}/case-studies`} className="mt-6">
            View all case studies <ArrowNarrowRightIcon />
          </Link>
        }
      >
        {caseStudies.map((study) => (
          <CaseStudyCard key={study.slug} {...study} />
        ))}
      </CaseStudyGrid>

      {/* FAQs */}
      <FAQsTwoColumnAccordion id="faqs" headline="Questions & Answers">
        <Faq
          id="faq-1"
          question="What's the difference between cache, audit, and memory_*?"
          answer="cache is ephemeral LRU scratch for the active session — gone on restart. audit is an in-process ring buffer for structured operator events. memory_ingest and memory_recall persist Markdown in your Obsidian vault with wikilinks — durable institutional knowledge across sessions."
        />
        <Faq
          id="faq-2"
          question="What's the difference between shared and dedicated managed hosting?"
          answer="Shared managed hosting is multi-tenant — cost-effective at $299/month ($250/month on annual billing) but may see reduced performance during bursts and is not fully isolated for strict compliance. Dedicated managed hosting runs on hardware for your organization only at $599/month ($500/month annual) — full isolation, no neighbor tenants."
        />
        <Faq
          id="faq-3"
          question="Can OpenClaw or Cursor use the same vault?"
          answer="Yes. Point CLAWQL_OBSIDIAN_VAULT_PATH at a shared vault mount. OpenClaw agents call memory_recall over Streamable HTTP and get notes ingested from prior Cursor sessions — validated in our June 2026 case study."
        />
        <Faq
          id="faq-4"
          question="Do you offer enterprise contracts?"
          answer="Yes — for very high volume, custom SLAs, and on-call support. We don't list a fixed enterprise price; contracts are scoped individually and typically start around $3,000/month. Contact sales to discuss."
        />
      </FAQsTwoColumnAccordion>

      {/* Pricing */}
      <PricingMultiTier
        id="pricing"
        headline="Self-host free. Shared or dedicated managed hosting when you're ready."
        plans={
          <>
            <Plan
              name={pricing.selfHosted.name}
              price={pricing.selfHosted.price}
              period={pricing.selfHosted.period}
              subheadline={<p>{pricing.selfHosted.subheadline}</p>}
              features={[...pricing.selfHosted.features]}
              cta={
                <ButtonLink href={`${site.urls.docs}/readme/getting-started`} size="lg">
                  Quick start
                </ButtonLink>
              }
            />
            <Plan
              name={pricing.shared.name}
              price={managedPrice('shared', 'Monthly')}
              period={pricing.shared.period}
              subheadline={<p>{pricing.shared.subheadline}</p>}
              badge={pricing.shared.badge}
              features={[...pricing.shared.features]}
              cta={
                <ButtonLink href={site.urls.signup} size="lg">
                  Join waitlist
                </ButtonLink>
              }
            />
            <Plan
              name={pricing.dedicated.name}
              price={managedPrice('dedicated', 'Monthly')}
              period={pricing.dedicated.period}
              subheadline={<p>{pricing.dedicated.subheadline}</p>}
              badge={pricing.dedicated.badge}
              features={[...pricing.dedicated.features]}
              cta={
                <ButtonLink href={site.urls.signup} size="lg">
                  Join waitlist
                </ButtonLink>
              }
            />
          </>
        }
      />

      <CallToActionSimple
        id="enterprise-pricing"
        headline="Need enterprise SLAs or on-call support?"
        subheadline={<p>{pricing.enterprise.subheadline}</p>}
        cta={
          <ButtonLink href={site.urls.contact} size="lg">
            Contact sales
          </ButtonLink>
        }
      />

    </>
  )
}
