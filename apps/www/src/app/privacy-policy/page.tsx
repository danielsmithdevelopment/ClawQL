import Link from 'next/link'

import { AnalyticsConsentControl } from '@/components/analytics/AnalyticsConsentControl'
import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Privacy Policy',
  description:
    'How ClawQL collects, uses, and protects information on the marketing site, waitlist, and managed Cloud — and what self-hosted ClawQL does not collect.',
  path: '/privacy-policy',
})

export default function Page() {
  return (
    <>
      <DocumentCentered
        id="document"
        headline="Privacy Policy"
        subheadline={<p>Last updated on November 24, 2026.</p>}
      >
        <p>
          ClawQL (&quot;<strong>we</strong>,&quot; &quot;<strong>us</strong>,&quot; or &quot;<strong>our</strong>&quot;)
          respects your privacy. This policy describes how we collect, use, and protect information when you use the
          ClawQL marketing site, docs site, waitlists, contact forms, or managed Cloud hosting (collectively, the
          &quot;<strong>Services</strong>&quot;).
        </p>

        <h2>Self-hosted ClawQL (no product telemetry)</h2>
        <p>
          When you run ClawQL yourself (npm, Docker, Helm), the gateway does <strong>not</strong> phone home. We do not
          collect usage telemetry, crash reports, or vault contents from self-hosted deployments. Operators control
          their own logs, WORM trails, and observability exporters.
        </p>

        <h2>Data categories</h2>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Purpose</th>
              <th>Lawful basis (EEA/UK)</th>
              <th>Retention</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Waitlist / contact (name, email, company)</td>
              <td>Respond to early-access and sales requests</td>
              <td>Consent / legitimate interest (respond to inquiries)</td>
              <td>Until you ask us to delete, or 24 months after last contact</td>
            </tr>
            <tr>
              <td>Marketing/docs pageviews (path, referrer, hostname, optional pseudonymous session ID)</td>
              <td>Understand which public pages are used</td>
              <td>Consent only (see control below)</td>
              <td>Aggregates retained up to 13 months; raw events shorter</td>
            </tr>
            <tr>
              <td>Managed Cloud account config (API tokens you supply, vault paths, billing email)</td>
              <td>Operate your hosted MCP gateway</td>
              <td>Contract</td>
              <td>For the life of the account + limited backup window</td>
            </tr>
            <tr>
              <td>Payment metadata via Stripe</td>
              <td>Bill managed plans</td>
              <td>Contract / legal obligation</td>
              <td>Per Stripe and tax requirements</td>
            </tr>
          </tbody>
        </table>

        <h2>Pageview analytics and consent</h2>
        <p>
          If analytics is enabled on the marketing or docs site, we only send pageviews after you allow them. Events
          include path, referrer, and hostname, plus a <strong>pseudonymous</strong> session ID stored in{' '}
          <code>localStorage</code> — never described as anonymous. No third-party marketing pixels ship with the site
          by default.
        </p>
        <AnalyticsConsentControl />

        <h2>Subprocessors</h2>
        <ul>
          <li>
            <strong>Cloudflare</strong> — site hosting / CDN for clawql.com and docs.clawql.com
          </li>
          <li>
            <strong>Stripe</strong> — managed-plan payments
          </li>
          <li>
            <strong>FormSubmit</strong> (or equivalent form relay) — contact form delivery when configured
          </li>
          <li>
            <strong>PostHog</strong> — optional product analytics only when explicitly enabled for a managed surface;
            not used for self-hosted gateways
          </li>
        </ul>

        <h2>Managed accounts and API data</h2>
        <p>
          When you use a managed ClawQL account, API tokens and vault content you configure remain yours. We process
          this data only to provide the hosted MCP service. We do not sell your personal information or use your API
          credentials for purposes unrelated to operating your account.
        </p>

        <h2>Payments on managed hosting</h2>
        <p>
          Managed ClawQL plans are billed through <strong>Stripe</strong> (and related payment processors). ClawQL is
          not a bank and does not offer FDIC-insured balances. Optional prepaid credits on managed plans are{' '}
          <strong>closed-loop platform credits</strong> redeemable only for ClawQL services.
        </p>

        <h2>Your rights (EEA/UK and similar)</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, restrict, or port personal
          information, and to withdraw consent. Contact{' '}
          <a href={site.urls.contactEmail}>hello@clawql.com</a> to exercise those rights.
        </p>

        <h2>Security</h2>
        <p>
          We implement reasonable administrative and technical safeguards. No method of transmission over the internet
          is completely secure; we cannot guarantee absolute security.
        </p>

        <h2>Contact</h2>
        <p>
          <strong>ClawQL</strong>
          <br />
          Email:{' '}
          <a href={site.urls.contactEmail}>hello@clawql.com</a> · <Link href={site.urls.contact}>Contact page</Link>
        </p>
      </DocumentCentered>
    </>
  )
}
