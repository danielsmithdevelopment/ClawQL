---
title: "Cluster Admission Control: Image Signing, Kyverno, and Blocking Unsigned Workloads"
series: "Agentic AI Security Curriculum"
level: foundational
tags:
  - kubernetes
  - kyverno
  - cosign
  - admission-control
  - pod-security
part: 2
total_parts: 32
date: "May 2026"
slug: "cluster-admission-control-signing-policy"
canonical_path: "/security/best-practices/cluster-admission-control-signing-policy"
description: "Cosign verification and Kyverno admission policies that block unsigned or policy-violating workloads."
prev: "container-image-security-pinning-distroless-golden-images"
next: "clawhub-skill-vetting-safe-installation"
---

# Cluster Admission Control: Image Signing, Kyverno, and Blocking Unsigned Workloads

Image Signing, Kyverno, and Blocking Unsigned Workloads

Hello and welcome to Module 2!

Module 1 gave us rock-solid images that we can trust leaving the registry. Now we make sure only those trusted images — and only workloads that meet every security policy — are allowed to run inside the cluster.

This is the last line of supply-chain defense. Even if CI is bypassed, a deploy key is stolen, or someone runs a manual kubectl apply under pressure, the cluster itself will say “no” to anything that doesn’t meet the rules. Admission control turns the Kubernetes API into an unbreakable gatekeeper.

Let’s build it together.

---

Why the Cluster Is the Last Line of Supply Chain Defense

CI pipelines are excellent, but they are not infallible. A compromised deploy key, a hotfix under deadline pressure, or a direct kubectl command can still push malicious workloads into production.

Without admission control, the scheduler will happily run any image you give it.

Admission webhooks solve this problem by intercepting every resource creation (Pods, Deployments, Jobs, etc.) _before_ the scheduler ever sees them. The cluster itself becomes the enforcement point that cannot be social-engineered or bypassed by credential theft.

This is the control that says: “No matter how the workload arrived, it must pass these checks or it does not run.”

---

Cosign Image Signing — Cryptographic Proof of Origin

We attach a cryptographic signature to every approved image using Cosign.

How it works:

- After all scans and tests pass in CI, Cosign signs the image manifest in the registry.

- The signature is verified against the publisher’s public key (stored in the cluster as a ConfigMap or via Sigstore’s TUF root).

- We strongly prefer keyless signing with Sigstore: the signature is bound to the CI system’s OIDC identity (e.g., GitHub Actions or GitLab) instead of a long-lived private key.

Verification checks performed by the cluster:

- Correct signer identity

- Correct image digest

- Signature not expired

Critical rule: Sign at the end of the CI pipeline, after every scan and test has passed — never before.

---

Kyverno Policy Engine — Kubernetes-Native Enforcement

Kyverno runs as a validating and mutating admission webhook. No custom code is required — everything is written in plain Kubernetes YAML.

Key policies we enforce on every workload:

- Deny any pod whose image reference is not a digest — tag-only references are rejected.

- Deny any pod whose image digest does not have a valid Cosign signature.

- Deny any pod running as root (UID 0).

- Deny any pod with privileged: true or allowPrivilegeEscalation: true.

- Deny any pod that mounts the Docker socket.

- Require specific label sets on all production pods (owner, team, version, environment).

- Mutating policy: automatically add a secure seccomp profile if none is specified.

These policies are simple, readable, and version-controlled alongside the rest of your infrastructure code.

---

OPA/Gatekeeper as an Alternative (or Companion)

Kyverno is our default because its YAML-first approach is accessible to the entire team.

When you need more complex logic, OPA (Open Policy Agent) with Gatekeeper is the perfect complement:

- Uses the powerful Rego language.

- Gatekeeper is the official Kubernetes integration for OPA.

- Both engines can run simultaneously — Kyverno for simple policies, Gatekeeper for advanced ones.

Choose whichever tool fits your team’s comfort level; the important part is that policy lives as code and is enforced at admission time.

---

Admission Webhook Architecture — The Technical Details

There are two types of webhooks:

- ValidatingWebhookConfiguration: can only reject a resource (the most common for security).

- MutatingWebhookConfiguration: can add or change fields before validation runs (e.g., injecting seccomp profiles).

Failure policy is critical:

- Fail — reject the request if the webhook is unreachable (this is mandatory for security webhooks).

- Ignore — silently allow the request if the webhook is down (never use this in production for security policies).

Webhook availability is now a security dependency. Include admission controllers in your disaster-recovery and business-continuity planning (we’ll cover this in Module 28).

---

Blocking Namespace Escape and Privileged Workloads

We go beyond images and also block common escape paths:

- Deny hostPID, hostNetwork, and hostIPC on all agent pods.

- Deny volume mounts of host paths except for explicitly approved monitoring paths.

- Enforce Kubernetes Pod Security Standards at the namespace level using the restricted profile for all agent namespaces.

Namespace labels enforce the policy:

[pod-security.kubernetes.io/enforce](http://pod-security.kubernetes.io/enforce): restricted

-

This combination makes privilege escalation and namespace breakout structurally impossible.

---

Audit Mode Before Enforcement — Safe Rollout

Never flip a new policy straight to enforce mode in production.

Best practice:

1. Deploy the policy in audit mode first (violations are logged but not blocked).

2. Review audit logs for 7 days to identify any legitimate workloads that would be blocked.

3. Fix or adjust those workloads.

4. Switch the policy to enforce mode only after the audit period is clean.

This approach prevents accidental outages while still giving you full visibility.

---

Key Takeaways (Memorize These!)

- Admission control is the enforcement point that cannot be bypassed by compromised CI credentials.

- The Fail policy on security webhooks is mandatory — Ignore silently disables enforcement during an outage.

- Image signing and digest pinning at the cluster layer close the gap that registry controls alone cannot close.

- Pod Security Standards at the namespace level are the baseline; Kyverno policies add the specific, agentic hardening on top.

You now have a cluster that refuses to run anything untrusted or unsafe — no matter how it was submitted.

This is defense-in-depth at its best: the registry gives us trusted images, and the cluster enforces that trust at the final gate.
