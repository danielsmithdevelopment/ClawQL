# SOC 2 Type II readiness packaging

**Status:** Shipped packaging (docs + Helm baseline) — closes engineering acceptance for [#133](https://github.com/danielsmithdevelopment/ClawQL/issues/133)  
**Not:** A SOC 2 report, Type I/II opinion, or HIPAA certification. Those require your GRC program, an observation period, and a licensed CPA firm / assessor.

**Pairs with:** [`clawql-security-defense-deliverables.md`](clawql-security-defense-deliverables.md) (#164), curriculum [§29](security-best-practices-series/29-compliance-regulatory-mapping.md), [`restore-drill.md`](../deployment/restore-drill.md), [`ai-enforcement-default-posture.md`](ai-enforcement-default-posture.md), [`support-impersonation.md`](support-impersonation.md), [`idp-login-abuse-ownership.md`](idp-login-abuse-ownership.md).

## What this package is for

Teams that need **SOC 2 Type II** (Trust Services Criteria operated effectively over time) use this package to:

1. Map **CC / A / PI / C / P** criteria to **ClawQL artifacts already in Git**.
2. Apply a **Helm hardening overlay** so production defaults match the narrative auditors expect.
3. Run a **continuous evidence calendar** (quarterly packages + restore drills) so Type II is not a scramble.

HIPAA-oriented readiness (BAAs, PHI retention, BRA) is included as a **companion checklist**. HIPAA is not “SOC 2 with PHI” — treat it as a separate GRC track when you handle ePHI.

## Honest path to Type II

| Stage                                          | Owner          | ClawQL contribution                                             |
| ---------------------------------------------- | -------------- | --------------------------------------------------------------- |
| **Design controls**                            | Security + eng | This matrix + Helm profile                                      |
| **Type I readiness**                           | GRC + auditor  | Point-in-time description of control design                     |
| **Observation period** (typically 3–12 months) | Ops            | Evidence calendar below; retain WORM / CI / access logs         |
| **Type II report**                             | CPA firm       | Opinion on operating effectiveness — **not produced by ClawQL** |

Managed hosting (`clawql.com`) and self-hosted operators share the **same control catalog**; **evidence custody** differs (platform vs customer). See [`hosted-vs-self-hosted-compliance.md`](../payments/hosted-vs-self-hosted-compliance.md) for payments framing.

## Data-flow surfaces (auditor orientation)

Draw / attach your deployment diagram covering at least:

| Surface         | Typical components                                                          | Notes                                    |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| Human console   | `apps/dashboard`, Supabase Auth / customer IdP                              | ClawQL is **not** the human password IdP |
| Agent MCP       | `clawql-mcp` Helm, optional MCP proxy / Panguard                            | ATR / JWT at chokepoint                  |
| Memory / vault  | Obsidian / team sync (R2/S3), optional WORM (`clawql-audit`)                | Ring-buffer `audit` MCP ≠ WORM           |
| Documents / IDP | Docling, Onyx, Paperless (opt-in)                                           | PHI labels must not land in metrics      |
| Secrets         | HashiCorp Vault + External Secrets (chart default)                          | No long-lived `.env` in prod             |
| Money           | Stripe webhooks + cents ledger                                              | Idempotency; no P2P on managed           |
| Evidence        | CI (OSV/Trivy/CodeQL/Gitleaks), restore drills, support impersonation JSONL | Retain for observation window            |

## Trust Services Criteria → ClawQL checklist

Use this as a **control inventory**. Mark each row for your environment: **In place** / **Partial** / **N/A (IdP/customer)** / **Gap**.

### CC6 — Logical access

| Control theme           | ClawQL / ops evidence                                                                         | Check |
| ----------------------- | --------------------------------------------------------------------------------------------- | ----- |
| Human SSO / MFA         | Customer IdP or Supabase Auth; [`idp-login-abuse-ownership.md`](idp-login-abuse-ownership.md) | ☐     |
| Machine / agent auth    | API keys (`cqk_`), MCP OAuth, ATR — `packages/clawql-auth`                                    | ☐     |
| Least privilege pods    | Helm `podSecurityContext` / `securityContext` — see `values-soc2-hardening.example.yaml`      | ☐     |
| Support view-as audited | [`support-impersonation.md`](support-impersonation.md) + JSONL / Audit                        | ☐     |
| Session kill            | Console / mobile **end-others**                                                               | ☐     |
| Offboard                | SCIM / directory sync + key revoke                                                            | ☐     |

### CC7 — System operations / change

| Control theme                | Evidence                                                        | Check |
| ---------------------------- | --------------------------------------------------------------- | ----- |
| IaC as SoT                   | Helm chart + Git; `Makefile` lint                               | ☐     |
| Signed images                | Cosign in `docker-publish`; Kyverno `verifyImages` (default on) | ☐     |
| Supply chain gates           | CI `supply-chain` (OSV + Trivy + SBOM); CodeQL; Gitleaks        | ☐     |
| Immutable runtime preference | Distroless MCP image; rolling updates                           | ☐     |

### CC8 / CC9 — Change / risk (org)

| Control theme             | Evidence                                                                                   | Check |
| ------------------------- | ------------------------------------------------------------------------------------------ | ----- |
| Change tickets            | Your GRC / GitHub + deploy approvals (customer)                                            | ☐     |
| Vulnerability SLA         | Org process; CI blocks HIGH/CRITICAL                                                       | ☐     |
| Quarterly security review | Curriculum [§25](security-best-practices-series/25-quarterly-security-review-checklist.md) | ☐     |

### A1 — Availability

| Control theme          | Evidence                                                                                  | Check |
| ---------------------- | ----------------------------------------------------------------------------------------- | ----- |
| Health / probes        | `/healthz`, Helm probes                                                                   | ☐     |
| Backup + restore drill | [`restore-drill.md`](../deployment/restore-drill.md) — **logged RTO/RPO**                 | ☐     |
| Synthetics / on-call   | [#199](https://github.com/danielsmithdevelopment/ClawQL/issues/199) (track until shipped) | ☐     |

### PI1 — Processing integrity

| Control theme                | Evidence                                                                                       | Check |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| Schema / cents money         | Payments cents + idempotency                                                                   | ☐     |
| Webhook verify               | Stripe signature verify                                                                        | ☐     |
| HITL / mandates              | Review queue, device-bound keys                                                                | ☐     |
| AI tool-scope enforcement    | [`ai-enforcement-default-posture.md`](ai-enforcement-default-posture.md) — Panguard on in prod | ☐     |
| Merkle / WORM (when enabled) | `clawql-audit` / curriculum §18                                                                | ☐     |

### C1 — Confidentiality

| Control theme          | Evidence                                                                                                                    | Check |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| TLS in transit         | Ingress TLS secrets; mesh mTLS when enabled                                                                                 | ☐     |
| Secrets in Vault/ESO   | Chart `secretSourcing.requireVaultBackedSecrets`                                                                            | ☐     |
| Network segmentation   | Managed gateway NetworkPolicy; Istio egress allowlist opt-in                                                                | ☐     |
| Log / metric redaction | No PHI in `sourceLabel` / metric labels — [`enterprise-mcp-tools.md`](../mcp/enterprise-mcp-tools.md#regulated-deployments) | ☐     |

### P — Privacy (if in scope)

| Control theme       | Evidence                                       | Check |
| ------------------- | ---------------------------------------------- | ----- |
| Retention / erasure | Console Settings retention; memory erase paths | ☐     |
| Subprocessor list   | Your privacy notice + BAAs/DPAs (customer)     | ☐     |

## HIPAA companion (when ePHI is in scope)

| Item                                                                          | Owner                  | Check |
| ----------------------------------------------------------------------------- | ---------------------- | ----- |
| BAA with every data-path vendor (cloud, Vault host, model APIs if applicable) | Legal / GRC            | ☐     |
| 6-year minimum audit retention for PHI tenants (WORM policy)                  | Security               | ☐     |
| Inactivity / session timeouts                                                 | IdP + console settings | ☐     |
| Breach Risk Assessment process (PICERL → BRA)                                 | Security               | ☐     |
| PHI never in metrics / free-form logs                                         | Eng + ops              | ☐     |
| Healthcare vertical flags only when intended                                  | Ops                    | ☐     |

## Helm hardening profile

Apply the example overlay (does **not** replace your org secrets):

```bash
helm upgrade --install clawql ./manifests/charts/clawql-mcp \
  --namespace clawql \
  --create-namespace \
  -f manifests/charts/clawql-mcp/values-soc2-hardening.example.yaml \
  -f path/to/your-secrets-and-hosts.yaml \
  --wait
```

Profile intent:

- Non-root MCP workload + dropped capabilities + read-only root where compatible.
- Kyverno Cosign verify **on**.
- AI enforcement env markers for Panguard / no `CLAWQL_ALLOW_NO_ENFORCEMENT`.
- Managed gateway NetworkPolicy when that edge is enabled.
- Ingress TLS **placeholders** (you must supply cert secrets).
- Comments pointing at restore drills and log redaction.

## Type II evidence calendar (minimum)

| Cadence                 | Artifact                                                      | Where it lives                                                                           |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Every merge (prod path) | CI supply-chain + CodeQL + secret scan                        | GitHub Actions retention + export to evidence store                                      |
| Weekly                  | Access / offboard sample (SCIM events)                        | IdP + ClawQL audit export                                                                |
| Monthly                 | Patch / image digest report                                   | Cosign / GHCR digests                                                                    |
| Quarterly               | Security review + **restore drill** with RTO/RPO              | [`restore-drill.md`](../deployment/restore-drill.md) record table                        |
| Quarterly               | Evidence package (Panguard decisions, WORM roots, review PDF) | Encrypted to compliance mailbox / WORM bucket                                            |
| Continuous              | Support impersonation JSONL / Audit                           | Dashboard host `.data/` + Audit UI                                                       |
| Quarterly               | Stripe dunning sample (`STRIPE_PAYMENT_FAILED` → recovery)    | [`stripe-dunning-proration.md`](../payments/stripe-dunning-proration.md) + payments WORM |

**Observation tip:** Start the Type II window only after the hardening profile is live and the first restore drill is logged. Auditors ask for **dates**, not aspirations.

## Acceptance (#133)

- [x] Dedicated packaging doc (this file) with checklist control mapping.
- [x] Helm hardening example values.
- [x] Linked from deliverables matrix, security index, and regulated-deployments docs.
- [ ] Case-study / website cross-link when site refresh [#70](https://github.com/danielsmithdevelopment/ClawQL/issues/70) lands (optional follow-up).

## Disclaimer

ClawQL engineers **controls and evidence hooks**. Your organization owns **policies, risk acceptance, vendor BAAs, access reviews, and the auditor engagement**. Do not claim “SOC 2 certified” based solely on merging this package.
