---
title: "Model Integrity: Verifying Weights Before Inference"
series: "Agentic AI Security Curriculum"
course_type: "instructor-ready / self-study"
audience: "Security architects, platform engineers, and teams adopting AI agents"
estimated_minutes: 30
level: intermediate
tags:
  - ml-security
  - supply-chain
  - model-integrity
part: 11
total_parts: 20
date: "May 2026"
slug: "model-integrity-verifying-weights"
canonical_path: "/security/best-practices/model-integrity-verifying-weights"
prev: "data-classification-pii-redaction-logs"
next: "runtime-monitoring-observability"
description: "Explain why model artifacts need integrity checks beyond container image scanning."
---
# Model Integrity: Verifying Weights Before Inference


*Module 11 of 20 · Agentic AI Security Curriculum · May 2026*
## How to use this module

Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**.

**Estimated time:** ~30 minutes reading; add time for linked standards and team discussion.

## Learning objectives

By the end of this module, you should be able to:

1. Explain why model artifacts need integrity checks beyond container image scanning.
2. Describe init-container or sidecar verification patterns for weights and manifests.
3. Align model supply chain with broader artifact signing practices.

## Prerequisites

- Prior module: [Data Classification and PII Redaction: Never Let Sensitive Data Hit Logs](10-data-classification-pii-redaction-logs.md)


**Suggested discussion / lab:** Pick one diagram in your environment (build, deploy, runtime) and mark where this module’s controls apply; note gaps versus the checklist in the body.

---

Model weights represent one of the largest and most overlooked attack surfaces in AI platforms. Traditional container scanning misses them entirely because they are large binary blobs fetched at runtime. This module explains how this pattern closes the “model-in-the-middle” attack vector with cryptographic verification before any inference begins.

### The Model Weight Gap

Container images can be verified with Cosign and Kyverno, but model weights (Ollama models, Hugging Face checkpoints, custom fine-tunes) are typically downloaded directly and bypass image scanning. A poisoned weight file can contain backdoors that activate only during inference, exfiltrate data, or alter agent behavior.Treat model weights with the same rigor as container images.

### Init-Container Verification Pattern

Every inference or agent pod that loads model weights runs a mandatory init container that performs verification before the main container starts.

**Core Verification Steps:**

SHA-256 hash validation against a signed manifest.
Cosign blob signature verification.
Manifest stored in Harbor alongside the weights.

**Example Init Container:**

yaml

initContainers:
  - name: verify-weights
    image: registry.internal.example/clawql/weight-verifier:latest
    command:
      - /bin/sh
      - -c
      - |
        cosign verify-blob \
          --key /etc/signing-keys/cosign.pub \
          --signature /weights/manifest.sig \
          /weights/manifest.json
        sha256sum -c /weights/manifest.json
    volumeMounts:
      - name: model-weights
        mountPath: /weights
      - name: signing-keys
        mountPath: /etc/signing-keys
        readOnly: true

The main inference container only starts if the init container succeeds.

### Harbor Manifest Storage

Signed manifests and weights are stored in Harbor:One unified trust root for images and models.
Replication and scanning policies apply uniformly.
Kyverno policies can extend verifyImages logic to model-related init containers.

### Key Takeaways

Model weights must be verified on every pod start, not just on first download.
The init-container pattern combined with Cosign + SHA-256 provides strong cryptographic assurance.
Storing manifests in Harbor unifies supply chain controls for both containers and models.
This control closes a critical gap that standard container security tools cannot address.

Model integrity ensures the AI brains running your agents are exactly the ones you authorized and have not been tampered with.

**Next module:** Runtime Monitoring and Observability – Falco, Wazuh, Prometheus, and Merkle Metrics.

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

- [NIST AI RMF (integrity / measurement)](https://www.nist.gov/itl/ai-risk-management-framework)
- [Sigstore blob signing](https://docs.sigstore.dev/cosign/signing/overview/)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

## Commercial training use

You may reuse this curriculum internally or in **paid consulting / training** engagements. Keep examples aligned to the customer’s actual stack; substitute your own runbooks, tool names, and compliance frameworks (SOC 2, ISO 27001, sector regulators) where cited examples use a reference architecture only.

---

