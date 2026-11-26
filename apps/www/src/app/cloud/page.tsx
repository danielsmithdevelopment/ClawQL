import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'ClawQL Cloud',
  description:
    'Managed ClawQL: early-access MCP gateway and IDP hosting, governance included, same Apache 2.0 stack you can self-host. Local WORM on by default; remote durable copies on paid and regulated tiers.',
  path: '/cloud',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="ClawQL Cloud"
      subheadline={
        <p>
          Managed hosting for the same stack you can run yourself — early access today, with clear built vs planned
          labels.
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Related:{' '}
        <Link href={site.urls.governance}>/governance</Link>
        {' · '}
        <Link href={site.urls.dataHandling}>/data-handling</Link>
        {' · '}
        <Link href={site.urls.pricing}>/pricing</Link>
        {' · '}
        <Link href={site.urls.security}>/security</Link>
        {' · '}
        <Link href={site.urls.enterprise}>/enterprise</Link>
      </p>

      <h2>What you can run</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Workload</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>MCP gateway with vault memory</td>
              <td>Early access</td>
            </tr>
            <tr>
              <td>Document processing (IDP) on dedicated infrastructure</td>
              <td>Early access</td>
            </tr>
            <tr>
              <td>Durable event-driven agents (Streams / celld on Cloud)</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>Always-on containers alongside agents</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>Verified webhook ingress → agent work</td>
              <td>Planned</td>
            </tr>
            <tr>
              <td>One-click agent harnesses</td>
              <td>Planned</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Governance and audit</h2>
      <p>
        Governance is part of the product, not an add-on — see <Link href={site.urls.governance}>/governance</Link>.
        Local hash-chained WORM is on by default. Remote durable copies (S3 Object Lock or equivalent) default on Cloud
        paid tiers and the regulated profile when configured. Self-host remote Object Lock remains opt-in.
      </p>

      <h2>Isolation</h2>
      <ul>
        <li>
          <strong>Shared (early access):</strong> your own data, keys, and credentials on shared infrastructure.
        </li>
        <li>
          <strong>Dedicated / bring-your-own-cloud / hardware TEE:</strong> planned. We do not claim production
          multi-tenant GA or FedRAMP authorization today.
        </li>
        <li>
          <strong>Free or trial:</strong> logical isolation only; does not accept regulated data.
        </li>
      </ul>

      <h2>Models</h2>
      <p>
        Bring your own keys, stored in the vault. ClawQL never handles model providers&apos; consumer-subscription
        credentials. Policy-routed model selection and sovereign inference inside the tenant boundary are available on
        IDP tiers or as design where marked on <Link href={site.urls.pricing}>/pricing</Link>.
      </p>

      <h2>Same stack, self-hosted</h2>
      <p>
        Self-host the Apache 2.0 packages with <code>{site.installCommand}</code> or Helm — no license fee for those
        packages. Managed list prices are early-access figures, subject to change. Request access on{' '}
        <Link href={site.urls.signup}>/signup</Link>.
      </p>
    </DocumentCentered>
  )
}
