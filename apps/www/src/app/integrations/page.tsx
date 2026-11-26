import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Integrations',
  description:
    'ClawQL sits underneath the tools you already use: MCP clients, API providers you opt into, IDP pipelines, and ops hooks — each with an honest status.',
  path: '/integrations',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Integrations"
      subheadline={
        <p>Point your agent at ClawQL. APIs, documents, and actions then run through the same governance and audit.</p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Related:{' '}
        <Link href={site.urls.agents}>/agents</Link>
        {' · '}
        <Link href={site.urls.idp}>/idp</Link>
        {' · '}
        <Link href={site.urls.cloud}>/cloud</Link>
        {' · '}
        <Link href={site.urls.governance}>/governance</Link>
        {' · '}
        <Link href={`${site.urls.docs}/getting-started/custom-sources`}>custom sources</Link>
      </p>

      <h2>Agents and editors</h2>
      <p>
        ClawQL is an MCP server. Any MCP-capable client can connect — Cursor, Claude Code, Codex, and other MCP hosts
        are shipped paths. OpenClaw and similar harnesses work when configured as MCP clients. One-click Cloud harness
        installs remain planned.
      </p>

      <h2>APIs and providers</h2>
      <p>
        In 8.0 the provider catalog is <strong>empty by default</strong>. Opt in with <code>CLAWQL_PROVIDER</code>,{' '}
        <code>providers.pack</code>, or <code>CLAWQL_TIER</code>. Built-in and community packs cover common SaaS (for
        example Cloudflare, GitHub, Slack, Linear, Notion) and enterprise search via Onyx when enabled. Custom OpenAPI /
        HTTP sources are documented under custom sources.
      </p>

      <h2>Documents (IDP)</h2>
      <p>
        The IDP path (ingest → convert → redact → classify/extract → archive / VDR) is available when you activate the
        IDP plugin bundle — self-host or managed Starter+. See <Link href={site.urls.idp}>/idp</Link>.
      </p>

      <h2>Inference and models</h2>
      <p>
        OpenAI-compatible <code>/v1</code> via clawql-inference: OpenRouter day-one, direct BYOK providers, and local
        options. Details on <Link href={site.urls.inference}>/inference</Link> and the docs getting-started guide.
      </p>

      <h2>Ops and observability</h2>
      <p>
        Optional tools cover Slack notify, Argo Workflows / Argo CD, schedule, sandbox exec, and OTEL exporters when
        enabled. These are env-gated; they are not a claim that every ops surface ships as a managed Cloud product
        today.
      </p>

      <h2>What this page is not</h2>
      <p>
        This is not a competitor comparison and not a promise of certified production deployments. For status of Cloud
        workloads see <Link href={site.urls.cloud}>/cloud</Link>; for enforcement posture see{' '}
        <Link href={site.urls.governance}>/governance</Link>.
      </p>
    </DocumentCentered>
  )
}
