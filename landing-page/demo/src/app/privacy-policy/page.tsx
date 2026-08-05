import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'
import { site } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Privacy Policy',
  description: 'How ClawQL collects, uses, and protects information on the marketing site, waitlist, and services.',
  path: '/privacy-policy',
})

export default function Page() {
  return (
    <>
      <DocumentCentered id="document" headline="Privacy Policy" subheadline={<p>Last updated on August 5, 2026.</p>}>
        <p>
          ClawQL (&quot;<strong>we</strong>,&quot; &quot;<strong>us</strong>,&quot; or &quot;<strong>our</strong>&quot;)
          respects your privacy. This policy describes how we collect, use, and protect information when you use the
          ClawQL marketing site, sign up for managed account waitlists, or interact with our services (collectively, the
          &quot;<strong>Services</strong>&quot;).
        </p>
        <h2>Information we collect</h2>
        <p>
          We may collect information you provide directly — such as your name, email address, and company name when you
          join a waitlist or contact us. We may also collect limited technical data (browser type, IP address, pages
          visited) to operate and improve the site.
        </p>
        <h2>How we use information</h2>
        <p>We use collected information to:</p>
        <ul>
          <li>Respond to waitlist signups and contact requests</li>
          <li>Provide and improve the Services</li>
          <li>Send product updates you have opted into</li>
          <li>Comply with legal obligations</li>
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
          not a bank and does not offer FDIC-insured balances. Managed hosting does <strong>not</strong> provide
          peer-to-peer credit transfer or agent-to-agent compensation ledgers between customers — those software
          features exist for self-hosted operators who enable them under their own compliance programs. Optional
          prepaid credits on managed plans, when offered, are intended as closed-loop balances redeemable for ClawQL
          services only.
        </p>
        <h2>Sharing and retention</h2>
        <p>
          We may share information with service providers who assist with hosting, email delivery, or analytics, bound
          by confidentiality obligations. We retain information only as long as needed for the purposes above or as
          required by law.
        </p>
        <h2>Security</h2>
        <p>
          We implement reasonable administrative and technical safeguards. No method of transmission over the internet
          is completely secure; we cannot guarantee absolute security.
        </p>
        <h2>Your choices</h2>
        <p>
          You may opt out of marketing emails at any time. Depending on your location, you may have rights to access,
          correct, or delete personal information we hold about you.
        </p>
        <h2>Contact</h2>
        <p>Questions about this policy? Reach us at:</p>
        <p>
          <strong>ClawQL</strong>
          <br />
          Email: <Link href={site.urls.contact}>hello@clawql.com</Link>
        </p>
      </DocumentCentered>
    </>
  )
}
