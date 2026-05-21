# Agentic AI Security Curriculum (30 modules)

Thirty **vendor-neutral** Markdown modules for security architects, platform engineers, and teams shipping **LLM agents, tool calling, and MCP-style integrations**. Each file is standalone with YAML frontmatter for the static site, internal wiki, or docs generator.

**Build from sources:** `node tools/security-curriculum-v30/build-modules.mjs` (reads `tools/security-curriculum-v30/manifest.json` + `bodies/NN.md`).

## Table of contents

### I. Supply Chain Security

| # | Title | Slug |
| -: | ----- | ---- |
| 1 | Container Image Security: Pinning, Distroless Pipelines, Mirror Registries, and Golden Images | [`container-image-security-pinning-distroless-golden-images`](01-container-image-security-pinning-distroless-golden-images.md) |
| 2 | Cluster Admission Control: Image Signing, Kyverno, and Blocking Unsigned Workloads | [`cluster-admission-control-signing-policy`](02-cluster-admission-control-signing-policy.md) |
| 3 | ClawHub Skill Vetting and Safe Installation | [`clawhub-skill-vetting-safe-installation`](03-clawhub-skill-vetting-safe-installation.md) |

### II. Network Security and Perimeter

| # | Title | Slug |
| -: | ----- | ---- |
| 4 | Zero Trust Network Architecture: mTLS, Istio, RBAC, and Workload Identity | [`zero-trust-network-mtls-istio-rbac`](04-zero-trust-network-mtls-istio-rbac.md) |
| 5 | Agent Gateway Hardening: Binding, Firewall Rules, DNS Rebinding Defense, and Safe Remote Access | [`agent-gateway-hardening-dns-rebinding`](05-agent-gateway-hardening-dns-rebinding.md) |
| 6 | Egress Filtering, DNS Controls, and Data Loss Prevention | [`egress-filtering-dns-dlp`](06-egress-filtering-dns-dlp.md) |

### III. Identity, Secrets and Access Control

| # | Title | Slug |
| -: | ----- | ---- |
| 7 | Least Privilege and Scoped Kubernetes Identities | [`least-privilege-scoped-kubernetes-identities`](07-least-privilege-scoped-kubernetes-identities.md) |
| 8 | Secrets at Rest: Vault Integration, HSM Backing, and Tamper-Proof Audit Logging | [`secrets-at-rest-vault-hsm-audit`](08-secrets-at-rest-vault-hsm-audit.md) |
| 9 | Authentication and Session Management | [`authentication-session-management-scoped-tokens`](09-authentication-session-management-scoped-tokens.md) |
| 10 | Agent Identity Lifecycle: Provisioning, Scope Governance, and Decommissioning | [`agent-identity-lifecycle-provisioning`](10-agent-identity-lifecycle-provisioning.md) |

### IV. Runtime Enforcement and Sandboxing

| # | Title | Slug |
| -: | ----- | ---- |
| 11 | Sandboxing Agent Workloads: Kata Containers, gVisor, and macOS Seatbelt | [`sandboxing-kata-gvisor-seatbelt`](11-sandboxing-kata-gvisor-seatbelt.md) |
| 12 | MCP Runtime Enforcement: Panguard, ATR Rules, Schema Validation, and Injection Defense | [`mcp-runtime-enforcement-panguard-atr`](12-mcp-runtime-enforcement-panguard-atr.md) |
| 13 | Input Validation and Protocol Hardening | [`input-validation-protocol-hardening`](13-input-validation-protocol-hardening.md) |
| 14 | Multi-Agent Trust Hierarchies and Orchestrator Security | [`multi-agent-trust-orchestrator-security`](14-multi-agent-trust-orchestrator-security.md) |

### V. Data and Model Protection

| # | Title | Slug |
| -: | ----- | ---- |
| 15 | Data Classification and PII Redaction | [`data-classification-pii-redaction-residency`](15-data-classification-pii-redaction-residency.md) |
| 16 | Model Weight Integrity | [`model-weight-integrity-verification`](16-model-weight-integrity-verification.md) |
| 17 | GPU and Resource Protection | [`gpu-resource-protection-isolation`](17-gpu-resource-protection-isolation.md) |
| 18 | Memory and Context Poisoning Prevention | [`memory-context-poisoning-prevention`](18-memory-context-poisoning-prevention.md) |

### VI. Detection, Monitoring and Incident Response

| # | Title | Slug |
| -: | ----- | ---- |
| 19 | Security Monitoring and Observability Architecture | [`security-monitoring-observability-siem`](19-security-monitoring-observability-siem.md) |
| 20 | Automated Response and Incident Recovery | [`automated-response-incident-recovery-picerl`](20-automated-response-incident-recovery-picerl.md) |

### VII. Development and Deployment Security

| # | Title | Slug |
| -: | ----- | ---- |
| 21 | Development and Deployment Security | [`development-deployment-security`](21-development-deployment-security.md) |

### VIII. Threat Modelling and Adversarial Testing

| # | Title | Slug |
| -: | ----- | ---- |
| 22 | Threat Modelling for Agentic AI | [`threat-modelling-stride-agentic-ai`](22-threat-modelling-stride-agentic-ai.md) |
| 23 | OWASP Agentic Top 10 | [`owasp-agentic-top-10-mitigations`](23-owasp-agentic-top-10-mitigations.md) |
| 24 | Red Teaming and Adversarial Testing | [`red-teaming-adversarial-testing`](24-red-teaming-adversarial-testing.md) |

### IX. Platform Operations and Resilience

| # | Title | Slug |
| -: | ----- | ---- |
| 25 | Quarterly Security Review Checklist | [`quarterly-security-review-checklist`](25-quarterly-security-review-checklist.md) |
| 26 | Vulnerability Management, Patch Cadence, and Cryptographic Agility | [`vulnerability-management-patch-cryptography`](26-vulnerability-management-patch-cryptography.md) |
| 27 | Secure Multi-Tenancy | [`secure-multi-tenancy-isolation`](27-secure-multi-tenancy-isolation.md) |
| 28 | Disaster Recovery and Business Continuity | [`disaster-recovery-business-continuity`](28-disaster-recovery-business-continuity.md) |

### X. Governance and Compliance

| # | Title | Slug |
| -: | ----- | ---- |
| 29 | Compliance and Regulatory Mapping | [`compliance-regulatory-mapping`](29-compliance-regulatory-mapping.md) |
| 30 | Human Operator Security | [`human-operator-security-admin-controls`](30-human-operator-security-admin-controls.md) |

## How to use this material

- Work through `01` … `30` in order, or jump by section using `part` / `prev` / `next` in frontmatter.
- Body text uses illustrative YAML, policies, and product names (Harbor, Kyverno, Istio, Kata, and similar). Treat them as **patterns**, not mandatory SKUs.

## Frontmatter reference (CMS / site generators)

| Key                    | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `title`                | Page title                                                                                              |
| `series`               | `Agentic AI Security Curriculum`                                                                        |
| `level`                | `foundational`, `intermediate`, or `advanced` — tune for your taxonomy                                  |
| `tags`                 | YAML list of lowercase tokens (e.g. `kubernetes`, `sbom`, `owasp`) for faceted search / related content |
| `part` / `total_parts` | Position in curriculum (`total_parts` is **30**)                                                        |
| `date`                 | Publication or review stamp                                                                             |
| `slug`                 | URL-safe identifier                                                                                     |
| `canonical_path`       | Suggested site path (e.g. `/security/best-practices/<slug>`)                                            |
| `description`          | Short SEO / catalog blurb                                                                               |
| `prev` / `next`        | Neighbor slugs for pagination                                                                           |

## Source monolith

The long-form narrative is still available as one file: [`../security-guide-series.md`](../security-guide-series.md) (legacy 20-part structure; prefer this 30-module series for new work).

## Maintenance

| Path | Role |
| ---- | ---- |
| [`tools/security-curriculum-v30/manifest.json`](../../../tools/security-curriculum-v30/manifest.json) | Titles, slugs, tags, descriptions |
| [`tools/security-curriculum-v30/bodies/`](../../../tools/security-curriculum-v30/bodies/) | Module bodies (edit here, then run build) |
| [`tools/security-curriculum-v30/build-modules.mjs`](../../../tools/security-curriculum-v30/build-modules.mjs) | Regenerate `NN-slug.md` files |
| [`_polish_headings_and_frontmatter.py`](_polish_headings_and_frontmatter.py) | Bulk heading/frontmatter passes |
| [`_training_transform.py`](_training_transform.py) | Legacy bulk transform — not idempotent |
