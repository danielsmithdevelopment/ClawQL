import Link from 'next/link'

import { ButtonLink, PlainButtonLink } from '@/components/elements/button'
import { DocumentCentered } from '@/components/sections/document-centered'
import { CallToActionSimpleCentered } from '@/components/sections/call-to-action-simple-centered'
import { ArrowNarrowRightIcon } from '@/components/icons/arrow-narrow-right-icon'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const DRAFT_DOC = `${GH}/blob/main/docs/gtm/clawql-about-page-draft.md`

export const metadata = pageMetadata({
  title: 'About',
  description:
    'Infrastructure that makes AI agents safe to put in front of real systems, and proves it. How ClawQL works, who builds it, and where we are.',
  path: '/about',
})

export default function Page() {
  return (
    <>
      <DocumentCentered
        id="document"
        headline="About ClawQL"
        subheadline={
          <p>Infrastructure that makes AI agents safe to put in front of real systems, and proves it.</p>
        }
      >
        <p className="text-sm text-mist-600 dark:text-mist-400">
          Draft rewrite 2026-11-11 — Sand Dollar bio wording pending clearance. Related:{' '}
          <Link href={site.urls.governance}>/governance</Link>
          {' · '}
          <Link href={site.urls.security}>/security</Link>
          {' · '}
          <Link href={site.urls.benchmarks}>/benchmarks</Link>
          {' · '}
          <Link href={site.urls.cloud}>/cloud</Link>
          {' · '}
          <Link href={site.urls.dataHandling}>/data-handling</Link>
          {' · '}
          Draft: <Link href={DRAFT_DOC}>docs/gtm/clawql-about-page-draft.md</Link>
        </p>

        <h2>Why ClawQL exists</h2>
        <p>
          Agents have become capable enough to send payments, file records and change production systems. The
          infrastructure around them hasn&apos;t kept up: most agents lose context between sessions, spend their budget
          reading API specifications, and act with whatever access they were handed, leaving no record anyone could
          defend to an auditor.
        </p>
        <p>
          ClawQL started as the layer behind our own agent work: multi-provider DevOps workflows, document pipelines for
          regulated industries, and memory that carries across sessions and tools. It grew into a governed gateway: every
          tool call passes through rules the agent can&apos;t change, every consequential action is recorded in a
          tamper-evident trail, and crashes can&apos;t cause an agent to repeat or lose work.
        </p>
        <p className="text-sm text-mist-600 dark:text-mist-400">
          Note on naming: the MCP <code className="text-sm">audit</code> tool is an agent-visible in-process session
          event buffer (append / list / clear). The tamper-evident audit trail is a separate surface (
          <Link href={site.urls.audit}>/audit</Link>, <code className="text-sm">clawql-audit</code>) — agents cannot
          write to or clear it. See <Link href={site.urls.governance}>/governance</Link>.
        </p>

        <h2>How we work</h2>
        <ul>
          <li>
            <strong>Measure before claiming.</strong> Every public number comes from a benchmark with criteria fixed
            before it ran, and results are published with their raw data.
          </li>
          <li>
            <strong>Publish failures.</strong> Failed benchmark boards, bugs we found in our own code and corrections
            stay public alongside the passes.
          </li>
          <li>
            <strong>Correct quickly.</strong> When we&apos;re shown to be wrong, we verify, fix it and say so.
          </li>
          <li>
            <strong>Compare fairly.</strong> Comparisons with other products are measured on equal terms and offered to
            their maintainers for review before we publish them.
          </li>
          <li>
            <strong>Build in the open.</strong> The Apache 2.0 packages in this repository are open source and
            self-hostable with no license fee for those packages. Some packages in the network whitepaper design table
            remain private or BSL and are not on that self-host path.
          </li>
        </ul>

        <h2>Founder</h2>
        <p>
          ClawQL is built by <strong>Daniel Smith</strong>. At IBM, Daniel designed the state machine for cross-border
          transfers in the Sand Dollar, The Bahamas&apos; central bank digital currency, moving value between domestic
          and international networks and back, with hash time-locked contracts that automatically refund a transfer if
          currency conversion fails. That same discipline (explicit state machines, intents recorded before action,
          automatic recovery when a step fails) runs through ClawQL.
        </p>
        <p className="text-sm text-mist-600 dark:text-mist-400">
          Sand Dollar wording is draft pending clearance for public use. Contact:{' '}
          <a href={`mailto:${site.emails.general}`}>{site.emails.general}</a>.
        </p>

        <h2>Where we are</h2>
        <p>We&apos;d rather be precise than impressive:</p>
        <ul>
          <li>
            <strong>The open-source gateway is shipping</strong> and self-hostable today, with{' '}
            <code className="text-sm">{site.installCommand}</code>, a Helm chart and a Kubernetes operator (
            <code className="text-sm">clawql-operator</code> / ClawQLInstance). Case studies and benchmarks on this site
            reflect the founder&apos;s own deployments and lab evidence — not customer production use, which does not
            exist yet.
          </li>
          <li>
            <strong>Managed hosting is in early access,</strong> with founder-led onboarding, not self-serve checkout.
            We do not claim IDP hosted tenants are actively onboarding until that is verified.
          </li>
          <li>
            <strong>We are pre-revenue,</strong> and we don&apos;t claim compliance certifications or references we
            don&apos;t have yet.
          </li>
          <li>
            <strong>Some of our architecture is design, not shipping code</strong> — including the decentralized
            Regional Hub / Dedicated Virtual Gateway / Edge swarm topology — and it is labeled that way everywhere we
            describe it. See <Link href={site.urls.cloud}>/cloud</Link> for early-access vs planned Cloud workloads.
          </li>
        </ul>

        <h2>Related products</h2>
        <p>
          <strong>See The Greens</strong> is a mortgage-first loan origination system built on ClawQL&apos;s document
          pipeline, memory and human-review patterns. ClawQL is the horizontal platform; See The Greens is one vertical
          product on it. <em>Status: in development</em> (planned <code className="text-sm">clawql-lending</code>{' '}
          vertical — not a live customer product yet).
        </p>

        <h2>Contact</h2>
        <p>
          General: <a href={`mailto:${site.emails.general}`}>{site.emails.general}</a> ·{' '}
          <Link href={site.urls.contact}>/contact</Link>
          <br />
          Security reports: <Link href={site.urls.security}>/security</Link> ·{' '}
          <a href={`mailto:${site.emails.security}`}>{site.emails.security}</a>
          <br />
          Privacy: <Link href={site.urls.dataHandling}>/data-handling</Link> ·{' '}
          <a href={`mailto:${site.emails.privacy}`}>{site.emails.privacy}</a>
        </p>
      </DocumentCentered>

      <CallToActionSimpleCentered
        id="call-to-action"
        headline="Self-host free or request early access"
        subheadline={
          <p>
            Install with <code className="text-sm">{site.installCommand}</code>, or join the managed waitlist. Tool
            surface and case studies live on the <Link href={site.urls.home}>home page</Link> and{' '}
            <Link href={site.urls.docs}>docs</Link>; durability evidence on{' '}
            <Link href={site.urls.benchmarks}>/benchmarks</Link>.
          </p>
        }
        cta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-center">
            <ButtonLink href={site.urls.signup} size="lg">
              Request access
            </ButtonLink>
            <PlainButtonLink href={site.urls.docs} size="lg">
              Documentation <ArrowNarrowRightIcon />
            </PlainButtonLink>
          </div>
        }
      />
    </>
  )
}
