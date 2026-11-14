import Link from 'next/link'
import type { ReactNode } from 'react'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const DRAFT_DOC = `${GH}/blob/main/docs/gtm/clawql-integrations-page-draft.md`
const CUSTOM_SOURCES = 'https://docs.clawql.com/getting-started/custom-sources'
const OPENCLAW_CASE = 'https://docs.clawql.com/case-studies' // vault memory / OpenClaw write-ups live under docs

export const metadata = pageMetadata({
  title: 'Integrations',
  description:
    'ClawQL sits underneath the tools you already use and governs what they do. Agents, APIs, documents, sandboxes, and ops — each marked shipped, early access, planned, or design.',
  path: '/integrations',
})

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  )
}

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Integrations"
      subheadline={<p>ClawQL sits underneath the tools you already use, and governs what they do.</p>}
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Statuses verified 2026-11-11. Related:{' '}
        <Link href={site.urls.agents}>/agents</Link>
        {' · '}
        <Link href={site.urls.idp}>/idp</Link>
        {' · '}
        <Link href={site.urls.cloud}>/cloud</Link>
        {' · '}
        <Link href={site.urls.governance}>/governance</Link>
        {' · '}
        Draft: <Link href={DRAFT_DOC}>docs/gtm/clawql-integrations-page-draft.md</Link>
      </p>

      <p>
        You don&apos;t switch agents, editors or infrastructure to use ClawQL. Point your agent at ClawQL, and every API
        it reaches, document it processes and action it takes runs through the same governance, memory and audit. Each
        integration below is marked shipped, early access, planned, under evaluation, or design.
      </p>

      <h2>Agents and harnesses</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>How it connects</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Any MCP client</strong>
              </td>
              <td>ClawQL is an MCP server: one endpoint for every tool</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</Ext>
              </td>
              <td>MCP server configuration</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://cursor.com">Cursor</Ext>
              </td>
              <td>MCP server configuration</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://openai.com/codex/">Codex</Ext>
              </td>
              <td>
                MCP server configuration; optional fail-closed launch via{' '}
                <code className="text-sm">clawql codex</code> + Seatbelt
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://docs.openclaw.ai">OpenClaw</Ext>
              </td>
              <td>
                MCP server; cross-session memory recall shown in published case studies (
                <Ext href={OPENCLAW_CASE}>docs</Ext>)
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>Hermes Agent</td>
              <td>One-click on ClawQL Cloud, governing messaging channels</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>Pi</td>
              <td>One-click on ClawQL Cloud, with policy-routed models</td>
              <td>Planned</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>API sources</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>What ClawQL does with it</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Ext href="https://www.openapis.org/">OpenAPI</Ext>
              </td>
              <td>Indexes every operation for search; executes with validated arguments and projected responses</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://developers.google.com/discovery">Google Discovery</Ext>
              </td>
              <td>Same, for Google APIs</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://graphql.org/">GraphQL</Ext>
              </td>
              <td>
                Search and execute over GraphQL schemas (<code className="text-sm">CLAWQL_GRAPHQL_*</code>)
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://grpc.io/">gRPC</Ext>
              </td>
              <td>
                Search and execute over gRPC services (<code className="text-sm">CLAWQL_GRPC_SOURCES</code>)
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>Other MCP servers</td>
              <td>
                Proxied and governed behind ClawQL&apos;s single endpoint (
                <Ext href={CUSTOM_SOURCES}>custom sources</Ext>)
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://smithy.io/">Smithy</Ext>
              </td>
              <td>
                Read/write classification, sensitivity and idempotency keys from the model (incl. AWS services) — trait
                library / seeding still design
              </td>
              <td>Design</td>
            </tr>
            <tr>
              <td>WebMCP</td>
              <td>
                Tools exposed by websites, governed like any other source (Chrome CDP preview via{' '}
                <code className="text-sm">clawql sources add --kind webmcp</code>)
              </td>
              <td>Early access</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Document pipeline</h2>
      <p>
        Opt in to the document-processing (IDP) bundle to compose these into one governed pipeline. See{' '}
        <Link href={site.urls.idp}>/idp</Link>.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Ext href="https://www.firecrawl.dev/">Firecrawl</Ext> pdf-inspector
              </td>
              <td>Tells text-based PDFs from scanned ones, decides whether OCR is needed</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://github.com/DS4SD/docling">Docling</Ext>,{' '}
                <Ext href="https://tika.apache.org/">Apache Tika</Ext>
              </td>
              <td>Parsing and OCR across file formats (Docling default; Tika opt-in in 8.0)</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://gotenberg.dev/">Gotenberg</Ext>,{' '}
                <Ext href="https://www.stirlingpdf.com/">Stirling-PDF</Ext>
              </td>
              <td>Conversion and PDF operations (opt-in converters in 8.0)</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://github.com/google/langextract">LangExtract</Ext>
              </td>
              <td>Schema-grounded extraction with character-level provenance</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://labelstud.io/">Label Studio</Ext>
              </td>
              <td>Human review of low-confidence extractions</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://nextcloud.com/">Nextcloud</Ext>
              </td>
              <td>Document intake</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>Coneshare</td>
              <td>Virtual data room with trackable links and watermarking</td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>Semantic search over indexed documents</td>
              <td>Cross-document search (engine under review — not named here)</td>
              <td>Shipped; engine under review</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Runtime and isolation</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>macOS Seatbelt, Docker, Kata Containers</td>
              <td>
                Isolated execution for code snippets (<code className="text-sm">sandbox_exec</code>); Seatbelt also wraps
                local harnesses
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://www.docker.com/products/docker-desktop/">Docker Sandboxes</Ext>
              </td>
              <td>Run your agent in a microVM; ClawQL governs every tool call it makes</td>
              <td>Setup guide planned</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://aws.amazon.com/ec2/nitro/">AWS Nitro Sandboxes</Ext>,{' '}
                <Ext href="https://firecracker-microvm.github.io/">Firecracker</Ext>
              </td>
              <td>Container runtime for ClawQL Cloud</td>
              <td>Under evaluation</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Private networks</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Ext href="https://tailscale.com/">Tailscale</Ext>
              </td>
              <td>Hosted ClawQL joins your tailnet as an authorized app, limited to the services it needs</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://github.com/juanfont/headscale">Headscale</Ext>
              </td>
              <td>Self-hosted mesh between your own ClawQL nodes</td>
              <td>Planned</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Operations and automation</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Ext href="https://argoproj.github.io/workflows/">Argo Workflows</Ext>,{' '}
                <Ext href="https://argo-cd.readthedocs.io/">Argo CD</Ext>
              </td>
              <td>
                Submit workflows and observe applications from the same MCP surface (opt-in{' '}
                <code className="text-sm">workflow</code> / <code className="text-sm">argocd</code>)
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://slack.com/">Slack</Ext>
              </td>
              <td>
                Workflow notifications (<code className="text-sm">notify</code>)
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>Scheduled checks</td>
              <td>
                Synthetic HTTP checks with run history (<code className="text-sm">schedule</code>)
              </td>
              <td>Shipped</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Observability</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Ext href="https://grafana.com/">Grafana</Ext>, Loki, Tempo, Mimir
              </td>
              <td>
                Dashboards and telemetry storage — self-host via <code className="text-sm">clawql-observability</code>;
                Cloud tenant dashboards
              </td>
              <td>Self-host shipped · Cloud planned</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://vector.dev/">Vector</Ext>
              </td>
              <td>Edge telemetry agent with filtering and redaction</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://opentelemetry.io/">OpenTelemetry</Ext>
              </td>
              <td>Traces (Alloy / OTLP paths in observability package; Langfuse opt-in)</td>
              <td>Shipped (opt-in)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Models</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>OpenAI-compatible / OpenRouter-style endpoint</td>
              <td>
                <code className="text-sm">clawql-inference</code> serves{' '}
                <code className="text-sm">POST /v1/chat/completions</code> so clients can swap one URL
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>Model providers, with your own keys</td>
              <td>
                BYOK via provider credentials (env today; vault injection on managed paths). ClawQL does not hold
                consumer-subscription logins
              </td>
              <td>Shipped</td>
            </tr>
            <tr>
              <td>
                Local models (<Ext href="https://ollama.com/">Ollama</Ext> and OpenAI-compatible upstreams)
              </td>
              <td>Run open-weight models on your own hardware</td>
              <td>Shipped</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Blockchains</h2>
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Design rows are public so buyers can see the roadmap; they are not shipping claims.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Multi-chain anchoring</td>
              <td>Anchor audit batches on public chains</td>
              <td>Design</td>
            </tr>
            <tr>
              <td>
                <Ext href="https://chain.link/">Chainlink</Ext> Runtime Environment
              </td>
              <td>Optional consensus execution for high-value actions</td>
              <td>Design</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Testing</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>AWS Emulator</td>
              <td>Run governance scenarios against 200+ AWS services locally, with no risk</td>
              <td>Planned</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Setup guides</h2>
      <ul>
        <li>
          <strong>Docker Sandboxes + ClawQL:</strong> isolation from Docker, governance from ClawQL. <em>Planned.</em>
        </li>
        <li>
          <strong>Hermes Agent + ClawQL:</strong> governance across messaging channels. <em>Planned.</em>
        </li>
      </ul>
      <p>
        Want an integration that isn&apos;t listed?{' '}
        <Link href={site.urls.contact}>Contact us</Link> or email{' '}
        <a href={`mailto:${site.emails.general}`}>{site.emails.general}</a>.
      </p>
    </DocumentCentered>
  )
}
