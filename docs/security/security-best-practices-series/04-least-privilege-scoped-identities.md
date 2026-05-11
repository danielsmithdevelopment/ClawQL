---
title: "Principle of Least Privilege: Scoped Identities and Limiting Blast Radius"
series: "Agentic AI Security Curriculum"
course_type: "instructor-ready / self-study"
audience: "Security architects, platform engineers, and teams adopting AI agents"
estimated_minutes: 30
level: foundational
tags:
  - kubernetes
  - rbac
  - identity
  - least-privilege
  - agents
part: 4
total_parts: 20
date: "May 2026"
slug: "least-privilege-scoped-identities"
canonical_path: "/security/best-practices/least-privilege-scoped-identities"
prev: "cluster-admission-control-signing-policy"
next: "zero-trust-fundamentals"
description: "Apply least privilege to Kubernetes identities (ServiceAccounts, Roles, bindings)."
---

# Principle of Least Privilege: Scoped Identities and Limiting Blast Radius

_Module 4 of 20 · Agentic AI Security Curriculum · May 2026_

## How to use this module

Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**.

**Estimated time:** ~30 minutes reading; add time for linked standards and team discussion.

## Learning objectives

By the end of this module, you should be able to:

1. Apply least privilege to Kubernetes identities (ServiceAccounts, Roles, bindings).
2. Map tool-calling and agent sessions to scoped credentials and short-lived tokens.
3. Explain blast-radius containment when a single workload or agent is compromised.

## Prerequisites

- Prior module: [Cluster Admission Control: Enforcing Image Signing and Policy at Deploy Time](03-cluster-admission-control-signing-policy.md)

**Suggested discussion / lab:** Pick one diagram in your environment (build, deploy, runtime) and mark where this module’s controls apply; note gaps versus the checklist in the body.

---

Even with perfect supply chain security and admission control, a compromised workload or agent can still cause significant damage if it has excessive permissions. The Principle of Least Privilege (PoLP) ensures every identity — human, service, or agent — can do only what is strictly necessary, and nothing more.

This module shows how to implement least privilege across Kubernetes, MCP tools, and agent sessions to minimize blast radius.

### Least Privilege in Theory and Practice

Least privilege means granting the minimum permissions required for a task and only for the duration needed. In agentic systems this is critical because agents can chain tools in unexpected ways.Apply least privilege at multiple layers:Kubernetes workloads
Human operators
Agent/MCP tool calls
Session-scoped claims

### Per-Workload Identities with Kubernetes RBAC and ServiceAccounts

Every component should run with its own dedicated ServiceAccount and tightly scoped Role/RoleBinding.

**Example for the API gateway:**

yaml

apiVersion: v1
kind: ServiceAccount
metadata:
name: clawql-api
namespace: clawql

---

apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
name: clawql-api-role
rules:

- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list", "watch"] # no create/update/delete
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list"] # read-only for status

No production pod should run with cluster-admin or overly broad permissions. Your GitOps or operator pattern should manage these bindings declaratively.

### YubiKey Requirement for High-Impact Changes

Any change to production Helm charts for the control plane or critical CRDs requires hardware-backed Git signing with a YubiKey.This ensures that even if a developer workstation is compromised, an attacker cannot push malicious chart changes without physical hardware access. Treat production Helm upgrades as signed, reviewed changes.

### Explicit MCP Tool Scoping and ATR Claims

One of the most powerful least-privilege controls in agent stacks is **ATR (Agent Task Request)** scoping at the MCP layer. Every tool call is validated against the user’s session claims. Agents can only invoke tools explicitly allowed for their role and vertical.

**Example ATR-bound tool registration:**

Mortgage underwriters can call lending-specific tools but not blockchain or healthcare tools.
Sandbox execution is restricted to approved Kata-isolated namespaces.
Cross-vertical memory recall requires elevated memory.cross_vertical: true claim.

A synchronous MCP gateway or policy proxy can enforce these scopes synchronously on every clawql_execute call.

### Limiting Blast Radius

Combining these controls means that:A compromised pod cannot reach most cluster resources.
A compromised agent cannot call dangerous tools.
A compromised developer cannot deploy malicious changes without hardware keys.
Even full container escape is contained by Kata sandboxing (covered in Module 8).

### Key Takeaways

Least privilege turns potential catastrophic breaches into limited incidents.
Dedicated ServiceAccounts, narrow RBAC roles, and hardware-backed changes form the foundation.
ATR scoping at the MCP gateway provides fine-grained, per-task control that traditional RBAC cannot achieve alone.
Every identity and every tool must be explicitly authorized — implicit access is forbidden.

Strong least privilege is the bedrock of zero trust, which is covered next.

**Next module:** Zero Trust Fundamentals – Assume Compromise and Verify Everything.

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

- [Kubernetes RBAC good practices](https://kubernetes.io/docs/concepts/security/rbac-good-practices/)
- [NIST SP 800-207 (Zero Trust)](https://csrc.nist.gov/publications/detail/sp/800-207/final)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

## Commercial training use

You may reuse this curriculum internally or in **paid consulting / training** engagements. Keep examples aligned to the customer’s actual stack; substitute your own runbooks, tool names, and compliance frameworks (SOC 2, ISO 27001, sector regulators) where cited examples use a reference architecture only.

---
