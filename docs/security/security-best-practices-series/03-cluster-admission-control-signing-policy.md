---
title: "Cluster Admission Control: Enforcing Image Signing and Policy at Deploy Time"
series: "Agentic AI Security Curriculum"
course_type: "instructor-ready / self-study"
audience: "Security architects, platform engineers, and teams adopting AI agents"
estimated_minutes: 35
level: foundational
tags:
  - kubernetes
  - admission-control
  - policy-as-code
  - kyverno
part: 3
total_parts: 20
date: "May 2026"
slug: "cluster-admission-control-signing-policy"
canonical_path: "/security/best-practices/cluster-admission-control-signing-policy"
prev: "golden-images-distroless-pipelines"
next: "least-privilege-scoped-identities"
description: "Describe the role of admission controllers in preventing mis-scoped workloads from running."
---

# Cluster Admission Control: Enforcing Image Signing and Policy at Deploy Time

_Module 3 of 20 · Agentic AI Security Curriculum · May 2026_

## How to use this module

Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**.

**Estimated time:** ~35 minutes reading; add time for linked standards and team discussion.

## Learning objectives

By the end of this module, you should be able to:

1. Describe the role of admission controllers in preventing mis-scoped workloads from running.
2. Explain image signature verification and digest requirements at deploy time.
3. Identify policy engines (e.g. Kyverno, OPA/Gatekeeper) and when each fits.

## Prerequisites

- Prior module: [Building Golden Images: Automated Scanning, Hardening, and Distroless Pipelines](02-golden-images-distroless-pipelines.md)

**Suggested discussion / lab:** Pick one diagram in your environment (build, deploy, runtime) and mark where this module’s controls apply; note gaps versus the checklist in the body.

---

With a secure supply chain and golden distroless images in place (Modules 1 and 2), the next layer is preventing non-compliant workloads from ever starting. Cluster admission controllers act as the final gatekeeper, rejecting unsigned, unverified, or insecure images before they are scheduled.

This module focuses on Kyverno as an admission controller and shows how to enforce image signing, golden image standards, and runtime policies at deploy time.

### Why Admission Control Is Essential

Even with strong supply chain practices, misconfigurations or human error can still introduce risky workloads. Admission webhooks provide a last-line defense by inspecting pod specs in real time and rejecting them if they violate policy.In hardened deployments, this ensures:Only images from your private Harbor registry are allowed.
Every image must be Cosign-signed and digest-pinned.
Model weight verification and golden image rules are enforced.
No pod can run with excessive privileges or writable root filesystems.

### Kyverno verifyImages Admission Policies

Kyverno is a common choice as the primary admission controller. It supports cryptographic verification of container images and model artifacts.

**Core Policy: Require Signed Images**

yaml

apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
name: enforce-signed-images
spec:
validationFailureAction: Enforce
background: false
rules: - name: verify-cosign-signature
match:
resources:
kinds: ["Pod"]
validate:
message: "All containers must be signed with Cosign and pulled from Harbor"
imageVerify: - imageReferences: ["registry.internal.example/**"]
verify: - type: "cosign"
keyless:
issuer: "https://token.actions.githubusercontent.com"
subject: "https://github.com/clawql/*"

This policy rejects any pod using unsigned images or images from external registries.

### Extending Verification to Model Weights

Model weights are a common blind spot. This module extends admission control to verify them via init containers:yaml

# Example init container pattern enforced by policy

initContainers:

- name: verify-weights
  image: registry.internal.example/clawql/weight-verifier:latest
  command:
  - cosign
  - verify-blob
  - --key
  - /etc/signing-keys/cosign.pub
  - --signature
  - /weights/manifest.sig
  - /weights/manifest.json
    volumeMounts:
  - name: model-weights
    mountPath: /weights

A dedicated Kyverno policy ensures every inference pod includes this verification step.

### Cluster-Wide vs Namespace Exemptions

Many teams apply a **cluster-wide default-deny** posture with limited exemptions:openclaw and clawql namespaces: strict enforcement.
Temporary exemption namespaces (e.g., for debugging) require explicit approval and short TTL.
All exemptions are logged and reviewed quarterly.

### Integration with Golden Images and Supply Chain

The admission policies work together with Guides 1 and 2:Only images built through the golden pipeline (distroless + read-only root) are allowed.
Digest pinning and SBOM presence are validated.
Non-compliant pods are rejected before scheduling, preventing drift.

**Helm Chart Defaults**

The clawql-full-stack chart enables these policies automatically when security.fullBundle: true.

### Key Takeaways

Admission controllers like Kyverno provide the final enforceable gate before any workload runs.
Cryptographic verification (Cosign) combined with allowlist policies eliminates unsigned or tampered images.
Extending policies to model weights closes a critical gap missed by traditional container scanning.
Cluster-wide enforcement with minimal exemptions maintains a strong, auditable security posture.

This module completes the build-time and deploy-time foundations. All later runtime protections (sandboxing, zero trust, MCP proxying) build on top of these admission guarantees.

**Next module:** Principle of Least Privilege – Scoped Identities and Limiting Blast Radius.

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

- [Kyverno verifyImages](https://kyverno.io/docs/writing-policies/verify-images/)
- [OPA Gatekeeper](https://open-policy-agent.github.io/gatekeeper/website/docs/)
- [Kubernetes admission control overview](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)
- [Ratify (artifact ratification)](https://ratify.dev/)

## Commercial training use

You may reuse this curriculum internally or in **paid consulting / training** engagements. Keep examples aligned to the customer’s actual stack; substitute your own runbooks, tool names, and compliance frameworks (SOC 2, ISO 27001, sector regulators) where cited examples use a reference architecture only.

---
