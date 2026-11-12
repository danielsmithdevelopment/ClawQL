import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

const GH = 'https://github.com/danielsmithdevelopment/ClawQL'
const DRAFT_DOC = `${GH}/blob/main/docs/gtm/clawql-data-handling-page-draft.md`
const TELEMETRY = `${GH}/blob/main/TELEMETRY.md`
const SECURITY_MD = `${GH}/blob/main/SECURITY.md`

export const metadata = pageMetadata({
  title: 'How we handle your data',
  description:
    'What ClawQL sees, where it lives, how long we keep it, and how it is deleted — in plain language. Not a substitute for the privacy policy.',
  path: '/data-handling',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="How we handle your data"
      subheadline={
        <p>
          What ClawQL sees, where it lives, how long we keep it, and how it&apos;s deleted, in plain language. The{' '}
          <Link href={site.urls.privacy}>privacy policy</Link> is the legal version; this page is the practical one.
        </p>
      }
    >
      <p className="text-sm text-mist-600 dark:text-mist-400">
        Draft for counsel review — not legal advice. Related:{' '}
        <Link href={site.urls.privacy}>/privacy-policy</Link>
        {' · '}
        <Link href={site.urls.security}>/security</Link>
        {' · '}
        <Link href={site.urls.cloud}>/cloud</Link>
        {' · '}
        <Link href={TELEMETRY}>TELEMETRY.md</Link>
        {' · '}
        Draft: <Link href={DRAFT_DOC}>docs/gtm/clawql-data-handling-page-draft.md</Link>
      </p>

      <h2>If you self-host</h2>
      <p>
        ClawQL running on your own infrastructure sends us nothing by default. There is no phone-home usage reporter.
        Documented in <Link href={TELEMETRY}>TELEMETRY.md</Link>: default installs never transmit the content of tool
        calls, documents, memory, or credentials to ClawQL. Any observability you enable points where you configure it.
      </p>

      <h2>If you use managed hosting</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>What it is</th>
              <th>Where it lives</th>
              <th>How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Account</strong>
              </td>
              <td>Name, email, company, billing details (cards are handled by Stripe, never stored by us)</td>
              <td>Managed region TBD before GA (planned AWS); EU residency available on Enterprise</td>
              <td>Life of the account, plus what law requires</td>
            </tr>
            <tr>
              <td>
                <strong>Credentials</strong>
              </td>
              <td>API keys and tokens you add to the vault</td>
              <td>Encrypted in the vault; injected at the gateway, never shown to agents</td>
              <td>Until you remove them or close the account</td>
            </tr>
            <tr>
              <td>
                <strong>Tool-call content</strong>
              </td>
              <td>Requests and responses passing through the gateway</td>
              <td>Processed in transit; redacted and projected before reaching agents</td>
              <td>Not stored beyond the audit record and caching you configure</td>
            </tr>
            <tr>
              <td>
                <strong>Memory and documents</strong>
              </td>
              <td>What you or your agents ingest, and documents processed on IDP tiers</td>
              <td>Your tenant&apos;s storage, under your tenant&apos;s key on paid tiers</td>
              <td>Until you delete them</td>
            </tr>
            <tr>
              <td>
                <strong>Audit trail</strong>
              </td>
              <td>A record of every decision, approval and action</td>
              <td>Hash-chained; write-once where configured (for example S3 Object Lock)</td>
              <td>
                Retention period TBD with counsel (see Deletion). Key destruction makes retained entries unreadable.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Telemetry</strong>
              </td>
              <td>Operational metrics and logs about your workloads</td>
              <td>Your tenant&apos;s storage on paid tiers; logical isolation on free/trial</td>
              <td>Tier-dependent; short on free/trial — exact windows published with each tier</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>What we will never do</h2>
      <ul>
        <li>
          <strong>Train models on your data.</strong> We don&apos;t use your content, prompts, documents or memory to
          train or fine-tune any model, ours or anyone else&apos;s. Any future program that uses data for training would
          require your explicit opt-in, and no such program exists today.
        </li>
        <li>
          <strong>Sell your data</strong> or use it for advertising.
        </li>
        <li>
          <strong>Hold your model-provider subscription credentials.</strong> Managed ClawQL uses API keys you bring.
        </li>
      </ul>

      <h2>Model providers</h2>
      <p>
        When an agent calls a model through ClawQL using your own API key, that provider processes the request under its
        own terms. If your requests include protected health information, each provider that receives it needs its own
        business associate agreement with you; ClawQL can redact protected health information before it reaches any
        provider without one. With sovereign inference on IDP tiers, model calls stay inside your tenant boundary.
      </p>

      <h2>Isolation</h2>
      <p>
        On paid tiers, your data is stored under your own encryption key and read only by processes holding your
        credentials, so a bug cannot expose it to another customer. Any free or trial tier uses shared infrastructure
        with logical isolation, says so, and does not accept regulated data. See{' '}
        <Link href={site.urls.security}>/security</Link> and <Link href={site.urls.cloud}>/cloud</Link>.
      </p>

      <h2>Deletion</h2>
      <p>
        When you close your account or ask us to delete data, we disable your encryption key immediately, which blocks
        all access at once; schedule the key&apos;s destruction; and delete your storage. Each step is recorded.
      </p>
      <p>
        Audit trails are designed to be write-once, which can mean entries are retained for a set period even after you
        ask for deletion. Destroying your key makes those retained entries unreadable, so they can no longer be used,
        while the integrity of the audit chain is preserved. Counsel must confirm this approach against applicable
        deletion rights before GA.
      </p>

      <h2>Where your data lives</h2>
      <p>
        Managed hosting region(s) will be published before general availability (planned on AWS). EU residency is
        available on Enterprise. Self-hosting and bring-your-own-cloud keep data entirely in infrastructure you control.
      </p>

      <h2>Service providers</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Stripe</td>
              <td>Payments for managed plans</td>
            </tr>
            <tr>
              <td>AWS (planned)</td>
              <td>Managed Cloud infrastructure — confirm region before GA</td>
            </tr>
            <tr>
              <td>FormSubmit</td>
              <td>Waitlist and newsletter form submissions to {site.emails.general}</td>
            </tr>
            <tr>
              <td>ClawQL first-party analytics</td>
              <td>
                Optional marketing/docs pageviews when analytics is enabled — session id in localStorage; not a
                third-party ad cookie
              </td>
            </tr>
            <tr>
              <td>Transactional email</td>
              <td>Provider TBD before managed GA (account and security notices)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Questions and requests</h2>
      <p>
        Email <a href={`mailto:${site.emails.privacy}`}>{site.emails.privacy}</a> to access, correct, export or delete
        your data. Security reports: <a href={`mailto:${site.emails.security}`}>{site.emails.security}</a> (see{' '}
        <Link href={SECURITY_MD}>SECURITY.md</Link> and{' '}
        <Link href="/.well-known/security.txt">security.txt</Link>).
      </p>
    </DocumentCentered>
  )
}
