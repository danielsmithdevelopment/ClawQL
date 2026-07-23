# DNS-AID + agent edge for clawql.com

[isitagentready.com/clawql.com](https://isitagentready.com/clawql.com) scores the marketing site. Static discovery files ship from `landing-page/demo` (GitHub Pages and/or Cloudflare Pages). **Link headers**, **Accept: text/markdown**, and **DNS-AID** need Cloudflare DNS/edge.

## What the code deploys

| Surface                                            | Where                         | Notes                                                                      |
| -------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `robots.txt`, `sitemap.xml`, `auth.md`, `llms.txt` | Static export                 | Always in `out/`                                                           |
| `/.well-known/*`                                   | Static export                 | Requires `include-hidden-files: true` on `upload-pages-artifact` (dotdirs) |
| Link headers + markdown negotiation                | Cloudflare Pages `functions/` | Or zone Transform Rule + Markdown for Agents when proxied                  |
| DNS-AID TXT/HTTPS                                  | Cloudflare DNS API            | `scripts/deploy/ensure-dns-aid-records.sh`                                 |

## CI automation

Workflow [`.github/workflows/deploy-landing-page.yml`](../../.github/workflows/deploy-landing-page.yml):

1. Builds static export and verifies `.well-known` + commerce stubs exist.
2. Deploys **GitHub Pages** (always).
3. Deploys **Cloudflare Pages** (`clawql-website`) when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set (opt out with `LANDING_PAGE_CLOUDFLARE_DEPLOY=false`).
4. Runs `scripts/deploy/ensure-clawql-com-agent-edge.sh` when the API token is present:
   - Orange-clouds apex only if records still point at GitHub Pages
   - Enables Markdown for Agents (`content_converter`) when the plan allows
   - Upserts a **Link** response header transform
   - Ensures DNS-AID records (same family as [dns-aid-docs-clawql.md](./dns-aid-docs-clawql.md))

## One-time operator checklist

1. Repo secrets: `CLOUDFLARE_API_TOKEN` (Zone DNS Edit, Zone Settings Edit, Transform Rules Edit, Pages Edit) and `CLOUDFLARE_ACCOUNT_ID`.
2. Prefer attaching custom domain **clawql.com** to Cloudflare Pages project **clawql-website** so `functions/` serve Link + markdown without relying on Pro-only `content_converter`.
3. Enable **DNSSEC** on the zone (scanners report `dnssecValidated`; docs already reach level 5 without it, but DNSSEC clears the remaining dnsAid warning).
4. Re-run deploy (`workflow_dispatch` or push under `landing-page/**`), wait for propagation, then:

```bash
curl -sS -X POST 'https://isitagentready.com/api/scan' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://clawql.com"}' | jq '{level, levelName, checks: .checks | map_values(map_values(.status))}'
```

Target: **level 5 / Agent-Native** (same band as docs.clawql.com).

## Manual DNS-AID (if CI cannot write DNS)

```text
_index._agents.clawql.com.  TXT  "agents=clawql-site:https,clawql-mcp:mcp,clawql-a2a:a2a"
_index._agents.clawql.com.  HTTPS  1 clawql.com. alpn="h3,h2" port=443
_mcp._agents.clawql.com.    HTTPS  1 clawql.com. alpn="h3,h2" port=443
_a2a._agents.clawql.com.    HTTPS  1 clawql.com. alpn="h3,h2" port=443
```

## Related

- Landing README: [landing-page/README.md](../../landing-page/README.md)
- Docs DNS-AID: [dns-aid-docs-clawql.md](./dns-aid-docs-clawql.md)
