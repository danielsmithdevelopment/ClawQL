# Cloud page draft (`clawql.com/cloud`)

**Status:** Draft for marketing site. Prepared 2026-11-11. Live route: [`apps/www/src/app/cloud/page.tsx`](../../apps/www/src/app/cloud/page.tsx). Statuses checked against [`clawql-cloud-platform-plan.md`](./clawql-cloud-platform-plan.md) on this date.

**Related:** [`/governance`](https://clawql.com/governance) · [`/security`](https://clawql.com/security) · [`/durability`](https://clawql.com/durability) · [`/pricing`](https://clawql.com/pricing).

---

# ClawQL Cloud

**A cloud built for agents: governed by default, isolated by design, and the same stack you can run yourself.**

*Early access. Each capability below is marked built, in early access, or planned.*

General-purpose clouds were built for web servers. Agents are different: they spend most of their time waiting, they act on other people's systems, and every action may need to be explained to an auditor later. ClawQL Cloud is built around those facts.

## What you can run

| Workload | What it's for | Status |
| --- | --- | --- |
| **MCP gateway with memory** | Connect any agent to your APIs and data through one governed endpoint | Early access |
| **Document processing (IDP)** | Classification, extraction and redaction on dedicated infrastructure | Early access |
| **Durable agents** | Agents that wake, act and park, surviving crashes without repeating or losing work | Planned |
| **Containers** | Always-on services in any language, alongside your agents | Planned |
| **Webhook ingress** | One listener for every provider's webhooks, verified and turned into agent work | Planned |
| **One-click harnesses** | Hermes Agent and Pi, enabled from the same dashboard with ClawQL as their governed tool layer | Planned |

## Governance is included, not an add-on

Every tier, every workload: approvals bound to a person, untrusted-content labels, credentials agents never hold, default-deny egress and a tamper-evident audit trail. These are what ClawQL is, not upgrades. See [/governance](/governance).

## Isolation you choose

| Tier | What you get | Status |
| --- | --- | --- |
| Shared | Your own data, keys and credentials on shared infrastructure | Early access |
| Dedicated | Your own nodes, database and keys | Planned |
| Bring your own cloud | We operate ClawQL inside your AWS or GCP account | Planned |
| Hardened | Confidential computing with hardware attestation | Planned |

## Your data stays yours

- **Structural isolation on paid tiers.** Your telemetry and memory sit in your own storage, under your own encryption key, read only by processes holding your credentials. A bug can't leak your data to another customer, because nothing serving them has permission to read it.
- **Provable deletion.** Deleting your account destroys your key, so any copy left in a backup or cache becomes unreadable, and each step is recorded.
- **Any free or trial tier** uses shared infrastructure with logical isolation, says so plainly, and doesn't accept regulated data.

## Connect private systems without exposing them

Hosted ClawQL can join your existing Tailscale network as an authorized app, limited to exactly the services it needs, so your private APIs never face the internet. *Planned.*

## Models on your terms

- **Bring your own keys,** stored in the vault. ClawQL never handles model providers' consumer-subscription credentials.
- **Policy-routed models.** Easy requests can go to small models and hard ones to large models, but sensitive data only ever goes where your policy allows. *Planned.*
- **Sovereign inference** inside your tenant boundary, on IDP tiers.

## Observability built in

Dashboards for what agents actually do: pending approvals, blocked egress, labels, tool calls by outcome, spend and recovery.

## The same stack, self-hosted

Self-host the Apache 2.0 packages in this repository with no license fee — start with `npx clawql-mcp` or the Helm chart. Some packages in the network whitepaper design table remain private or BSL and are not part of that self-host path.

**Pricing:** see [/pricing](/pricing). Managed prices on that page are **planned early-access figures, subject to change** until unit costs are measured on a real host (Cloud plan gate).

---

## Notes for publishing

- [x] Verify statuses (Dedicated = Planned; Shared / gateway / IDP = Early access; rest Planned).
- [x] Licensing statement reconciled with whitepaper package table (Apache self-host path vs private/BSL design packages).
- [x] Cross-link `/governance`, `/security`, `/durability`, `/pricing`.
- [x] Pricing page reconciliation: executor jab + head-to-head removed; production/case-study softened; Sovereign pack = extras only; Onyx unnamed on pricing surface; fair-use / early-access price TBD; no “global edge”; licensing dual statement; illustrative incumbent figures dated.

### Status verification (2026-11-11)

| Item | Evidence | Verdict |
| --- | --- | --- |
| MCP gateway + memory | Managed waitlist / Developer–Teams early access on `/pricing` | Early access |
| IDP | Starter+ early-access tiers | Early access |
| Durable agents / containers / webhooks / harnesses | Cloud plan phases — not shipped as Cloud product | Planned |
| Shared isolation | Early-access managed path | Early access |
| Dedicated | Cloud plan grid + open question on exact meaning; not a live measured SKU | Planned |
| BYOC / Hardened | Cloud plan | Planned |
| Tailscale join | Network v0.2 / Cloud connectors | Planned |
| Licensing | Root `LICENSE` Apache-2.0; whitepaper § packages Private/BSL for some Rust | Honest dual statement |
