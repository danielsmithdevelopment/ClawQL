import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Enterprise',
  description:
    'ClawQL for regulated buyers: Apache 2.0 self-host, early-access managed Cloud, regulated profile, and honest status on certifications.',
  path: '/enterprise',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Enterprise"
      subheadline={
        <p>
          Agentic infrastructure for teams that need governed tool calls, structured memory, and a checkable audit trail
          — without waiting for a certified checkbox we do not hold yet.
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Related:{' '}
        <Link href={site.urls.governance}>/governance</Link>
        {' · '}
        <Link href={site.urls.dataHandling}>/data-handling</Link>
        {' · '}
        <Link href={site.urls.security}>/security</Link>
        {' · '}
        <Link href={site.urls.cloud}>/cloud</Link>
        {' · '}
        <Link href={site.urls.pricing}>/pricing</Link>
      </p>

      <h2>What enterprises buy</h2>
      <ul>
        <li>
          <strong>Self-host free</strong> on Apache 2.0 — Helm, GHCR images, full stack on your cluster.
        </li>
        <li>
          <strong>Managed Cloud early access</strong> — same MCP endpoint story, founder-led onboarding today.
        </li>
        <li>
          <strong>Regulated profile</strong> (<code>CLAWQL_TIER=regulated</code>) — forces Panguard, session IFC, WORM
          required, local-only inference defaults, and refuses common escape hatches.
        </li>
        <li>
          <strong>Optional Sovereign Security Pack</strong> on paid tiers — Kata, weight integrity, fail-closed ATR,
          posture reports (see <Link href={site.urls.pricing}>/pricing</Link>).
        </li>
      </ul>

      <h2>Audit posture</h2>
      <p>
        Local hash-chained WORM is on by default. Remote durable copies default on Cloud paid tiers and the regulated
        profile when configured. Pair with <Link href={site.urls.governance}>/governance</Link> and{' '}
        <Link href={site.urls.dataHandling}>/data-handling</Link> for how deletions and write-once interact.
      </p>

      <h2>What we do not claim</h2>
      <ul>
        <li>No FedRAMP authorization today.</li>
        <li>No SOC 2 Type II report today — readiness packaging exists; the report does not.</li>
        <li>No unnamed “production deployments at scale” proof on this page — evidence lives on benchmarks and case studies we publish.</li>
      </ul>

      <h2>Talk to us</h2>
      <p>
        <Link href={site.urls.signup}>Request early access</Link> or email{' '}
        <a href={site.urls.contactEmail}>hello@clawql.com</a>. Internal GTM playbooks stay off the public site (
        <Link href="/enterprise/gtm">stub</Link>).
      </p>
    </DocumentCentered>
  )
}
