---
title: "ClawHub Skill Vetting and Safe Installation: Signature Verification, Sandbox Testing, and Allowlisting"
series: "Agentic AI Security Curriculum"
level: foundational
tags:
  - skills
  - supply-chain
  - cosign
  - sandbox
  - allowlist
part: 3
total_parts: 30
date: "May 2026"
slug: "clawhub-skill-vetting-safe-installation"
canonical_path: "/security/best-practices/clawhub-skill-vetting-safe-installation"
description: "Vet third-party skills with manifest signing, static analysis, sandbox observation, and hash pinning."
prev: "cluster-admission-control-signing-policy"
next: "zero-trust-network-mtls-istio-rbac"
---
# ClawHub Skill Vetting and Safe Installation: Signature Verification, Sandbox Testing, and Allowlisting

Signature Verification, Sandbox Testing, and Allowlisting

Hello and welcome to Module 3! 

Modules 1 and 2 locked down our container images and made the cluster itself refuse anything untrusted. Now we tackle a completely different supply-chain problem: skills.

Skills are not container images. They execute *inside* a running agent, with access to whatever ATR claims the current session carries. A single malicious or compromised skill can read secrets, execute commands, or exfiltrate data in one invocation. Download counts, star ratings, and “trusted publisher” badges are social signals — not security controls.

In this module we build a rigorous, automated vetting pipeline that treats every ClawHub skill with the same zero-trust discipline we apply to container images. By the end you’ll know exactly how to verify, analyze, observe, and safely allowlist skills before they ever touch a production agent.



---



Why Skills Are a Distinct Supply Chain Problem

Container images are verified once at the cluster admission layer (Module 2). Skills are different — they run live inside an already-running agent session.

Key differences that make skills uniquely dangerous:

- A skill inherits the full ATR claims of the agent session that loads it.  

- Skills can be updated after publication by a compromised maintainer account.  

- Three primary attack vectors exist: manifest tampering, dependency confusion, and post-publish updates.  


Download count and publisher reputation are not security controls. We need cryptographic proof, static analysis, and behavioral observation before any skill is trusted.



---



Cryptographic Manifest Signing and Verification

Every ClawHub skill ships with two files:

- skill.manifest.json — declares capabilities, required environment variables, egress hosts, and other constraints.  

- A detached Cosign signature for that manifest.  


Verification is mandatory and happens before any installation:

cosign verify-blob \

  --key \

  --signature skill.manifest.sig \

  skill.manifest.json



Once verified, we pin the exact SHA-256 hash of the manifest in the organization-wide allowlist.

Allowlist entry format (stored in a signed, version-controlled file):

- skillId: summarizer-v2

  manifestHash: sha256:7f8a3b9c...

  approvedBy: security-team

  approvedAt: 2026-05-18T14:22:00Z

  expiryDate: 2026-11-18



At agent startup, the gateway checks every loaded skill against this allowlist. Hash mismatch = gateway refuses to start. This single mechanism blocks post-publish updates until the security team explicitly re-reviews and re-pins the new manifest.



---



Automated Static Analysis with `clawql skill lint --strict`

Before any sandbox testing, we run strict static analysis:

clawql skill lint --strict path/to/skill/



The linter flags dangerous patterns including:

- os.system, subprocess, eval, exec, child_process (and equivalents in every supported language)  

- Outbound network calls to hostnames not declared in the manifest  

- Filesystem access outside the allowed /workspace directory  

- Environment variable reads not listed in requiredEnv  

- Credential patterns (AWS keys, GitHub tokens, JWT prefixes, etc.)  


A failed lint requires a written exception from the security team before the skill can proceed to sandbox testing. The full lint report is stored as a signed artifact alongside the manifest hash for audit purposes.



---



Dependency Confusion Attack Surface

Skills often pull dependencies from public registries. We eliminate the classic dependency confusion vector with these controls:

- All package resolution for skills routes through a controlled private registry.  

- Public npm fallback is disabled for any unscoped package name.  

- The package-lock.json (or equivalent) must be committed and its integrity hash verified as part of vetting.  

- Internal package name prefixes are reserved in the private registry.  


This ensures that even if an attacker publishes a higher-version package with the same name on the public registry, the skill cannot pull it.



---



Sandboxed Execution Observation

Static analysis catches obvious issues, but runtime behavior is what matters. Every skill must pass observation in a real sandbox:

- Installed inside a Kata Container (Module 11) with Panguard running in observation mode (not blocking).  

- A representative workload runs for 30 minutes.  

- We capture: syscalls, network connections, filesystem writes, environment reads, and memory access patterns.  

- networkEgress: deny is enforced during observation — no exfiltration is possible even if the skill is malicious.  


Any runtime behavior not explicitly declared in the manifest triggers automatic disqualification. A clean sandbox report is required before the skill can enter the production allowlist.



---



Per-Agent Allowlists and Quarantine Mode

An organization-wide allowlist is necessary but not sufficient. We also enforce:

- Per-agent allowlists: each agent’s configuration file explicitly names the exact skills it is permitted to load.  

- newSkillsBehavior: block — agents cannot auto-install even org-approved skills.  


Newly approved skills enter quarantine mode for a 7-day trial:

- Reduced ATR claims (only the minimum needed for observation).  

- Full observation logging.  

- No memory-write capability.  


If the skill behaves cleanly for the full 7 days, it is promoted to full allowlist status. Otherwise it is automatically removed.



---



Policy: Never Auto-Install

The gateway enforces this rule at the protocol level:

clawql-api --strict-skill-allowlist



It will refuse to start if any loaded skill lacks a signed approval.

Every PR that adds or updates a skill reference triggers the full vetting pipeline in CI:

1. Cosign signature verification  

2. Strict linting  

3. Sandbox observation  

4. Security team sign-off  

5. Manifest hash pin update  

6. Merge  


Urgency is never an exception to this pipeline.



---



Key Takeaways (Memorize These!)

- Signing the manifest proves integrity, not intent — static analysis and sandbox observation supply the behavioral proof.  

- Post-publish updates are the most dangerous vector; hash pinning is the only reliable defense.  

- Dependency confusion attacks target the skill’s dependencies, not the skill itself — lockfile verification and private registry enforcement are required.  

- Quarantine mode gives a safe in-production trial without granting full capability prematurely.  


You now have a complete, repeatable process that turns third-party skills from an uncontrolled risk into a vetted, observable, and revocable capability. Skills are no longer a blind spot — they are a controlled, auditable part of your agentic platform.



## **MODULE 4**

### **Zero Trust Network Architecture: mTLS, Istio, RBAC, and Workload Identity**

“Trust the network” is the design assumption that every major breach has eventually invalidated. Zero trust replaces it with a service mesh where every workload has a cryptographic identity, every connection is mutually authenticated, and a compromised pod cannot move laterally regardless of what credentials it holds. This module builds the Istio-based architecture that makes workload identity and default-deny networking the structural foundation of the entire platform.

**Why perimeter security fails for agentic platforms**

- Traditional model: trust everything inside the network boundary  

- Agentic platforms span namespaces, agents, pipelines, and external APIs — there is no single perimeter  

- A compromised agent inside the cluster has free lateral movement without zero trust controls  

- Zero trust principle: every connection is authenticated, every access is authorized, every action is logged — regardless of network location  


**SPIFFE/SPIRE workload identity**

- Every workload gets a cryptographic identity: a SPIFFE Verifiable Identity Document (SVID)  

- SVID is an X.509 certificate with a SPIFFE URI in the SAN: spiffe://cluster.local/ns/agents/sa/summarizer  

- SPIRE issues and rotates SVIDs automatically — no manual certificate management  

- Workload identity is tied to the Kubernetes ServiceAccount and pod attestation  

- An attacker who compromises a pod gets only that pod’s identity — cannot impersonate others  


**Istio service mesh**

- Istio injects an Envoy sidecar proxy into every pod in managed namespaces  

- All traffic between pods passes through the sidecar — application code never handles TLS directly  

- mTLS is enforced at the sidecar level: both sides of every connection authenticate  

- PeerAuthentication policy set to STRICT mode: plaintext connections rejected cluster-wide  

- Istio control plane (istiod) distributes certificates from SPIRE or its own CA  


**Default-deny NetworkPolicy**

- Kubernetes NetworkPolicy is the declarative layer that restricts which pods can communicate  

- Default-deny: apply a policy that allows nothing by default to every namespace  

- Explicitly allow only required communication paths  

- NetworkPolicy is enforced by the CNI plugin (Calico, Cilium) — choose one that supports it fully  

- Istio provides a second enforcement layer above NetworkPolicy; both are required  


**RBAC scoping**

- ClusterRole vs Role: prefer namespace-scoped Role wherever possible  

- Principle: each ServiceAccount can only access the Kubernetes API resources it needs  

- Audit existing RBAC bindings: kubectl auth can-i --list --as system:serviceaccount:agents:summarizer  

- Remove wildcards (*) from all production RBAC rules  

- Automate RBAC audit in CI: fail if any ServiceAccount has cluster-admin or wildcard resource access  


**AuthorizationPolicy (Istio)**

- Istio AuthorizationPolicy applies identity-aware access control at the L7 layer  

- Restrict which services can call which endpoints on which HTTP methods  

- Example: only the gateway service can call the Panguard enforcement endpoint  

- Combine with JWT validation: Istio can verify JWTs and extract claims for policy decisions  


**Traffic observability and anomaly detection**

- Istio generates telemetry for every connection: source, destination, protocol, response code, latency  

- Feed Istio metrics to Prometheus; visualize in Grafana security dashboards (Module 19)  

- Kiali provides a live service graph — anomalous communication paths visible immediately  

- Unexpected connections (a pod connecting somewhere it never has before) are a security signal  


**Key takeaways to cover**

- Workload identity is the foundation — without it, authorization policies have nothing to authorize against  

- STRICT mTLS mode is the only acceptable production posture; PERMISSIVE is for migration only  

- NetworkPolicy and Istio AuthorizationPolicy are complementary, not redundant — NetworkPolicy operates at L3/L4, Istio at L7  

- Zero trust is an ongoing operational posture, not a one-time configuration — every new service must be added to the trust fabric  




---
