/**
 * auth.md prose document for agent registration discovery.
 * @see https://workos.com/auth-md
 */

import { getSiteOrigin } from '@/lib/site-url'

export function getAuthMdContent(): string {
  const origin = getSiteOrigin().origin.replace(/\/$/, '')

  return `# auth.md

You are an agent. **ClawQL** supports agentic registration for MCP and API access. Follow these steps in order.

**Resource server:** \`${origin}/\`  
**Authorization server:** \`${origin}/\` (discovery metadata; production tokens may be issued by your configured IdP)

## Step 1 — Discover

### 1a. Protected Resource Metadata

\`\`\`http
GET /.well-known/oauth-protected-resource
\`\`\`

Returns RFC 9728 metadata: \`resource\`, \`authorization_servers\`, \`scopes_supported\`, and \`resource_documentation\`.

### 1b. Authorization Server metadata

\`\`\`http
GET /.well-known/oauth-authorization-server
\`\`\`

Includes standard OAuth 2.0 fields plus an \`agent_auth\` block with registration endpoints:

- \`agent_auth.skill\` — this document (\`${origin}/auth.md\`)
- \`agent_auth.identity_endpoint\` — \`POST ${origin}/agent/identity\`
- \`agent_auth.claim_endpoint\` — \`POST ${origin}/agent/identity/claim\`
- \`agent_auth.events_endpoint\` — \`POST ${origin}/agent/event/notify\`

## Step 2 — Pick a method

1. **identity_assertion + id-jag** — when your identity provider can mint an ID-JAG audience-bound to \`${origin}/\`.
2. **service_auth** — when you have the user's email; claim ceremony required.
3. **anonymous** — register without a user identity; optional claim later.

Check \`agent_auth.identity_types_supported\` in the authorization server metadata.

## Step 3 — Register

\`\`\`http
POST /agent/identity
Content-Type: application/json

{
  "type": "anonymous",
  "scopes": ["mcp.tools", "api.read"]
}
\`\`\`

For \`identity_assertion\`, POST an ID-JAG instead. For \`service_auth\`, include \`email\`.

## Step 4 — Claim (if required)

For \`anonymous\` or \`service_auth\` flows, complete the claim ceremony:

\`\`\`http
POST /agent/identity/claim
\`\`\`

Poll \`GET /agent/identity/claim/view\` until the user confirms.

## Step 5 — Exchange for access token

\`\`\`http
POST /.well-known/oauth-authorization-server/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<identity_assertion>
\`\`\`

## Step 6 — Call ClawQL

Send \`Authorization: Bearer <access_token>\` to the MCP Streamable HTTP endpoint or protected API routes.

- MCP server card: \`${origin}/.well-known/mcp/server-card.json\`
- Agent card (A2A): \`${origin}/.well-known/agent-card.json\`
- Commerce OpenAPI: \`${origin}/openapi.json\`
- Payments discovery: \`${origin}/.well-known/payments.json\`

## Commerce

ClawQL's **native** agentic payment rails on self-hosted deployments are **Stripe**, **x402**, and **MPP** (WORM-audited). Docs.clawql.com also publishes discovery stubs for **UCP**, **ACP**, and **AP2** (planned adapters):

- Native rails guide: [ClawQL payments](${origin}/payments/clawql-payments)
- x402 probe: \`GET ${origin}/api/v1\` returns HTTP 402 with \`PAYMENT-REQUIRED\` (v2)
- MPP OpenAPI: \`${origin}/openapi.json\`
- Payments discovery: \`${origin}/.well-known/payments.json\`
- UCP profile (stub): \`${origin}/.well-known/ucp\`
- ACP discovery (stub): \`${origin}/.well-known/acp.json\`
- AP2 extension URI on the agent card (planned mandates)

Live payment settlement requires a self-hosted ClawQL deployment with \`clawql-payments\` configured.

## Revocation

Revoke tokens at the \`revocation_endpoint\` from authorization server metadata (RFC 7009).

## Related docs

- [Agent setup](${origin}/agent-setup)
- [MCP tools](${origin}/tools)
- [Spec configuration](${origin}/spec-configuration)
`
}
