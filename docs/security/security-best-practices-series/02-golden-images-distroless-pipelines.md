---
title: "Building Golden Images: Automated Scanning, Hardening, and Distroless Pipelines"
series: "Agentic AI Security Curriculum"
course_type: "instructor-ready / self-study"
audience: "Security architects, platform engineers, and teams adopting AI agents"
estimated_minutes: 35
level: foundational
tags:
  - containers
  - hardening
  - distroless
  - golden-images
part: 2
total_parts: 20
date: "May 2026"
slug: "golden-images-distroless-pipelines"
canonical_path: "/security/best-practices/golden-images-distroless-pipelines"
prev: "supply-chain-pinning-mirror-registry"
next: "cluster-admission-control-signing-policy"
description: "Explain why minimal (e.g. distroless) images and read-only root filesystems reduce container blast radius."
---

# Building Golden Images: Automated Scanning, Hardening, and Distroless Pipelines

_Module 2 of 20 · Agentic AI Security Curriculum · May 2026_

## How to use this module

Use it as **self-paced** study or as **instructor-led** training. YAML, commands, and policy excerpts are **illustrative**; map them to your cloud, mesh, identity provider, and agent runtime—substitute your own names, namespaces, and tools while preserving the **control intent**.

**Estimated time:** ~35 minutes reading; add time for linked standards and team discussion.

## Learning objectives

By the end of this module, you should be able to:

1. Explain why minimal (e.g. distroless) images and read-only root filesystems reduce container blast radius.
2. Outline a typical build → scan → SBOM → sign → promote pipeline.
3. Relate admission-time policies to image provenance and non-root execution.

## Prerequisites

- Prior module: [Supply Chain Security: Why Pinning Versions and Running Your Own Mirror Registry Matters](01-supply-chain-pinning-mirror-registry.md)

**Suggested discussion / lab:** Pick one diagram in your environment (build, deploy, runtime) and mark where this module’s controls apply; note gaps versus the checklist in the body.

---

Once you have secured your supply chain with a private mirror registry (Module 1), the next critical layer is building **golden images** — minimal, hardened, immutable container images that form the foundation of every production agent or platform workload. This module explains how to create, scan, sign, and deploy golden distroless images with read-only root filesystems and full provenance.

### Why Golden Distroless Images Matter

Most container images are far larger than necessary and contain unnecessary tools that increase the attack surface. A compromised package manager or shell in a running pod gives attackers easy persistence and lateral movement options.

A sensible hardening philosophy is simple: make images as small as possible.
Remove everything that is not required at runtime.
Make the root filesystem read-only.
Verify every image before it ever runs.

This approach dramatically reduces the blast radius if a container is compromised.

### Core Hardening Principles

**1. Distroless Base Images**  
Use Google’s official distroless images or Chainguard distroless as the foundation. These contain only the bare runtime (e.g., glibc, ca-certificates, and your application binary) with no shell, no package manager, and no unnecessary utilities.**2. Read-Only Root Filesystem**  
Set securityContext.readOnlyRootFilesystem: true on every pod. Combined with distroless, this prevents attackers from writing new binaries, installing tools, or modifying system files even if they achieve code execution.**3. Multi-Stage Builds**  
Typical hardened pipelines use multi-stage Dockerfiles:dockerfile

# Stage 1: Builder

FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -ldflags="-s -w" -o /clawql-api ./cmd/api

# Stage 2: Golden Runtime

FROM gcr.io/distroless/static-debian12
COPY --from=builder /clawql-api /usr/local/bin/clawql-api
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/clawql-api"]

**4. Minimal Attack Surface**

No shell (sh, bash)
No package managers (apt, apk, yum)
No debug tools (curl, wget, strace)
Static binaries where possible

### Automated Scanning and Signing

Every golden image goes through a mandatory pipeline before being promoted to Harbor:**Build** → Multi-stage Dockerfile
**Scan** → Trivy (critical/high vulnerabilities blocked) + OSV-Scanner
**Generate SBOM** → Syft (stored alongside the image)
**Sign** → Cosign keyless signing via Sigstore
**Push** → Only to internal Harbor with allowlist enforcement

**Example CI Pipeline Snippet**

yaml

- name: Build Golden Image
  run: |
  docker build -t $IMAGE:$TAG .
  trivy image --exit-code 1 --severity CRITICAL,HIGH $IMAGE:$TAG
  syft packages $IMAGE:$TAG -o spdx-json > sbom.spdx.json
  cosign sign --keyless $IMAGE@${DIGEST}
  docker push $IMAGE:$TAG

### Golden image standards (checklist)

Production services should follow these rules:Base: gcr.io/distroless/static-debian12 or chainguard/static
Non-root user (UID 65532)
Read-only root filesystem enforced in Helm charts and Kyverno policies
No writable layers except explicitly mounted volumes (e.g., /tmp if absolutely required, mounted as tmpfs)
Full SBOM and Cosign signature required

The clawql-full-stack Helm chart includes these defaults under security.goldenImages.

### Kyverno Policy Enforcement

A cluster-wide Kyverno policy enforces golden image standards at admission time:yaml

apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
name: require-golden-images
spec:
validationFailureAction: Enforce
rules: - name: check-distroless-and-readonly
match:
resources:
kinds: ["Pod"]
validate:
message: "All pods in scope must use golden distroless images with read-only root filesystem"
pattern:
spec:
securityContext:
readOnlyRootFilesystem: true
containers: - image: "registry.internal.example/\*_@sha256:_"

### Key Takeaways

Golden distroless images with read-only root filesystems are one of the most effective ways to limit attacker capabilities.
Multi-stage builds, automated scanning, SBOM generation, and Cosign signing ensure every image is minimal and verifiable.
These images form the foundation for all subsequent controls (admission policies, sandboxing, and runtime protection).
Never run images with shells or package managers in production MCP workloads.

This module builds directly on Module 1 (Supply Chain) and is the prerequisite for Module 3 (Cluster Admission Control).

**Next module:** Cluster Admission Control – Enforcing Image Signing and Policy at Deploy Time.

## Further reading (vendor-neutral)

These resources are independent of any single product; use them to deepen the topic for audits, architecture reviews, or procurement discussions.

- [Google distroless](https://github.com/GoogleContainerTools/distroless)
- [Chainguard Images (overview)](https://www.chainguard.dev/chainguard-images)
- [NSA / CISA Kubernetes Hardening Guide](https://media.defense.gov/2022/Mar/23/2002965772/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220315.PDF)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [Kyverno policies](https://kyverno.io/docs/)

## Commercial training use

You may reuse this curriculum internally or in **paid consulting / training** engagements. Keep examples aligned to the customer’s actual stack; substitute your own runbooks, tool names, and compliance frameworks (SOC 2, ISO 27001, sector regulators) where cited examples use a reference architecture only.

---
