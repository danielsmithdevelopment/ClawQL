import Link from 'next/link'

import { DocumentCentered } from '@/components/sections/document-centered'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Authentication',
  description:
    'ClawQL inbound and outbound auth: proactive OAuth refresh with a mutex, API keys, EMA / ID-JAG (consumer and issuer), signing, and audit.',
  path: '/auth',
})

export default function Page() {
  return (
    <DocumentCentered
      id="document"
      headline="Authentication"
      subheadline={
        <p>
          ClawQL handles two distinct authentication problems. <strong>Inbound</strong> is how clients and human
          operators authenticate to ClawQL&apos;s own MCP gateway. <strong>Outbound</strong> is how ClawQL authenticates
          to upstream services — Slack, Google, GitHub, and anything else an agent needs to call — on an agent&apos;s
          behalf. Most confusion about MCP auth comes from treating these as one problem. They are handled separately
          here.
        </p>
      }
    >
      <p>
        <strong>Package:</strong>{' '}
        <Link href="https://github.com/danielsmithdevelopment/ClawQL/tree/main/packages/clawql-auth">clawql-auth</Link>{' '}
        ·{' '}
        <Link href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/packages/clawql-auth/README.md">
          README
        </Link>{' '}
        ·{' '}
        <Link href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/packages/clawql-auth/src/oauth/token-store.ts">
          token store
        </Link>
      </p>

      <h2>Outbound: token refresh</h2>
      <p>
        The most common MCP auth complaint is a token that worked yesterday and doesn&apos;t today. This usually happens
        for one of two reasons: the token expired before anything tried to refresh it, or multiple concurrent sessions
        raced to refresh the same token and invalidated each other.
      </p>
      <p>ClawQL&apos;s outbound token store addresses both directly.</p>
      <p>
        <strong>Refresh is proactive, not reactive.</strong> A token is refreshed once it comes within 60 seconds of
        expiry, not after a call fails with a 401. Nothing in a normal session should ever hit an expired token.
      </p>
      <p>
        <strong>Refresh is mutex-protected.</strong> When several concurrent agent sessions share a credential for the
        same provider, only one refresh runs at a time. Every other session waiting on that credential queues behind the
        in-flight refresh instead of calling the provider&apos;s token endpoint independently. This matters because most
        OAuth providers issue single-use refresh tokens — two simultaneous refresh attempts against the same refresh
        token typically means one succeeds and the other fails with <code>invalid_grant</code>, taking a session down
        for no reason other than timing. ClawQL&apos;s token store makes that race structurally impossible rather than
        relying on retry logic to paper over it.
      </p>
      <pre>
        <code>{`getValidToken(providerId, sessionId)
  → token still valid?          → return it
  → refresh already in flight?  → wait on that refresh, don't start another
  → otherwise                   → own the refresh, others queue behind it`}</code>
      </pre>
      <p>
        <strong>Failure is explicit, not silent.</strong> If a refresh token is dead (<code>invalid_grant</code>), the
        credential is marked as requiring re-authorization and the calling session receives a typed error rather than a
        generic failure. This is a real state change a human needs to act on — a stale credential doesn&apos;t quietly
        keep retrying in the background.
      </p>
      <p>
        This covers any provider ClawQL calls on an agent&apos;s behalf: Google, Microsoft, Slack, GitHub, and others.
        All of it applies whether ClawQL is calling one provider from one session or many sessions calling many
        providers concurrently.
      </p>

      <h2>Inbound: connecting to ClawQL itself</h2>
      <p>
        Inbound authentication is how something connects to ClawQL&apos;s MCP gateway — a human operator, a CI pipeline,
        or a client like Claude Desktop, Cursor, or Cline.
      </p>

      <h3>API keys</h3>
      <p>
        The default for programmatic and machine-to-machine access. Issued keys (<code>cqk_…</code>) are hashed on
        storage, validated with a constant-time comparison, and scoped — a key can be limited to specific tools and a
        specific owner (a single developer, a team, or an organization). Keys are revocable; optional expiry is set at
        issue time.
      </p>

      <h3>Enterprise-Managed Authorization (EMA)</h3>
      <p>
        ClawQL implements the open ID-JAG (Identity Assertion JWT Authorization Grant) extension to OAuth — the same
        mechanism behind Claude&apos;s, VS Code&apos;s, and other MCP hosts&apos; Enterprise-Managed Authorization. This
        is not a proprietary integration; it&apos;s an open, IETF-track specification that any identity provider or MCP
        server can implement.
      </p>
      <p>ClawQL supports both roles independently:</p>
      <p>
        <strong>As a Resource App Authorization Server (consumer role).</strong> An enterprise&apos;s identity provider
        — Okta today, others as they add support — mints an ID-JAG assertion when an employee logs in. ClawQL verifies
        that assertion against the org&apos;s JWKS, maps the employee&apos;s IdP groups to a scoped access token, and
        the employee gets access with no individual OAuth consent screen. This is the standard EMA flow: the org&apos;s
        existing IdP stays the source of truth, ClawQL is the connector accepting its assertions.
      </p>
      <p>
        <strong>As an Enterprise Identity Provider (issuer role).</strong> ClawQL can also mint ID-JAG assertions
        itself, for organizations that want zero-touch provisioning without routing session-token custody through a
        third-party identity SaaS. In this mode, ClawQL is the org&apos;s IdP for the purposes of MCP connector access —
        any EMA-compliant connector, not just ClawQL&apos;s own, can accept assertions ClawQL issues.
      </p>
      <p>
        An organization can run either role alone or both simultaneously, with no third-party identity provider involved
        in the AI/MCP path at all.
      </p>

      <h3>What EMA does not cover</h3>
      <p>
        ID-JAG assumes the underlying enterprise SSO already produced a standard identity assertion by the time it
        reaches an MCP connector. If an organization&apos;s internal SSO is SAML rather than OIDC, that exchange — SAML
        assertion to OAuth token to ID-JAG — happens entirely on the identity provider&apos;s side, before anything
        reaches ClawQL. ClawQL does not implement a SAML server itself; this is a deliberate scope boundary, not a
        missing feature.
      </p>

      <h3>Session tokens</h3>
      <p>
        Once a client is authenticated by any of the above methods, it holds a short-lived session JWT (MCP OAuth access
        tokens default to <strong>5 minutes</strong>; refresh tokens default to <strong>1 hour</strong> — both
        configurable) carrying the scope it&apos;s authorized for — which tools it can call, what budget it has, how long
        the session lasts. This token is what gets checked on every subsequent tool call, not the original credential.
      </p>

      <h2>Signing</h2>
      <p>
        Production deployments sign tokens with RS256 and publish a JWKS endpoint, so a resource server can verify
        tokens without holding the signing key. A development-only HS256 fallback exists for local testing and is not
        intended for production use; ClawQL warns at startup if a production-shaped deployment is running on the
        development signing path.
      </p>
      <p>
        Where ClawQL acts as both a Resource App Authorization Server and an Enterprise Identity Provider in the same
        deployment, each role should use its own signing key. Sharing one key between the two roles is supported for
        convenience but means a compromise of either role compromises both; ClawQL warns at startup when this
        configuration is in use.
      </p>

      <h2>Audit</h2>
      <p>
        Every authentication event — a token issued, a token refused, a refresh that succeeded or failed, a
        re-authorization requested — is emitted through ClawQL&apos;s auth event sink into the append-only audit trail
        when a host has wired one (for example process WORM via <code>clawql-audit</code>). See{' '}
        <Link href="/audit">Audit Trail</Link> for how that trail is structured and verified.
      </p>

      <h2>Summary</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Problem</th>
              <th>Mechanism</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Outbound token expired overnight</td>
              <td>Proactive refresh, 60 seconds before expiry</td>
            </tr>
            <tr>
              <td>Concurrent sessions invalidating each other&apos;s refresh token</td>
              <td>Mutex — one refresh per provider, others queue</td>
            </tr>
            <tr>
              <td>Per-user OAuth consent screens at enterprise scale</td>
              <td>EMA / ID-JAG, consumer role</td>
            </tr>
            <tr>
              <td>Third-party identity provider holding session-token custody</td>
              <td>EMA / ID-JAG, issuer role — ClawQL as the IdP</td>
            </tr>
            <tr>
              <td>Legacy SAML-based internal SSO</td>
              <td>Out of scope — handled upstream by the org&apos;s IdP before reaching ClawQL</td>
            </tr>
            <tr>
              <td>Verifying who did what, when</td>
              <td>Every auth event in the audit trail</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DocumentCentered>
  )
}
