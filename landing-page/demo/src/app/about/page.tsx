import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { Link } from '@/components/elements/link'
import { ChevronIcon } from '@/components/icons/chevron-icon'
import { CaseStudyCard, CaseStudyGrid, ToolTierSection } from '@/components/sections/clawql-marketing'
import { CallToActionSimple } from '@/components/sections/call-to-action-simple'
import { HeroSimpleCentered } from '@/components/sections/hero-simple-centered'
import { Section } from '@/components/elements/section'
import { caseStudies, mcpToolTiers } from '@/lib/marketing'
import { site } from '@/lib/site'

export const metadata = {
  title: 'About',
}

export default function Page() {
  return (
    <>
      <HeroSimpleCentered
        id="hero"
        headline="The infrastructure layer agents call into."
        subheadline={
          <p>
            ClawQL is not an agent framework — it does not reason or plan. It is the MCP gateway where agents{' '}
            <strong>search</strong> APIs, <strong>execute</strong> operations, <strong>recall</strong> vault knowledge,
            <strong> ingest</strong> documents, and <strong>audit</strong> what happened. Memory and action form a
            closed loop.
          </p>
        }
      />

      <Section
        id="story"
        eyebrow="Why ClawQL exists"
        headline="Built from production agent work — not a demo."
        subheadline={
          <p>
            ClawQL started as the MCP layer behind real deployments: multi-provider DevOps workflows, document
            pipelines for regulated industries, and cross-session memory that survives when you switch between Cursor,
            OpenClaw, and Kubernetes. The open-source core ships what we run in production.
          </p>
        }
      >
        <div className="grid grid-cols-1 gap-6 text-sm/7 text-mist-700 sm:grid-cols-2 dark:text-mist-400">
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">ClawQL and See The Greens</h3>
            <p className="mt-2">
              See The Greens is a mortgage-first loan origination system powered by ClawQL — the same IDP pipeline, vault
              memory, and HITL patterns documented on this site. ClawQL is the horizontal platform; See The Greens is one
              vertical product built on it. Neither implies exclusivity — lenders can self-host ClawQL or build their own
              LOS on the same stack.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">What we publish</h3>
            <p className="mt-2">
              Case studies include tool traces, failure modes, fixes, and token measurements — the same detail we expect
              from production engineering write-ups. The{' '}
              <Link href={site.urls.releases}>GitHub release changelog</Link> tracks what ships each version; docs at{' '}
              <Link href={site.urls.docs}>docs.clawql.com</Link> stay aligned with the codebase.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="philosophy"
        eyebrow="What we build"
        headline="Three problems, one platform."
        subheadline={
          <p>Current agent systems lose context, burn tokens on API specs, and treat documents as afterthoughts.</p>
        }
      >
        <div className="grid grid-cols-1 gap-6 text-sm/7 text-mist-700 sm:grid-cols-3 dark:text-mist-400">
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">Persistence gap</h3>
            <p className="mt-2">
              Context windows are ephemeral. <code className="text-sm">memory_ingest</code> and{' '}
              <code className="text-sm">memory_recall</code> give agents institutional memory that survives restarts,
              product switches, and new chat threads.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">Token efficiency</h3>
            <p className="mt-2">
              GitHub&apos;s bundled spec alone is ~2.28M planning tokens. <code className="text-sm">search</code> returns
              ranked operation IDs in thousands of tokens — measured in our published GitHub provider case study.
            </p>
          </div>
          <div className="rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5">
            <h3 className="font-semibold text-mist-950 dark:text-white">Document intelligence</h3>
            <p className="mt-2">
              Eight bundled IDP vendors compose intake through secure sharing. Agents orchestrate real document
              pipelines — classify, extract, archive, search — not one-off OCR prompts.
            </p>
          </div>
        </div>
      </Section>

      <Section id="tools" headline="Tool surface">
        <div className="flex flex-col gap-10">
          <ToolTierSection {...mcpToolTiers.core} />
          <ToolTierSection {...mcpToolTiers.memory} />
          <ToolTierSection {...mcpToolTiers.idp} />
        </div>
      </Section>

      <CaseStudyGrid
        id="case-studies"
        eyebrow="Evidence"
        headline="We publish what we ship."
        subheadline={
          <p>
            Case studies include tool traces, failure modes, fixes, and token measurements — the same detail we expect
            from production engineering write-ups.
          </p>
        }
      >
        {caseStudies.slice(0, 3).map((study) => (
          <CaseStudyCard key={study.slug} {...study} />
        ))}
      </CaseStudyGrid>

      <CallToActionSimple
        id="call-to-action"
        headline="Read the case studies. Run the tools."
        subheadline={
          <p>
            Self-host today or join the managed waitlist for hosted MCP, vault, and IDP. {site.waitlistPromise}
          </p>
        }
        cta={
          <div className="flex items-center gap-4">
            <ButtonLink href={site.urls.signup} size="lg">
              Join waitlist
            </ButtonLink>
            <PlainButtonLink href={`${site.urls.docs}/case-studies`} size="lg">
              All case studies <ChevronIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
