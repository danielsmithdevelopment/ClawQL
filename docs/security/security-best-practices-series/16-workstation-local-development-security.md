---
title: "Workstation and Local Development Security: Same Posture Everywhere"
series: "Agentic AI Security Curriculum"
course_type: "instructor-ready / self-study"
audience: "Security architects, platform engineers, and teams adopting AI agents"
estimated_minutes: 30
level: advanced
tags:
  - devsecops
  - workstations
  - developer-security
part: 16
total_parts: 20
date: "May 2026"
slug: "workstation-local-development-security"
canonical_path: "/security/best-practices/workstation-local-development-security"
prev: "gpu-resource-protection"
next: "production-deployment-secure-full-stack"
description: "Extend production security expectations to developer laptops and CI runners."
---

# Workstation and Local Development Security: Same Posture Everywhere

_Module 16 of 20 · Agentic AI Security Curriculum · May 2026_

## How to use this module

Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**.

**Estimated time:** ~30 minutes reading; add time for linked standards and team discussion.

## Learning objectives

By the end of this module, you should be able to:

1. Extend production security expectations to developer laptops and CI runners.
2. List minimum controls (disk encryption, MFA, signed commits) for high-impact repos.
3. Reduce “works on my machine” gaps that become production incidents.

## Prerequisites

- Prior module: [GPU and Resource Protection: Preventing Rogue Agent Denial-of-Service](15-gpu-resource-protection.md)

**Suggested discussion / lab:** Pick one diagram in your environment (build, deploy, runtime) and mark where this module’s controls apply; note gaps versus the checklist in the body.

---

Security is not only a production concern. Developer workstations are often the weakest link and the most common entry point for supply chain attacks. Engineering policy should require the same high security standards in local development environments as in production.

### Full Stack on Docker Desktop

Developers run the complete clawql-full-stack Helm chart on Docker Desktop with the security bundle enabled:yaml

security:
fullBundle: true
kata:
enabled: true
panguard:
enabled: true
weightVerification:
enabled: true

This deploys the intelligent MCP gateway, Panguard, Kyverno policies, and golden images locally.

### Panguard CLI for Local MCP Proxy

The pga up command starts a local Panguard instance that mirrors production behavior:Same ATR rule enforcement
Same blocking and auditing
Local MCP proxy for Cursor, Claude Desktop, and other clients

All local tool calls go through the same security chokepoint as production.

### Additional Local Protections

**Aegis EDR** — Process, filesystem, and network monitoring on macOS/Windows workstations.
**Wazuh Agents** — Forward local events to the central SIEM for correlation with cluster activity.
**Gitleaks** — Mandatory pre-commit hook (enforced via Husky or similar).
**YubiKey** — Required for any Git commit that touches Helm charts or critical configuration.

### Developer Onboarding Requirements

Every new developer must:Install and configure Aegis + Wazuh agent.
Set up YubiKey for Git signing.
Enable Gitleaks pre-commit hooks.
Run the full secure stack on Docker Desktop before contributing.

No exceptions for “quick local testing.”### Key Takeaways

Local development must mirror production security posture — there are no trusted environments.
Developer workstations are high-value targets and must be treated as part of the attack surface.
Tools like Panguard CLI, Aegis, and Wazuh agents extend cluster defenses to the desktop.
Consistent standards across dev and prod reduce the risk of supply chain compromise at the source.

This local security layer ensures the entire development lifecycle aligns with the platform’s defense-in-depth model.

**Next module:** Production Deployment – One-Command Secure Full Stack.

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

- [CIS Workbench (benchmarks for workstations)](https://www.cisecurity.org/cis-benchmarks)
- [NIST SP 800-63 (digital identity)](https://pages.nist.gov/800-63-4/)
- [Sigstore Git signing (keyless)](https://docs.sigstore.dev/signing/git-support/)

## Commercial training use

You may reuse this curriculum internally or in **paid consulting / training** engagements. Keep examples aligned to the customer’s actual stack; substitute your own runbooks, tool names, and compliance frameworks (SOC 2, ISO 27001, sector regulators) where cited examples use a reference architecture only.

---
