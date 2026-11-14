import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const DRAFT_DOC = `${GH}/blob/main/docs/gtm/clawql-cloud-page-draft.md`
const CLOUD_PLAN = `${GH}/blob/main/docs/gtm/clawql-cloud-platform-plan.md`

export const metadata = pageMetadata({
  title: 'ClawQL Cloud',
  description:
    'A cloud built for agents: governed by default, isolated by design, and the same stack you can run yourself. Early access.',
  path: '/cloud',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="ClawQL Cloud"
      subheadline={
        <p>A cloud built for agents: governed by default, isolated by design, and the same stack you can run yourself.</p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Early access. Related:{' '}
        <Link href={site.urls.governance}>/governance</Link>
        {' · '}
        <Link href={site.urls.security}>/security</Link>
        {' · '}
        <Link href={site.urls.durability}>/durability</Link>
        {' · '}
        <Link href={site.urls.pricing}>/pricing</Link>
        {' · '}
        <Link href={site.urls.dataHandling}>/data-handling</Link>
        {' · '}
        <Link href={site.urls.integrations}>/integrations</Link>
        {' · '}
        Plan: <Link href={CLOUD_PLAN}>clawql-cloud-platform-plan.md</Link>
        {' · '}
        Draft: <Link href={DRAFT_DOC}>docs/gtm/clawql-cloud-page-draft.md</Link>
      </p>

      <p>
        <em>Each capability below is marked built, in early access, or planned.</em>
      </p>
      <p>
        General-purpose clouds were built for web servers. Agents are different: they spend most of their time waiting,
        they act on other people&apos;s systems, and every action may need to be explained to an auditor later. ClawQL
        Cloud is built around those facts.
      </p>

      <h2>What you can run</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Workload</th>
              <th>What it&apos;s for</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>MCP gateway with memory</strong>
              </td>
              <td>Connect any agent to your APIs and data through one governed endpoint</td>
              <td>Early access</td>
            </tr>
            <tr>
              <td>
                <strong>Document processing (IDP)</strong>
              </td>
              <td>Classification, extraction and redaction on dedicated infrastructure</td>
              <td>Early access</td>
            </tr>
            <tr>
              <td>
                <strong>Durable agents</strong>
              </td>
              <td>Agents that wake, act and park, surviving crashes without repeating or losing work</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>
                <strong>Containers</strong>
              </td>
              <td>Always-on services in any language, alongside your agents</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>
                <strong>Webhook ingress</strong>
              </td>
              <td>One listener for every provider&apos;s webhooks, verified and turned into agent work</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>
                <strong>One-click harnesses</strong>
              </td>
              <td>Hermes Agent and Pi, enabled from the same dashboard with ClawQL as their governed tool layer</td>
              <td>Planned</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Governance is included, not an add-on</h2>
      <p>
        Every tier, every workload: approvals bound to a person, untrusted-content labels, credentials agents never hold,
        default-deny egress and a tamper-evident audit trail. These are what ClawQL is, not upgrades. See{' '}
        <Link href={site.urls.governance}>/governance</Link>.
      </p>

      <h2>Isolation you choose</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>What you get</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Shared</td>
              <td>Your own data, keys and credentials on shared infrastructure</td>
              <td>Early access</td>
            </tr>
            <tr>
              <td>Dedicated</td>
              <td>Your own nodes, database and keys</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>Bring your own cloud</td>
              <td>We operate ClawQL inside your AWS or GCP account</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>Hardened</td>
              <td>Confidential computing with hardware attestation</td>
              <td>Planned</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Your data stays yours</h2>
      <ul>
        <li>
          <strong>Structural isolation on paid tiers.</strong> Your telemetry and memory sit in your own storage, under
          your own encryption key, read only by processes holding your credentials. A bug can&apos;t leak your data to
          another customer, because nothing serving them has permission to read it.
        </li>
        <li>
          <strong>Provable deletion.</strong> Deleting your account destroys your key, so any copy left in a backup or
          cache becomes unreadable, and each step is recorded.
        </li>
        <li>
          <strong>Any free or trial tier</strong> uses shared infrastructure with logical isolation, says so plainly, and
          doesn&apos;t accept regulated data.
        </li>
      </ul>

      <h2>Connect private systems without exposing them</h2>
      <p>
        Hosted ClawQL can join your existing Tailscale network as an authorized app, limited to exactly the services it
        needs, so your private APIs never face the internet. <em>Planned.</em>
      </p>

      <h2>Models on your terms</h2>
      <ul>
        <li>
          <strong>Bring your own keys,</strong> stored in the vault. ClawQL never handles model providers&apos;
          consumer-subscription credentials.
        </li>
        <li>
          <strong>Policy-routed models.</strong> Easy requests can go to small models and hard ones to large models, but
          sensitive data only ever goes where your policy allows. <em>Planned.</em>
        </li>
        <li>
          <strong>Sovereign inference</strong> inside your tenant boundary, on IDP tiers.
        </li>
      </ul>

      <h2>Observability built in</h2>
      <p>
        Dashboards for what agents actually do: pending approvals, blocked egress, labels, tool calls by outcome, spend
        and recovery.
      </p>

      <h2>The same stack, self-hosted</h2>
      <p>
        Self-host the Apache 2.0 packages in this repository with no license fee — start with{' '}
        <code>{site.installCommand}</code> or the Helm chart. Some packages in the network whitepaper design table remain
        private or BSL and are not part of that self-host path.
      </p>
      <p>
        <strong>Pricing:</strong> see <Link href={site.urls.pricing}>/pricing</Link>. Managed figures there are planned
        early-access pricing, subject to change until unit costs are measured on a real host.
      </p>
    </DocumentCentered>
  )
}
