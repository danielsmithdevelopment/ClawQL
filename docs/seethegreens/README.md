# See The Greens LOS — website copy (trust pages)

Markdown drafts for **[seethegreens.com](https://seethegreens.com/)** pages that support **sales diligence**, not ClawQL engineering docs.

## Intended audience

| Page                                                       | Primary readers                                                                           | They care about                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)                       | VP / Director of **Operations**, **Production**, **Processing**; **IT integration** leads | How loans move through the system, where humans decide, what integrates with their stack |
| [security-and-compliance.md](./security-and-compliance.md) | **Compliance**, **Risk**, **Internal Audit**, **InfoSec**, **Vendor Management**          | Data handling, audit trails, access control, regulatory alignment, diligence questions   |

**Not the audience:** MCP implementers, Kubernetes operators, or OpenClaw developers — point them to [ClawQL docs](../README.md) and [IDP pipeline hub](../providers/idp-pipeline.md).

## Usage

- Copy sections into the See The Greens site CMS or static site repo.
- Replace `[contact]` / `[demo]` placeholders with live links.
- Update **certification status** on the security page when SOC 2 or other attestations are finalized — do not imply certification until official.

## Platform reference (internal)

Implementation ground truth lives in the ClawQL repo: [lending W-2 sample](../../deployment/samples/lending-w2/README.md), [IDP pipeline](../providers/idp-pipeline.md), [observability bundle](../observability/README.md). These trust pages translate that stack into lender language.
