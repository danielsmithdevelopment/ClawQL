# Security policy

## Supported versions

| Version | Supported                           |
| ------- | ----------------------------------- |
| 8.x     | Yes (current development line)      |
| 7.x     | Security fixes until **2026-12-31** |
| &lt; 7  | No                                  |

Published npm latest remains **7.2.0** until the 8.0.0 cut; the monorepo tree is **8.0.0-unreleased**.

## Reporting a vulnerability

Report security issues privately via **[GitHub Security Advisories](https://github.com/danielsmithdevelopment/ClawQL/security/advisories/new)** (preferred) or email **daniel@clawql.com**. Include reproduction steps, affected versions, and impact if known.

Please do **not** open public GitHub issues for undisclosed vulnerabilities.

### Safe harbor

We will not pursue legal action against good-faith security research that:

- avoids privacy violations, destruction of data, and service disruption beyond what is needed to demonstrate an issue;
- promptly reports findings through the channels above; and
- gives us a reasonable window to remediate before public disclosure.

## Response expectations

| Severity | Target first response |
| -------- | --------------------- |
| Critical | 48 hours              |
| High     | 5 business days       |
| Other    | 10 business days      |

We will acknowledge receipt, assess impact, and coordinate disclosure when a fix is available.

## Telemetry and privacy

Self-hosted ClawQL does **not** phone home. Marketing site / docs analytics (when enabled) are separate from the product gateway — see the [privacy policy](https://clawql.com/privacy-policy). Pseudonymous identifiers are never described as anonymous.

## Security status (verifiable evidence)

Published scan history, SBOM links, and signature verification commands:

**https://docs.clawql.com/security/status**

That page is fed by CI artifacts and an append-only publish job — not hand-edited summaries.

## Advisories

| Date       | Topic                                                | Advisory                                                                                                                                           |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-03 | Native MCP resume could re-use a single-use approval | [docs/security/advisories/2026-11-03-native-mandate-resume-double-use.md](docs/security/advisories/2026-11-03-native-mandate-resume-double-use.md) |

## Related documentation

- [Security overview (docs)](https://docs.clawql.com/security)
- [Golden image pipeline](docs/security/golden-image-pipeline.md)
- [npm supply chain](docs/security/npm-supply-chain.md)
- [Claim holds — mandate resume + payments](docs/security/claim-holds-mandate-resume-and-payments.md)
