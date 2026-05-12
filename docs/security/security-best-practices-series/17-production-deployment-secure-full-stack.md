---
title: "Production Deployment: One-Command Secure Full Stack"
series: "Agentic AI Security Curriculum"
level: advanced
tags:
  - kubernetes
  - deployment
  - gitops
  - production
part: 17
total_parts: 20
date: "May 2026"
slug: "production-deployment-secure-full-stack"
canonical_path: "/security/best-practices/production-deployment-secure-full-stack"
prev: "workstation-local-development-security"
next: "threat-modeling-stride-agentic-ai"
description: "Assemble a repeatable secure rollout checklist for complex stacks."
---

# Production Deployment: One-Command Secure Full Stack

All previous security controls culminate in a single, repeatable, secure deployment process. This module provides an example command and checklist to deploy a fully hardened reference deployment with every defense-in-depth layer enabled.

### Security-Enabled Helm Command

Deploy the complete secure stack with one command:bash

helm upgrade --install clawql-full-stack ./charts/clawql-full-stack \
 --namespace clawql \
 --create-namespace \
 --set security.fullBundle=true \
 --set security.kata.enabled=true \
 --set security.panguard.enabled=true \
 --set security.wazuh.enabled=true \
 --set security.presidio.enabled=true \
 --set security.weightVerification.enabled=true \
 --set gpu.quota.max=4 \
 --set istio.mTLS=strict \
 --set supplyChain.allowlistOnly=true

This enables:Golden distroless images with read-only root
Kata Containers for all MCP workloads
Panguard + ATR enforcement
Full observability stack (Falco, Wazuh, Prometheus)
Presidio redaction pipeline
Model weight verification
GPU quotas and node isolation
Strict Istio mTLS and ServiceEntries

### Deployment Order

Harbor (registry)
Vault (dynamic secrets)
Istio (ambient profile)
Falco + Talon + Wazuh
Panguard
clawql-full-stack umbrella chart

The Kubernetes Operator handles reconciliation and self-healing of security components.

### Post-Deploy Verification Checklist

Confirm all pods use Kata runtime where required
Verify Cosign signatures on running images
Test Panguard blocking with a deliberate out-of-scope tool call
Validate model weight verification on a sample inference pod
Check Merkle root metrics in Prometheus
Confirm no external egress except approved ServiceEntries
Run a full end-to-end MCP tool call and review redacted logs

### Key Takeaways

A secure reference deployment is achieved through a single, opinionated Helm command with explicit security flags.
Defense-in-depth is enabled by default — not as optional add-ons.
Follow the documented deployment order and post-deploy checklist to avoid misconfiguration.
Treat the full secure stack as the baseline; partial deployments are only for non-production testing.

This completes the operational deployment foundation of the series.

**Next module:** Threat Modeling with STRIDE for Agentic AI Systems.

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

- [Helm best practices](https://helm.sh/docs/chart_best_practices/)
- [Kubernetes production checklist (SIG)](https://github.com/kubernetes/sig-security/tree/main/sig-security-external-audit)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
