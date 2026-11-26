import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Inference',
  description:
    'ClawQL inference control plane: OpenAI-compatible /v1, OpenRouter or BYOK providers, policy, cache, and audit lineage. Pair with MCP and vault memory.',
  path: '/inference',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Inference"
      subheadline={
        <p>
          An OpenAI-compatible control plane in front of the models you already pay for — with ClawQL policy, memory,
          and audit on the path.
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Related:{' '}
        <Link href={`${site.urls.docs}/getting-started/inference`}>docs getting started</Link>
        {' · '}
        <Link href={site.urls.integrations}>/integrations</Link>
        {' · '}
        <Link href={site.urls.governance}>/governance</Link>
        {' · '}
        <Link href={site.urls.cloud}>/cloud</Link>
      </p>

      <h2>What you get</h2>
      <ul>
        <li>
          <strong>Drop-in <code>/v1</code></strong> for OpenAI SDKs, coding agents, and curl.
        </li>
        <li>
          <strong>OpenRouter day-one</strong> with the aggregator key you already have, then direct BYOK when you want
          it.
        </li>
        <li>
          <strong>Control plane:</strong> catalog, tier escalation, semantic cache, fallback, virtual keys, spend /
          lineage hooks.
        </li>
        <li>
          <strong>Same host as MCP</strong> when you run the Agentic Gateway ladder — search, execute, and recall beside
          chat completions.
        </li>
      </ul>

      <h2>Honesty bounds</h2>
      <ul>
        <li>
          Local hash-chained WORM is on by default for consequential paths; remote durable copies default on Cloud paid
          and regulated profiles when configured.
        </li>
        <li>
          Under <code>CLAWQL_TIER=regulated</code>, inference is forced local-only unless an explicit allowlist is set.
        </li>
        <li>
          Managed Cloud inference hosting is early access / waitlist — not a claim of unlimited production capacity or
          FedRAMP authorization.
        </li>
      </ul>

      <h2>Start</h2>
      <p>
        Follow{' '}
        <Link href={`${site.urls.docs}/getting-started/inference`}>
          docs.clawql.com/getting-started/inference
        </Link>
        . For pricing of managed tiers see <Link href={site.urls.pricing}>/pricing</Link>.
      </p>
    </DocumentCentered>
  )
}
