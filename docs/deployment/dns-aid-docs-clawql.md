# DNS-AID records for docs.clawql.com

**DNS for AI Discovery (DNS-AID)** lets agents discover ClawQL docs, MCP, and A2A endpoints via DNS SVCB/HTTPS/TXT records under `_agents.<domain>`. [isitagentready.com](https://isitagentready.com) checks `_index._agents`, `_a2a._agents`, and `_mcp._agents` on the site hostname.

These records are **infrastructure** (Cloudflare DNS dashboard or API) — they cannot be served from the Next.js app.

## Prerequisites

- DNS zone for `clawql.com` on Cloudflare (or another provider with SVCB/HTTPS support)
- DNSSEC enabled (recommended; scanners report `dnssecValidated`)
- Deploy [PR #602](https://github.com/danielsmithdevelopment/ClawQL/pull/602) agent-readiness routes before publishing records

## Recommended records

Replace `docs.clawql.com` if your canonical docs host differs.

### Index (required for scanner)

TXT fallback when SVCB custom parameters are unavailable:

```text
_index._agents.docs.clawql.com.  3600  IN  TXT  "agents=clawql-docs:https,clawql-mcp:mcp,clawql-a2a:a2a"
```

Optional SVCB index pointing at the docs origin:

```text
_index._agents.docs.clawql.com.  3600  IN  HTTPS  1 docs.clawql.com. alpn="h3,h2" port=443
```

### MCP agent

```text
_clawql-mcp._mcp._agents.docs.clawql.com.  3600  IN  HTTPS  1 docs.clawql.com. alpn="h2" port=443
_clawql-mcp._mcp._agents.docs.clawql.com.  3600  IN  TXT  "cap=https://docs.clawql.com/.well-known/mcp/server-card.json"
```

### A2A agent

```text
_clawql-docs._a2a._agents.docs.clawql.com.  3600  IN  HTTPS  1 docs.clawql.com. alpn="h2" port=443
_clawql-docs._a2a._agents.docs.clawql.com.  3600  IN  TXT  "cap=https://docs.clawql.com/.well-known/agent-card.json"
```

## Cloudflare dashboard steps

1. Open **DNS** → **Records** for `clawql.com`
2. Add each TXT record with **Name** `_index._agents.docs` (Cloudflare appends `.clawql.com`)
3. Add HTTPS/SVCB records if your plan supports them; otherwise TXT alone satisfies many resolvers
4. Enable **DNSSEC** under **DNS** → **Settings**
5. Wait for propagation, then verify:

```bash
dig TXT _index._agents.docs.clawql.com +short
dig HTTPS _clawql-mcp._mcp._agents.docs.clawql.com +short
dig HTTPS _clawql-docs._a2a._agents.docs.clawql.com +short
```

## Verification

Re-run the agent readiness scan:

```bash
curl -sS -X POST 'https://isitagentready.com/api/scan' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://docs.clawql.com/"}' | jq '.checks.discoverability.dnsAid'
```

Target: `status: "pass"`.

## References

- [DNS-AID specification](https://www.dns-aid.org/)
- [IETF draft: DNS for AI Discovery](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/)
- ClawQL agent card: `https://docs.clawql.com/.well-known/agent-card.json`
- ClawQL MCP card: `https://docs.clawql.com/.well-known/mcp/server-card.json`
