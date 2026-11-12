import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Privacy Policy',
  description:
    'How ClawQL collects, uses, and protects information on the marketing site, waitlist, and managed services. Draft for counsel review.',
  path: '/privacy-policy',
})

export default function Page() {
  return (
    <>
      <DocumentCentered
        id="document"
        headline="Privacy Policy"
        subheadline={<p>Last updated on November 11, 2026. Draft for counsel review — not legal advice.</p>}
      >
        <p className="text-sm text-mist-600 dark:text-mist-400">
          Practical summary: <Link href={site.urls.dataHandling}>/data-handling</Link>
          {' · '}
          <Link href={site.urls.security}>/security</Link>
          {' · '}
          <Link href={site.urls.cloud}>/cloud</Link>
          {' · '}
          <Link href={site.urls.securityTxt}>security.txt</Link>
        </p>

        <p>
          ClawQL (&quot;<strong>we</strong>,&quot; &quot;<strong>us</strong>,&quot; or &quot;<strong>our</strong>&quot;)
          respects your privacy. This policy describes how we collect, use, and protect information when you use the
          ClawQL marketing site, sign up for managed account waitlists, or interact with our services (collectively, the
          &quot;<strong>Services</strong>&quot;).
        </p>

        <h2>Who we are</h2>
        <p>
          The legal entity responsible for ClawQL is a Delaware corporation <strong>incorporation pending</strong>. Until
          formation completes and a postal address is published, contact us at{' '}
          <a href={`mailto:${site.emails.general}`}>{site.emails.general}</a>. Privacy requests:{' '}
          <a href={`mailto:${site.emails.privacy}`}>{site.emails.privacy}</a>. Security reports:{' '}
          <a href={`mailto:${site.emails.security}`}>{site.emails.security}</a> (see{' '}
          <Link href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/SECURITY.md">SECURITY.md</Link>).
        </p>

        <h2>Roles</h2>
        <p>
          For personal data on the marketing site and waitlist, ClawQL acts as a <strong>controller</strong>. For customer
          content in managed accounts (tool-call traffic you route through the gateway, vault memory, documents, audit
          records, and tenant telemetry), ClawQL acts as a <strong>processor</strong> on the customer&apos;s behalf. A
          data processing agreement (DPA) and, where applicable, a business associate agreement (BAA) are available on
          Enterprise — see <Link href={site.urls.pricing}>/pricing</Link>.
        </p>

        <h2>Information we collect</h2>
        <p>We may collect:</p>
        <ul>
          <li>
            <strong>Account and contact data</strong> you provide — name, email, company — when you join a waitlist or
            contact us
          </li>
          <li>
            <strong>Billing metadata</strong> for managed plans (payment cards are handled by Stripe; we do not store
            full card numbers)
          </li>
          <li>
            <strong>Limited technical data</strong> for the marketing/docs sites (path, referrer, approximate browser
            context, and a first-party session id when analytics is enabled)
          </li>
          <li>
            <strong>Managed-service categories</strong> when you use hosted ClawQL: vault credentials you add; tool-call
            requests and responses processed in transit; memory and documents you or your agents ingest; hash-chained
            audit records; and operational telemetry about your workloads
          </li>
        </ul>

        <h2>How we use information</h2>
        <p>We use collected information to:</p>
        <ul>
          <li>Respond to waitlist signups and contact requests</li>
          <li>Provide and improve the Services</li>
          <li>Send product updates you have opted into</li>
          <li>Secure the Services, detect abuse, and comply with legal obligations</li>
        </ul>
        <p>
          <strong>We do not use customer content, prompts, documents, or memory to train or fine-tune any model</strong>
          — ours or a third party&apos;s. No training program that uses customer data exists today; any future program
          would require explicit opt-in.
        </p>
        <p>We do not sell personal information or use it for advertising.</p>

        <h2>Managed accounts and customer content</h2>
        <p>
          When you use a managed ClawQL account, we process the categories above only to operate the hosted MCP service
          for you. Credentials in the vault are encrypted and injected at the gateway; agents do not hold them. Tool-call
          content is processed in transit, redacted and projected before reaching agents, and retained only in the audit
          record and any caching you configure. Memory and documents live in your tenant storage (under your tenant key
          on paid tiers). See <Link href={site.urls.dataHandling}>/data-handling</Link> for the practical table.
        </p>

        <h2>Self-hosted installs</h2>
        <p>
          Self-hosted ClawQL sends us nothing by default. See{' '}
          <Link href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/TELEMETRY.md">TELEMETRY.md</Link>.
        </p>

        <h2>Payments and credits</h2>
        <p>
          Managed ClawQL plans are billed through <strong>Stripe</strong> (and related payment processors). ClawQL is not
          a bank and does not offer FDIC-insured balances. Optional prepaid credits on managed plans are{' '}
          <strong>closed-loop platform credits</strong> redeemable only for ClawQL services: a company may allocate
          budgets by role, top up individuals, and allow transfers only among members of the same company plan. Public
          Venmo-like transfers between unrelated customers and cash-out of credits are not part of managed hosting.
        </p>
        <p>
          When the provider network launches, providers may earn the same class of closed-loop credits for contributing
          capacity. Those credits remain non-redeemable for cash unless a later program says otherwise after legal
          review. Agent compensation ledgers for self-hosted operators are separate and opt-in under the
          operator&apos;s compliance program.
        </p>

        <h2>Service providers</h2>
        <ul>
          <li>
            <strong>Stripe</strong> — payments
          </li>
          <li>
            <strong>AWS (planned)</strong> — managed Cloud infrastructure; region published before GA
          </li>
          <li>
            <strong>FormSubmit</strong> — waitlist and newsletter form delivery to {site.emails.general}
          </li>
          <li>
            <strong>ClawQL first-party analytics</strong> — optional pageview collector for marketing/docs when enabled (
            <code className="text-sm">NEXT_PUBLIC_CLAWQL_ANALYTICS_ENABLED</code>); uses a session id in{' '}
            <code className="text-sm">localStorage</code>, not a third-party advertising cookie
          </li>
          <li>
            <strong>Transactional email</strong> — provider TBD before managed GA
          </li>
        </ul>
        <p>
          Providers are bound by confidentiality obligations appropriate to their role. We will keep this list current on{' '}
          <Link href={site.urls.dataHandling}>/data-handling</Link>.
        </p>

        <h2>Analytics and cookies</h2>
        <p>
          The marketing site may send first-party pageview events when analytics is enabled. We do not use third-party
          advertising cookies. Essential cookies or local storage may be used for session continuity on the analytics
          path described above.
        </p>

        <h2>Data location and transfers</h2>
        <p>
          Managed hosting region(s) will be published before general availability (planned on AWS). EU residency is
          available on Enterprise. Self-hosting and bring-your-own-cloud keep data in infrastructure you control.
          International transfers, when required, will use appropriate safeguards (for example standard contractual
          clauses) — counsel to finalize before GA.
        </p>

        <h2>Retention</h2>
        <ul>
          <li>
            <strong>Account / contact data:</strong> life of the relationship, plus legal holds
          </li>
          <li>
            <strong>Vault credentials:</strong> until you remove them or close the account
          </li>
          <li>
            <strong>Memory and documents:</strong> until you delete them
          </li>
          <li>
            <strong>Tool-call content:</strong> only as needed for the audit record and configured caches
          </li>
          <li>
            <strong>Audit trail:</strong> write-once retention window TBD with counsel; see Deletion
          </li>
          <li>
            <strong>Telemetry:</strong> tier-dependent; short on free/trial — windows published with each tier
          </li>
        </ul>

        <h2>Deletion and write-once audit logs</h2>
        <p>
          You may request deletion of personal information we hold about you. For managed paid tenants, closing an
          account or requesting deletion disables your encryption key immediately (blocking access), schedules key
          destruction, and deletes tenant storage — each step recorded.
        </p>
        <p>
          Audit trails may be write-once (for example object-lock) for a retention period even after a deletion request.
          Destroying the tenant key makes retained audit ciphertext unreadable while preserving chain integrity. Counsel
          must confirm this approach against applicable deletion rights (including GDPR erasure) before GA.
        </p>

        <h2>Isolation</h2>
        <p>
          On paid managed tiers, telemetry and memory sit under your tenant key and credentials. Free or trial tiers use
          shared infrastructure with logical isolation, disclose that fact, and do not accept regulated data. See{' '}
          <Link href={site.urls.cloud}>/cloud</Link>.
        </p>

        <h2>Security and breach notification</h2>
        <p>
          We implement reasonable administrative and technical safeguards. No method of transmission over the internet is
          completely secure. If we become aware of a breach affecting your personal information, we will notify you and
          regulators as required by applicable law. Report vulnerabilities to{' '}
          <a href={`mailto:${site.emails.security}`}>{site.emails.security}</a>.
        </p>

        <h2>Children&apos;s privacy</h2>
        <p>
          The Services are not directed to children under 16, and we do not knowingly collect personal information from
          children. If you believe a child has provided us information, contact{' '}
          <a href={`mailto:${site.emails.privacy}`}>{site.emails.privacy}</a> and we will delete it.
        </p>

        <h2>Your choices and regional rights</h2>
        <p>
          You may opt out of marketing emails at any time. Depending on your location, you may have rights to access,
          correct, export, delete, or restrict processing of personal information, and to lodge a complaint with a
          supervisory authority.
        </p>
        <p>
          <strong>California:</strong> We do not sell or share personal information as those terms are used in the CCPA /
          CPRA for cross-context behavioral advertising. You may submit a &quot;do not sell or share&quot; request to{' '}
          <a href={`mailto:${site.emails.privacy}`}>{site.emails.privacy}</a>; because we do not sell or share in that
          sense, we will confirm the same.
        </p>
        <p>
          <strong>EEA / UK:</strong> Where GDPR applies, we process marketing-site personal data under legitimate
          interests or consent (for example waitlist signup), and customer content in managed accounts under the
          customer&apos;s instructions as processor. Exact legal bases and transfer mechanisms are subject to counsel
          review before GA.
        </p>

        <h2>Contact</h2>
        <p>
          <strong>ClawQL</strong> (Delaware incorporation pending)
          <br />
          Privacy: <a href={`mailto:${site.emails.privacy}`}>{site.emails.privacy}</a>
          <br />
          Security: <a href={`mailto:${site.emails.security}`}>{site.emails.security}</a>
          <br />
          General: <a href={`mailto:${site.emails.general}`}>{site.emails.general}</a> ·{' '}
          <Link href={site.urls.contact}>Contact page</Link>
        </p>
      </DocumentCentered>
    </>
  )
}
