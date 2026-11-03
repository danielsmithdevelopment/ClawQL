# Security policy

## Reporting a vulnerability

Report security issues to **daniel@clawql.com**. Include reproduction steps, affected versions, and impact if known.

Please do **not** open public GitHub issues for undisclosed vulnerabilities.

## Response expectations

| Severity | Target first response |
| -------- | --------------------- |
| Critical | 48 hours              |
| High     | 5 business days       |
| Other    | 10 business days      |

We will acknowledge receipt, assess impact, and coordinate disclosure when a fix is available.

## Security status (verifiable evidence)

Published scan history, SBOM links, and signature verification commands:

**https://docs.clawql.com/security/status**

That page is fed by CI artifacts and an append-only publish job — not hand-edited summaries.

## Advisories

| Date       | Topic                                                | Draft                                                                                                                                              |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-03 | Native MCP resume could re-use a single-use approval | [docs/security/advisories/2026-11-03-native-mandate-resume-double-use.md](docs/security/advisories/2026-11-03-native-mandate-resume-double-use.md) |

## Related documentation

- [Security overview (docs)](https://docs.clawql.com/security)
- [Golden image pipeline](docs/security/golden-image-pipeline.md)
- [npm supply chain](docs/security/npm-supply-chain.md)
- [Claim holds — mandate resume + payments](docs/gtm/claim-holds-mandate-resume-and-payments.md)
