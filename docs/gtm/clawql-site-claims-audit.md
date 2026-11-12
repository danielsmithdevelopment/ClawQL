# Site claims audit

*Started 2026-11-11. One section per live page, checked against verified evidence and the claims rules on /benchmarks. Pages reviewed: /pricing and /about (fix lists in their own drafts), home, /streams, /industries/healthcare, /industries/lending, /industries/government, /industries/surveillance, /industries/real-estate, /idp, /agents.*

*Engineering pass on branch `cursor/network-whitepaper-zk-bft-2725` (2026-11-12 PT): highest-risk live-page copy fixed; this file records decisions and remaining counsel/check items.*

---

## How to use this doc

Each live page gets a section of findings, sorted into **fix now** (false or misleading as written), **reconcile** (two pages or a page and the product disagree), and **consistency**. The standard is the one /benchmarks already uses: claim only what is measured or shipped, label design as design, and compare fairly.

## Issues that recur across pages

| Issue | Where it appears | Resolution |
| --- | --- | --- |
| Design described as shipping (TEE execution, event-driven agents, QR channel, decentralized topology) | Home, /about, /security, /agents, /streams | **Done (marketing):** heroes and badges label Streams/TEE/QR as design/planned. Keep /security drafts aligned. |
| What is on by default in self-hosted 8.0 (Panguard enforcement is opt-in; which governance controls are default-on is unstated) | Home versus /governance and /security | **Done (partial):** home + /governance state Panguard opt-in (`CLAWQL_PANGUARD_PROXY_PLUGIN=1`). Managed defaults still need an explicit table. |
| The `audit` tool ("ring buffer… clear") versus the tamper-evident audit trail | Home, /about, /governance, industries | **Done (marketing):** FAQ and industry/IDP/agents copy distinguish MCP `audit` vs hash-chained / Object Lock trail. Rename of the MCP tool remains a product decision. |
| "Full Apache 2.0 stack" versus the whitepaper's private or BSL packages | Every page footer, /pricing | **Done (marketing):** copy says "Apache 2.0 packages in this repository." Whitepaper dual-license honesty still needs one maintainer decision for private/BSL packages. |
| Onyx named as a shipped feature | Home, /pricing, /about, IDP | **Done (marketing pages):** "semantic search (engine under review)." GTM playbooks and signup still name Onyx — next pass if those stay public. |
| Prices published before unit costs are measured | Home, /pricing | **Done (home):** pricing excerpt replaced with link to /pricing. Keep early-access labels on /pricing. |
| Claims of production use or customers | /pricing, /about, /agents | **Done (marketing):** founder/lab deployments; no external customer production claims. |
| Competitor statements | /pricing, home, /streams, /agents | **Done (marketing):** unsourced comparison tables removed or deferred; false "every other platform" claims removed. |

## Home page

### Fix now — status

- [x] Hero rewritten around shipped gateway/memory/audit/IDP; Streams/TEE labeled.
- [x] Badges: OpenBench "measured (3 tasks)"; TEE not claimed as shipping.
- [x] "Every other agent platform…" removed from FAQ/competitor framing.
- [x] clawql-tee section: design wording + QR planned.
- [x] WORM: hash-chained; write-once where Object Lock configured.
- [x] Pricing excerpt → short link to /pricing (no duplicate tiers).

### Reconcile / check — remaining

- [ ] Managed vs self-hosted default control matrix (single source of truth).
- [ ] OpenBench B-7.1 "rebuilt stack" note beside result if re-confirmed.
- [ ] RockYourLobster deployments wording vs rockyourlobster.com.
- [ ] Protocol fabric surface count: keep `protocolFabricSurfaces.shippedCount` as single source (home + streams).

## /streams

### Fix now — status

- [x] Status line above the fold (Lab 5b opt-in; `stream_*` planned).
- [x] Removed "not a metered lab runtime" dig.
- [x] Replaced "Infinite session scale" with measured/density framing + /durability link.
- [x] Removed unsourced competitor comparison table.
- [x] "Compliance-grade" → hash-chained / write-once where configured.
- [x] celld wording updated (stock 0.6.3 + lab fixes; Cloudflare/workerd path).
- [x] Ambient events labeled untrusted.
- [x] Payments not implied crash-safe.

### Remaining

- [ ] Public "new loop design" (planner-only work creation) when ready to publish as design.
- [ ] Training emission consent scopes vs whitepaper (confirm when featuring).

## Industries

Prior industry softens retained and tightened:

- Healthcare: pipeline-scoped redaction; not Safe Harbor; planned vertical.
- Lending: MCP audit ≠ examiner trail; CompliancePlugin planned; BNPL assistive not automated decisioning.
- Government: status banner; no FedRAMP-ready claim; illustrative figures; agency-staff forward box; payments durability caveat.
- Surveillance: planned status; FRE 901 not promised; CJIS self-host; competitor blanket claims softened / sourced as verify.
- Real estate: no per-transaction pricing; attorney disclaimer; audit buffer vs durable trail.

Counsel review still recommended before paid campaigns on healthcare, lending, government, surveillance.

## /idp

### Fix now — status

- [x] Starter = 5,000 documents/mo (not unlimited) in TCO + Starter section.
- [x] Sovereignty/audit defaults reconciled with Sovereign Security Pack / configuration language.
- [x] Removed "only IDP that is also a native MCP server."
- [x] Headline softened; illustrative caveat attached.
- [x] "Accuracy converged" removed; extraction unmeasured disclaimer.
- [x] Demo vs production deploy timing.
- [x] ConeShare license caveat; healthcare PHI → /data-handling; detects 1,000+ types.

## /agents

### Fix now — status

- [x] Hero and trust strip: shipped vs planned.
- [x] Removed false competitor exclusivity claims.
- [x] Removed O(1) corpus claim.
- [x] clawql-tee / Enterprise TEE labeled design/planned; not sold.
- [x] Training flywheel opt-in / own benchmarks only.
- [x] Zero-trust chain: chip-vendor trust acknowledged.
- [x] Budgets + acceptance criteria stop condition.
- [x] Sovereignty defaults aligned with /pricing configuration language.
- [x] Verticals list statuses; Events vertical removed until it has a page.

## /governance

- [x] Panguard opt-in called out in hero, body, and status table.
- [x] Audit trail vs MCP `audit` ring buffer.
- [x] Write-once / Object Lock and external anchoring qualified.

## Next pages to audit

1. rockyourlobster.com (TEE tier).
2. /status.
3. External sites linked from industries (model contract repo, challengethefootage.com).
4. GTM playbook pages (`/idp/gtm`, `/inference/gtm`, `/enterprise/gtm`) and `/signup` if they stay public — still name Onyx and older unlimited/FedRAMP phrasing.
