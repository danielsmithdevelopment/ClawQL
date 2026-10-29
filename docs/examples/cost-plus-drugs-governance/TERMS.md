# Third-party terms note (Cost Plus Drugs)

This example demos ClawQL **governance** around Cost Plus Drugs' **public** pricing
API and MCP server. It is **not** an official Cost Plus Drugs product.

## What we checked (2026-10-29)

| Surface | URL | Auth | Notes |
| ------- | --- | ---- | ----- |
| Pricing API | `https://api.costplusdrugs.com/pricelist/...` | None | Documented at [pricing-api-documentation](https://mccpdc-llc.github.io/pricing-api-documentation/) |
| MCP (reads) | `https://mcp.costplusdrugs.com/` | None | Thin proxy over the same read-only endpoints; [MCP docs](https://mccpdc-llc.github.io/pricing-api-documentation/mcp.html) |
| Docs GitHub | [MCCPDC-LLC/pricing-api-documentation](https://github.com/MCCPDC-LLC/pricing-api-documentation) | — | **No LICENSE file** in the docs repo at check time |

Their MCP **scope** page states the server **will not**: give clinical or dosing
advice, suggest substitutions, say whether a drug is right for a patient, or do
**anything beyond price & availability**.

There is **no public ordering / refill / account API** documented. Write tools in
this example are **mocks** labeled as such.

## Before any commercial use

Free and unauthenticated **does not** automatically mean commercial redistribution
or productization is allowed. Before shipping a product that depends on their API
or MCP:

1. Obtain written clarification or a license from Mark Cuban Cost Plus Drug Company, PBC.
2. Respect robots / rate limits; prefer `search` over full-catalog tools.
3. Keep the same clinical-advice boundary they publish.
4. Do not claim affiliation unless they agree.

Offline fixtures under `fixtures/` are **snapshots of public cash prices** for
demo reproducibility; re-fetch live data for any public presentation.
