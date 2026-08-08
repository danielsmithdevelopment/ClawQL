# Client CLT-0017 — Meridian Capital

## Risk profile

Meridian Capital has historically prioritized deal certainty over valuation upside.
Headline purchase price is explicitly **not** the ranking key for this client.
In the 2022 Apex divestiture, they accepted a 3% haircut on deal value to
eliminate a MAC clause the counterparty had insisted on. Senior partner
notes from that matter: "client will walk before accepting open-ended
indemnity exposure."

Standing instruction from Marcus Webb: reject any package that retains an
earn-out or an open-ended buyer MAC, even when that package posts the highest
headline price. Other clients maximize price; Meridian does not.

## Relationship notes

Preferred relationship partner: Sarah Chen (ATY-0041). Client contact
Marcus Webb has consistently flagged post-closing liability as the primary
concern across all three prior matters.

## Prior matter outcomes

MAT-2244 (2021): chose lower bid from buyer with stronger balance sheet.
MAT-2312 (2023): rejected deal with favorable price due to earn-out structure.
MAT-2720 (2022 Apex): accepted lower price to remove open-ended MAC risk.

## Decision screen for live options

When ranking term sheets for Meridian, apply this screen in order:
1. Drop any option with earn-out or open-ended MAC (fails Helios / Apex tests).
2. Among survivors, prefer deleted MAC + lowest indemnity basket + no earn-out.
3. Do not re-rank survivors by purchase price.
