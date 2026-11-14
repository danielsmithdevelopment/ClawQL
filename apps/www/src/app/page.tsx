import { AnnouncementBadge } from '@/components/elements/announcement-badge'
import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { ClawQLHeroLogo } from '@/components/elements/clawql-hero-logo'
import { InstallCommand } from '@/components/elements/install-command'
import { Link } from '@/components/elements/link'
import { Section } from '@/components/elements/section'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import {
  ClosedLoopSteps,
  OpenBenchProofTable,
  ProofChipRow,
  ToolTierSection,
} from '@/components/sections/clawql-marketing'
import { FAQsTwoColumnAccordion, Faq } from '@/components/sections/faqs-two-column-accordion'
import { HeroTwoColumnWithPhoto } from '@/components/sections/hero-two-column-with-photo'
import { SecuritySection } from '@/components/sections/security-section'
import {
  clawqlTeeSummary,
  homepageProofChips,
  mcpToolTiers,
  openBenchMiniFirm,
  protocolFabricSurfaces,
} from '@/lib/marketing'
import { pricing } from '@/lib/pricing'
import { securityEnforcementLayers, securityPillars } from '@/lib/security-marketing'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const closedLoopSteps = [
  {
    title: 'Recall',
    body: 'Pull prior vault notes and structured ontology matches — institutional context, not a blank session.',
  },
  {
    title: 'Search',
    body: 'Rank API operations by intent. Specs stay server-side; agents get operation IDs and parameter hints.',
  },
  {
    title: 'Execute',
    body: 'Run validated calls over REST, GraphQL, or gRPC. Lean responses keep results out of your context budget.',
  },
  {
    title: 'Ingest',
    body: 'Persist decisions with memory_ingest so the next session — Cursor, OpenClaw, or K8s — continues the trail.',
  },
] as const

export const metadata = pageMetadata({
  title: 'Home',
  absoluteTitle: 'ClawQL — Agentic Infrastructure for Regulated Industries',
  description: site.description,
  path: '/',
})

export default function Page() {
  return (
    <>
      <HeroTwoColumnWithPhoto
        id="hero"
        eyebrow={<AnnouncementBadge href={site.urls.signup} text={site.earlyAccess.badge} cta="Request access" />}
        headline="Anything to MCP. MCP to anything."
        subheadline={
          <p>
            ClawQL is a governed MCP gateway for regulated work: search and execute APIs, vault memory, an optional
            document pipeline, and a tamper-evident audit trail (hash-chained; write-once where Object Lock is
            configured). Event-driven Streams and clawql-tee hardware attestation are lab/design paths — labeled as such
            on <Link href={site.urls.streams}>/streams</Link> and the tee specification.
          </p>
        }
        cta={
          <div className="flex w-full max-w-xl flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={site.urls.signup} size="lg">
                Request access
              </ButtonLink>
              <PlainButtonLink href={`${site.urls.docs}/readme/getting-started`} size="lg">
                Self-host free <ArrowNarrowRightIcon />
              </PlainButtonLink>
            </div>
            <InstallCommand className="w-full max-w-lg" snippet={site.installCommand} />
            <ProofChipRow chips={homepageProofChips} />
          </div>
        }
        photo={<ClawQLHeroLogo />}
        photoFrame={false}
      />

      <Section
        id="fabric"
        eyebrow="The protocol fabric"
        headline="Any protocol in. Any protocol out. MCP in the middle."
        subheadline={
          <p>
            ClawQL Core turns API surfaces into MCP tools — {protocolFabricSurfaces.inbound}. mcp-api-adapter exposes
            any MCP server outward — {protocolFabricSurfaces.outbound} ({protocolFabricSurfaces.shippedCount} surfaces
            shipped). A gRPC service talks to a GraphQL consumer. {protocolFabricSurfaces.plannedNote}
          </p>
        }
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={protocolFabricSurfaces.pageHref}>
              Protocol Fabric <ArrowNarrowRightIcon />
            </Link>
            <Link href={protocolFabricSurfaces.docsHref}>
              Fabric docs <ArrowNarrowRightIcon />
            </Link>
            <Link href={protocolFabricSurfaces.adapterHref}>
              mcp-api-adapter <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <p className="text-xs font-medium tracking-wide text-mist-600 uppercase dark:text-mist-400">In</p>
            <h3 className="text-base font-semibold text-mist-950 dark:text-white">ClawQL Core → MCP</h3>
            <p className="text-sm/7 text-mist-700 dark:text-mist-400">{protocolFabricSurfaces.inbound}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <p className="text-xs font-medium tracking-wide text-mist-600 uppercase dark:text-mist-400">Out</p>
            <h3 className="text-base font-semibold text-mist-950 dark:text-white">mcp-api-adapter → any surface</h3>
            <p className="text-sm/7 text-mist-700 dark:text-mist-400">{protocolFabricSurfaces.outbound}</p>
          </div>
        </div>
      </Section>

      <Section
        id="autonomous"
        eyebrow="ClawQL Streams"
        headline="Agents that don't wait for you."
        subheadline={
          <p>
            Streams is the design for waking agents from event sources — WebSocket, NATS, webhook, cron, polled API, or
            a planned QR stream. Lab 5b exercises coordination on celld today; the agent-facing{' '}
            <code className="text-sm">stream_*</code> MCP package is <strong>not shipped</strong> (planned). See{' '}
            <Link href={site.urls.streams}>/streams</Link> and <Link href={site.urls.durability}>/durability</Link> for
            measured scope.
          </p>
        }
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={site.urls.streams}>
              Streams <ArrowNarrowRightIcon />
            </Link>
            <Link href={`${site.urls.docs}/mcp/mcp-ui`}>
              /mcp-ui <ArrowNarrowRightIcon />
            </Link>
            <Link href={site.urls.agents}>
              Agents landing <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
      />

      <Section
        id="proof"
        eyebrow="OpenBench proof"
        headline="Memory that closes sets, not approximates them."
        subheadline={
          <p>
            Semantic recall returns what looks relevant. Structured ontology recall returns what matches — exactly, with
            no extras. We rebuilt the Calderwood &amp; Harkness near-miss failure mode as an OpenBench mini-firm harness
            (B-7), then fixed it structurally with CQE-typed predicates.
          </p>
        }
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={openBenchMiniFirm.essayUrl}>
              Memory Finds. Ontology Decides. <ArrowNarrowRightIcon />
            </Link>
            <Link href={openBenchMiniFirm.runUrl}>
              GitHub Actions run {openBenchMiniFirm.runId} <ArrowNarrowRightIcon />
            </Link>
            <Link href="/benchmarks">
              Gateway benchmarks <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <OpenBenchProofTable caption={openBenchMiniFirm.caption} rows={openBenchMiniFirm.rows} />
          <p className="text-sm text-mist-600 dark:text-mist-400">{openBenchMiniFirm.caption}</p>
        </div>
      </Section>

      <Section
        id="how-it-works"
        eyebrow="How it fits together"
        headline="Recall → search → execute → ingest."
        subheadline={
          <p>
            One closed loop for APIs, memory, and documents. Case studies on docs.clawql.com show the same pattern
            shipping Cloudflare Workers, recalling Cursor roadmaps from OpenClaw, and filing GitHub issues from vault
            context — without pasting specs into the chat.
          </p>
        }
        cta={
          <Link href={`${site.urls.docs}/case-studies/cloudflare-docs-mcp`}>
            Example case study <ArrowNarrowRightIcon />
          </Link>
        }
      >
        <ClosedLoopSteps steps={closedLoopSteps} />
      </Section>

      <Section
        id="tools"
        eyebrow="MCP tools"
        headline="Core discovery and execution — always on."
        subheadline={
          <p>
            Core discovery and execution — plus skills_list / skills_get — are always on. Memory and documents are
            default on (opt out). Schedule, notify, workflow, sandbox, semantic search, and IDP tools opt in when you
            need them — compose with CLAWQL_INSTANCE_SPEC / CLAWQL_TIER in 8.0. Panguard ATR enforcement is opt-in (
            <code className="text-sm">CLAWQL_PANGUARD_PROXY_PLUGIN=1</code>). Document workflows live on the{' '}
            <Link href={site.urls.idp} className="font-medium underline underline-offset-2">
              IDP page
            </Link>
            ; full catalog on{' '}
            <Link href={site.urls.integrations} className="font-medium underline underline-offset-2">
              /integrations
            </Link>
            . {site.providersNote}
          </p>
        }
        cta={
          <Link href={`${site.urls.docs}/tools`}>
            Full tool reference <ArrowNarrowRightIcon />
          </Link>
        }
      >
        <ToolTierSection {...mcpToolTiers.core} />
      </Section>

      <SecuritySection
        id="security"
        eyebrow="Security & TEE"
        headline="Documented, reproducible — TEE paths are design."
        subheadline={
          <p>
            ClawQL documents how container images are scanned, signed, and enforced from CI through Kubernetes admission
            — plus a 32-module curriculum for agentic AI deployments. ATR scoping limits what each agent can call when
            configured. Panguard fail-closed enforcement is opt-in in 8.0 (
            <code className="text-sm">CLAWQL_PANGUARD_PROXY_PLUGIN=1</code>) — not default-on for self-hosted installs.
          </p>
        }
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={site.urls.security}>
              Security stack <ArrowNarrowRightIcon />
            </Link>
            <Link href={`${site.urls.docs}/security`}>
              Security hub <ArrowNarrowRightIcon />
            </Link>
            <Link href={`${site.urls.docs}/security/best-practices`}>
              32-module curriculum <ArrowNarrowRightIcon />
            </Link>
            <Link href={clawqlTeeSummary.href}>
              clawql-tee specification <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
        pillars={securityPillars}
        enforcementLayers={securityEnforcementLayers}
      />

      <Section
        id="tee"
        eyebrow="clawql-tee"
        headline="Hardware-verified execution — specification."
        subheadline={<p>{clawqlTeeSummary.body}</p>}
        cta={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href={clawqlTeeSummary.href}>
              clawql-tee specification <ArrowNarrowRightIcon />
            </Link>
            <Link href={site.urls.agents}>
              Agents landing <ArrowNarrowRightIcon />
            </Link>
          </div>
        }
      />

      <FAQsTwoColumnAccordion id="faqs" headline="Questions & Answers">
        <Faq
          id="faq-1"
          question="What's the difference between cache, audit, and memory_*?"
          answer="cache is ephemeral LRU for the active session. The MCP audit tool is an agent-visible in-process session event buffer (append/list/clear) — not the tamper-evident trail. clawql-audit / WORM is separate; agents cannot clear it. memory_ingest and memory_recall persist vault Markdown across sessions. See /audit and /governance."
        />
        <Faq
          id="faq-2"
          question="What's the difference between Developer, Teams, and Starter?"
          answer="See /pricing for current early-access tiers. Developer is gateway + memory; Teams adds semantic search; Starter activates the IDP bundle. Managed prices are subject to change until unit costs are measured."
        />
        <Faq
          id="faq-3"
          question="How is this different from managed agent platforms?"
          answer="ClawQL is a self-hostable governed MCP gateway: Protocol Fabric connects APIs via MCP, vault memory persists context, and the hash-chained audit trail stays on infrastructure you control (write-once where Object Lock is configured). Streams event wake-ups and clawql-tee are lab/design paths — see /streams and the tee specification. Many platforms already run agents from triggers; we don't claim exclusivity there."
        />
        <Faq
          id="faq-4"
          question="Do you offer enterprise contracts?"
          answer={`Enterprise starts from ${pricing.enterprise.priceFrom}${pricing.enterprise.period} (early-access figure) for dedicated isolation (planned), custom fine-tuning, multi-region, DPA/BAA, and a dedicated CSM. Contact sales to scope annual terms.`}
        />
        <Faq
          id="faq-5"
          question="Is managed hosting available today?"
          answer="The open-source MCP core ships today — npx, Helm, and a Kubernetes operator. Case studies reflect founder deployments and lab evidence, not customer production use. Self-host free on the Apache 2.0 packages in this repository, or request early access for managed hosting."
        />
        <Faq
          id="faq-6"
          question="How does ClawQL handle supply chain and runtime security?"
          answer="Container images pass OSV, Trivy, and SBOM gates in CI, are Cosign-signed, and Kyverno verifyImages rejects unsigned digests at deploy time by default. Runtime layers — MCP ATR scoping, audit, sandbox isolation, PII redaction in the IDP pipeline — are documented in the 32-module security curriculum on docs.clawql.com/security."
        />
      </FAQsTwoColumnAccordion>

      <CallToActionSimple
        id="pricing"
        headline="Pricing"
        subheadline={
          <p>
            Self-host free on the Apache 2.0 packages in this repository, or request early access for managed hosting.
            Managed figures are early-access pricing subject to change — details live on{' '}
            <Link href={site.urls.pricing}>/pricing</Link> so this page cannot drift.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ButtonLink href={site.urls.pricing} size="lg">
              See /pricing
            </ButtonLink>
            <PlainButtonLink href={site.urls.signup} size="lg">
              Request access <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
      <CallToActionSimple
        id="call-to-action"
        headline="Request early access or self-host free"
        subheadline={
          <p>
            Install with <code className="text-sm">{site.installCommand}</code>. Apache 2.0 packages in this repository
            — no license fee for those packages.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Request access
            </ButtonLink>
            <PlainButtonLink href={site.urls.docs} size="lg">
              Self-host guide <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
