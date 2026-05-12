> **Curriculum / website:** The same material is split into twenty **modules** (vendor-neutral framing, **`level` / `tags`** for CMS search, **Further reading** links, `prev` / `next` slugs) under [`security-best-practices-series/`](security-best-practices-series/). See [`security-best-practices-series/README.md`](security-best-practices-series/README.md) for scope and the module index.

# **Supply Chain Security: Why Pinning Versions and Running Your Own Mirror Registry Matters\*\***Part 1 of the ClawQL Security Best Practices Series\***\*May 2026**

The software supply chain is the single largest and most dangerous attack surface in any production-grade agentic AI and MCP platform. A single compromised dependency, container image, or model weight can give an attacker persistent access to your cluster, your documents, your Memory 2.0 knowledge graph, and your users’ sensitive data.This guide explains why relying on public registries is unacceptable for ClawQL deployments and shows exactly how to build a secure, mirrored, and verifiable supply chain using Harbor, Cosign, Trivy, Syft, and strict pinning.### The Supply Chain Threat Landscape

Supply-chain attacks have become sophisticated and frequent:Dependency confusion attacks, where attackers publish malicious packages with the same name as your internal ones.
Typosquatting and name collisions with popular packages.
Compromised official base images on Docker Hub or GitHub Container Registry.
Model weight poisoning through malicious Ollama or Hugging Face models containing hidden triggers.
Living-off-the-land persistence once inside a container.

In an MCP-based agentic system like ClawQL, the impact is amplified. A compromised tool can execute arbitrary code in the sandbox, access the full document pipeline (Tika → Presidio → Paperless), or exfiltrate data through the intelligent gateway.**Core conclusion**: You cannot outsource trust to the public internet. You must control every artifact from source to running pod.### Harbor as the Single Trust Root

ClawQL designates Harbor as the single source of truth for all artifacts: container images, Helm charts, model weight manifests, SBOMs, and Cosign signatures.Harbor provides a private registry with replication, pull-through caching, built-in vulnerability scanning, and native support for SBOM storage. All ClawQL components are configured to pull exclusively from your internal Harbor instance.**Key Harbor configuration principles**:Allowlist-only resolution enabled.
Replication rules to mirror only approved upstream artifacts.
All images and manifests must be signed before being accepted.

### Allowlist-Only Resolution and Version Pinning

This is the foundational control.Never do this in production:Pulling directly from Docker Hub, npm, PyPI, or GitHub.
Using floating tags such as :latest or :main.
Allowing version ranges like ^1.2.0.

Always do this:Use exact digest pinning (e.g., nginx@sha256:abc123…).
Or use a pinned version combined with mandatory Cosign signature verification.

The clawql-full-stack umbrella chart and Kubernetes Operator enforce these rules through configuration flags such as:yaml

security:
supplyChain:
registryMirror: "harbor.clawql.internal"
allowlistOnly: true
requireDigest: true
requireCosign: true

### Scanning, SBOM Generation, and Signing

Every artifact that enters Harbor must be scanned and accompanied by a Software Bill of Materials (SBOM).**Tools used in the ClawQL pipeline**:Trivy: OS and language vulnerability scanning.
OSV-Scanner: Ecosystem-specific vulnerability checks.
Syft: SBOM generation (SPDX and CycloneDX formats).
Cosign: Keyless signing via Sigstore (no long-lived keys to manage or steal).

**Typical CI pipeline step**:yaml

trivy image --exit-code 1 --severity CRITICAL,HIGH $IMAGE:latest
syft packages $IMAGE:latest -o spdx-json > sbom.spdx.json
cosign sign --keyless $IMAGE@${DIGEST}

All SBOMs are stored alongside their images in Harbor for long-term forensic and compliance needs.### Credential Leak Prevention

Even the best registry is useless if secrets enter the repository.ClawQL uses a two-layer defense:Gitleaks as a mandatory pre-commit hook plus CI gate.
TruffleHog for full historical repository scans on every push or pull request.

These tools block AWS keys, Vault tokens, database credentials, and other secrets before they ever reach the main branch.### Practical ClawQL Implementation Summary

Mirror only approved upstream artifacts into Harbor on a nightly schedule.
Enforce allowlist-only resolution and digest pinning everywhere in Helm charts and the Operator.
Require Cosign keyless signing on all images and manifests.
Scan every build with Trivy + OSV-Scanner and block merges on critical findings.
Store SBOMs with every release for full traceability months later.

These controls are already built into the official ClawQL Helm charts and Kubernetes Operator.### Key Takeaways

Public registries represent an unacceptable risk for production agentic platforms.
A private mirror registry (Harbor) with allowlist-only resolution is the foundation of all other security layers.
Strict pinning, SBOMs, and Cosign signing turn every artifact into a verifiable, tamper-evident unit.
Credential scanning prevents the most common initial compromise vector.

This supply chain foundation is the prerequisite for every subsequent guide in the series.**Next in the series**: Building Golden Images – Automated Scanning, Hardening, and Distroless Pipelines.

---

_ClawQL Security Best Practices Series • Part 1 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Building Golden Images: Automated Scanning, Hardening, and Distroless Pipelines\*\***Part 2 of the ClawQL Security Best Practices Series\***\*May 2026**

Once you have secured your supply chain with a private mirror registry (Guide 1), the next critical layer is building **golden images** — minimal, hardened, immutable container images that form the foundation of every ClawQL workload. This guide explains how to create, scan, sign, and deploy golden distroless images with read-only root filesystems and full provenance.### Why Golden Distroless Images Matter

Most container images are far larger than necessary and contain unnecessary tools that increase the attack surface. A compromised package manager or shell in a running pod gives attackers easy persistence and lateral movement options.ClawQL’s philosophy is simple:Make images as small as possible.
Remove everything that is not required at runtime.
Make the root filesystem read-only.
Verify every image before it ever runs.

This approach dramatically reduces the blast radius if a container is compromised.### Core Hardening Principles

**1. Distroless Base Images**  
Use Google’s official distroless images or Chainguard distroless as the foundation. These contain only the bare runtime (e.g., glibc, ca-certificates, and your application binary) with no shell, no package manager, and no unnecessary utilities.**2. Read-Only Root Filesystem**  
Set securityContext.readOnlyRootFilesystem: true on every pod. Combined with distroless, this prevents attackers from writing new binaries, installing tools, or modifying system files even if they achieve code execution.**3. Multi-Stage Builds**  
All ClawQL golden images use multi-stage Dockerfiles:dockerfile

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

**4. Minimal Attack Surface**No shell (sh, bash)
No package managers (apt, apk, yum)
No debug tools (curl, wget, strace)
Static binaries where possible

### Automated Scanning and Signing

Every golden image goes through a mandatory pipeline before being promoted to Harbor:**Build** → Multi-stage Dockerfile
**Scan** → Trivy (critical/high vulnerabilities blocked) + OSV-Scanner
**Generate SBOM** → Syft (stored alongside the image)
**Sign** → Cosign keyless signing via Sigstore
**Push** → Only to internal Harbor with allowlist enforcement

**Example CI Pipeline Snippet**yaml

- name: Build Golden Image
  run: |
  docker build -t $IMAGE:$TAG .
  trivy image --exit-code 1 --severity CRITICAL,HIGH $IMAGE:$TAG
  syft packages $IMAGE:$TAG -o spdx-json > sbom.spdx.json
  cosign sign --keyless $IMAGE@${DIGEST}
  docker push $IMAGE:$TAG

### ClawQL Golden Image Standards

All official ClawQL components follow these rules:Base: gcr.io/distroless/static-debian12 or chainguard/static
Non-root user (UID 65532)
Read-only root filesystem enforced in Helm charts and Kyverno policies
No writable layers except explicitly mounted volumes (e.g., /tmp if absolutely required, mounted as tmpfs)
Full SBOM and Cosign signature required

The clawql-full-stack Helm chart includes these defaults under security.goldenImages.### Kyverno Policy Enforcement

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
message: "All ClawQL pods must use golden distroless images with read-only root filesystem"
pattern:
spec:
securityContext:
readOnlyRootFilesystem: true
containers: - image: "harbor.clawql.internal/\*_@sha256:_"

### Key Takeaways

Golden distroless images with read-only root filesystems are one of the most effective ways to limit attacker capabilities.
Multi-stage builds, automated scanning, SBOM generation, and Cosign signing ensure every image is minimal and verifiable.
These images form the foundation for all subsequent controls (admission policies, sandboxing, and runtime protection).
Never run images with shells or package managers in production MCP workloads.

This guide builds directly on Guide 1 (Supply Chain) and is the prerequisite for Guide 3 (Cluster Admission Control).**Next in the series**: Cluster Admission Control – Enforcing Image Signing and Policy at Deploy Time.

---

_ClawQL Security Best Practices Series • Part 2 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Cluster Admission Control: Enforcing Image Signing and Policy at Deploy Time\*\***Part 3 of the ClawQL Security Best Practices Series\***\*May 2026**

With a secure supply chain and golden distroless images in place (Guides 1 and 2), the next layer is preventing non-compliant workloads from ever starting. Cluster admission controllers act as the final gatekeeper, rejecting unsigned, unverified, or insecure images before they are scheduled.This guide focuses on Kyverno as the admission controller and shows how ClawQL enforces image signing, golden image standards, and runtime policies at deploy time.### Why Admission Control Is Essential

Even with strong supply chain practices, misconfigurations or human error can still introduce risky workloads. Admission webhooks provide a last-line defense by inspecting pod specs in real time and rejecting them if they violate policy.In ClawQL, this ensures:Only images from your private Harbor registry are allowed.
Every image must be Cosign-signed and digest-pinned.
Model weight verification and golden image rules are enforced.
No pod can run with excessive privileges or writable root filesystems.

### Kyverno verifyImages Admission Policies

Kyverno is the primary admission controller in ClawQL. It supports cryptographic verification of container images and model artifacts.**Core Policy: Require Signed Images**yaml

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
imageVerify: - imageReferences: ["harbor.clawql.internal/**"]
verify: - type: "cosign"
keyless:
issuer: "https://token.actions.githubusercontent.com"
subject: "https://github.com/clawql/*"

This policy rejects any pod using unsigned images or images from external registries.### Extending Verification to Model Weights

Model weights are a common blind spot. ClawQL extends admission control to verify them via init containers:yaml

# Example init container pattern enforced by policy

initContainers:

- name: verify-weights
  image: harbor.clawql.internal/clawql/weight-verifier:latest
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

A dedicated Kyverno policy ensures every inference pod includes this verification step.### Cluster-Wide vs Namespace Exemptions

ClawQL applies a **cluster-wide default-deny** posture with limited exemptions:openclaw and clawql namespaces: strict enforcement.
Temporary exemption namespaces (e.g., for debugging) require explicit approval and short TTL.
All exemptions are logged and reviewed quarterly.

### Integration with Golden Images and Supply Chain

The admission policies work together with Guides 1 and 2:Only images built through the golden pipeline (distroless + read-only root) are allowed.
Digest pinning and SBOM presence are validated.
Non-compliant pods are rejected before scheduling, preventing drift.

**Helm Chart Defaults**The clawql-full-stack chart enables these policies automatically when security.fullBundle: true.### Key Takeaways

Admission controllers like Kyverno provide the final enforceable gate before any workload runs.
Cryptographic verification (Cosign) combined with allowlist policies eliminates unsigned or tampered images.
Extending policies to model weights closes a critical gap missed by traditional container scanning.
Cluster-wide enforcement with minimal exemptions maintains a strong, auditable security posture.

This guide completes the build-time and deploy-time foundations. All later runtime protections (sandboxing, zero trust, MCP proxying) build on top of these admission guarantees.**Next in the series**: Principle of Least Privilege – Scoped Identities and Limiting Blast Radius.

---

_ClawQL Security Best Practices Series • Part 3 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Principle of Least Privilege: Scoped Identities and Limiting Blast Radius\*\***Part 4 of the ClawQL Security Best Practices Series\***\*May 2026**

Even with perfect supply chain security and admission control, a compromised workload or agent can still cause significant damage if it has excessive permissions. The Principle of Least Privilege (PoLP) ensures every identity — human, service, or agent — can do only what is strictly necessary, and nothing more.This guide shows how ClawQL implements least privilege across Kubernetes, MCP tools, and agent sessions to minimize blast radius.### Least Privilege in Theory and Practice

Least privilege means granting the minimum permissions required for a task and only for the duration needed. In agentic systems this is critical because agents can chain tools in unexpected ways.ClawQL applies PoLP at multiple layers:Kubernetes workloads
Human operators
Agent/MCP tool calls
Session-scoped claims

### Per-Workload Identities with Kubernetes RBAC and ServiceAccounts

Every ClawQL component runs with its own dedicated ServiceAccount and tightly scoped Role/RoleBinding.**Example for the API gateway:**yaml

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

No ClawQL pod ever runs with cluster-admin or overly broad permissions. The Operator manages these bindings declaratively.### YubiKey Requirement for High-Impact Changes

Any change to the clawql-full-stack Helm chart or critical CRDs requires hardware-backed Git signing with a YubiKey.This ensures that even if a developer workstation is compromised, an attacker cannot push malicious chart changes without physical hardware access. All production Helm upgrades are signed and verified.### Explicit MCP Tool Scoping and ATR Claims

The most powerful least-privilege control in ClawQL is **ATR (Agent Task Request)** scoping at the MCP layer.Every tool call is validated against the user’s session claims. Agents can only invoke tools explicitly allowed for their role and vertical.**Example ATR-bound tool registration:**Mortgage underwriters can call lending-specific tools but not blockchain or healthcare tools.
Sandbox execution is restricted to approved Kata-isolated namespaces.
Cross-vertical memory recall requires elevated memory.cross_vertical: true claim.

Panguard AI and the intelligent MCP gateway enforce these scopes synchronously on every clawql_execute call.### Limiting Blast Radius

Combining these controls means that:A compromised pod cannot reach most cluster resources.
A compromised agent cannot call dangerous tools.
A compromised developer cannot deploy malicious changes without hardware keys.
Even full container escape is contained by Kata sandboxing (covered in Guide 8).

### Key Takeaways

Least privilege turns potential catastrophic breaches into limited incidents.
Dedicated ServiceAccounts, narrow RBAC roles, and hardware-backed changes form the foundation.
ATR scoping at the MCP gateway provides fine-grained, per-task control that traditional RBAC cannot achieve alone.
Every identity and every tool must be explicitly authorized — implicit access is forbidden.

Strong least privilege is the bedrock of zero trust, which is covered next.**Next in the series**: Zero Trust Fundamentals – Assume Compromise and Verify Everything.

---

_ClawQL Security Best Practices Series • Part 4 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Zero Trust Fundamentals: Assume Compromise and Verify Everything\*\***Part 5 of the ClawQL Security Best Practices Series\***\*May 2026**

With supply chain security, golden images, admission control, and least privilege in place, ClawQL shifts to a full Zero Trust posture. This guide introduces the core philosophy that underpins the entire architecture: never trust, always verify, and assume breach at all times.### Zero Trust Defined for Agentic Systems

Traditional perimeter security (firewalls, VPNs, “inside the cluster is safe”) fails in agentic MCP environments. Agents can call tools, process documents, and interact with external systems in unpredictable ways. Once any component is compromised, lateral movement can be rapid.ClawQL’s Zero Trust model treats every request, every pod, every agent session, and every tool call as potentially malicious until proven otherwise.### The Three Governing Principles

ClawQL security is built on these explicit principles from the Defense-in-Depth guide:**Secure the capabilities, not the language**  
Prompt injection and clever jailbreaks are inevitable. Instead of trying to filter natural language, ClawQL restricts what an agent can actually _do_ through ATR-scoped MCP tools and Panguard enforcement.
**Every trust assumption is explicit and verified**  
No implicit trust in containers, model weights, sessions, secrets, or logs. Everything carries cryptographic provenance (Cosign signatures, Merkle roots, JWT ATR claims).
**Containment over prevention**  
Assume breach will happen. Design so that when it does, damage is limited, forensic evidence is preserved (WORM + Merkle), and recovery is fast.

### Core Zero Trust Controls in ClawQL

**Continuous verification**: Every MCP tool call validates JWT ATR claims, every image is verified at admission, every model weight is checked before inference.
**Least privilege by default**: Covered in Guide 4 — narrow RBAC, scoped ServiceAccounts, and per-task tool authorization.
**Micro-segmentation**: Istio mTLS + AuthorizationPolicy (Guide 7) ensures pods can only talk to explicitly allowed services.
**Default-deny posture**: NetworkPolicy, egress allowlists, and Kyverno policies reject anything not explicitly permitted.
**Assume breach mindset**: Kata Containers for MCP workloads, automated quarantine with Talon, tamper-evident WORM logs.

### Shift from Prevention to Containment

Traditional security focuses heavily on blocking attacks. ClawQL invests equally in containment and recovery:If a pod is compromised → Kata isolation + Talon auto-quarantine.
If an agent goes rogue → Panguard blocks the tool call and logs the full session.
If logs are tampered → Merkle roots and WORM storage make it detectable.

This mindset changes how you design, deploy, and operate the platform.### Key Takeaways

Zero Trust is not a tool — it is an operating philosophy: assume compromise and verify everything, every time.
In agentic systems, securing _capabilities_ through ATR scoping and MCP proxy enforcement is far more effective than trying to secure natural language.
Every layer (supply chain, admission, identity, network, runtime) must independently verify and contain.
Prevention alone is insufficient; strong containment and forensic readiness are mandatory.

This fundamentals guide sets the stage for the advanced Zero Trust controls in the next guide.**Next in the series**: Advanced Zero Trust – Multi-Sig Vault, HSM, Tamper-Proof Logging, and Cryptographic Provenance.

---

_ClawQL Security Best Practices Series • Part 5 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Advanced Zero Trust: Multi-Sig Vault, HSM, Tamper-Proof Logging, and Cryptographic Provenance\*\***Part 6 of the ClawQL Security Best Practices Series\***\*May 2026**

Building on Zero Trust fundamentals (Guide 5), this guide covers the advanced cryptographic and secret-management controls that make trust assumptions explicit and verifiable across the entire platform.### Dynamic Secrets with Short TTL

ClawQL uses HashiCorp Vault for all secrets (database credentials, API keys, mTLS certificates, etc.).Key practices:Secrets are issued dynamically per workload with short TTLs (minutes to hours).
Automatic revocation on pod termination.
No long-lived static secrets anywhere in the cluster.

Vault Agent sidecars handle token renewal and secret injection. The Operator monitors lease counts and alerts on orphaned credentials.### JWT ATR Session Tokens

Every agent session receives a short-lived JWT containing ATR (Agent Task Request) claims. These claims define exactly what tools, verticals, and data the agent may access.Panguard and the intelligent MCP gateway validate the JWT signature and claims on every clawql_execute call. Agents cannot escalate their own privileges or forge claims.### Merkle Trees and Cryptographic Provenance

Every critical artifact carries tamper-evident provenance:Documents after Presidio redaction
Memory 2.0 graph entities and edges
Workflow definitions
Proxy dispatches and tool call results

A Merkle root is computed and recorded for each operation. Roots are stored in WORM volumes and a Git-backed, Cosign-signed repository. Any silent modification is immediately detectable on read.### WORM Storage and Tamper-Proof Logging

All security-relevant logs (prompts, tool calls, decisions) are written to WORM (Write Once, Read Many) storage.Presidio redaction runs in the Fluent Bit pipeline before logs reach Loki.
Merkle roots link logs to the broader audit trail.
No deletions or modifications are possible after write.

This ensures forensic integrity even if an attacker reaches the logging infrastructure.### Cosign Blob Signing for Model Weights

Model weights (the largest unverified artifact in most AI stacks) are protected with:Signed manifests stored in Harbor
Init-container verification before inference starts
SHA-256 hash checking combined with Cosign verification

This closes the “model-in-the-middle” attack vector that container image scanning cannot detect.### Key Takeaways

Dynamic secrets with short TTLs and automatic revocation eliminate standing credentials.
JWT ATR tokens enforce explicit, verifiable capabilities at the MCP layer.
Merkle trees and WORM storage provide cryptographic proof that nothing has been silently altered.
Every trust assumption — from model weights to audit logs — is made explicit and independently verifiable.

These advanced controls turn Zero Trust from a philosophy into enforceable, auditable reality across the platform.**Next in the series**: RBAC, mTLS, and Istio Service Mesh – Network-Level Zero Trust.

---

_ClawQL Security Best Practices Series • Part 6 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **RBAC, mTLS, and Istio Service Mesh: Network-Level Zero Trust\*\***Part 7 of the ClawQL Security Best Practices Series\***\*May 2026**

With identity-level least privilege and advanced cryptographic controls established (Guides 4–6), ClawQL extends Zero Trust to the network layer. This guide covers how RBAC, mutual TLS, and Istio Service Mesh work together to enforce micro-segmentation and default-deny networking across the cluster.### Istio mTLS and AuthorizationPolicy

Istio provides automatic mutual TLS between all pods in the mesh. Every pod-to-pod connection is encrypted and authenticated using short-lived certificates.**AuthorizationPolicy examples** in ClawQL:The clawql-api gateway can only call specific backend services (documents, memory, vertical plugins).
MCP sandbox pods can only reach the Kata runtime and isolated NATS JetStream topics.
Vertical plugins are blocked from direct communication with each other — all cross-vertical traffic must route through the intelligent gateway.

This eliminates east-west lateral movement even if a pod is compromised.### ServiceEntries as FQDN Lockdown

ClawQL uses Istio ServiceEntries to explicitly whitelist allowed external destinations:Only approved external APIs (GitHub, Paperless NGX, Chainlink oracles, etc.).
No arbitrary outbound traffic to the internet.
EgressGateway routes all external calls through inspected paths.

This replaces the need for a separate WAF for FQDN control and is reviewed quarterly alongside STRIDE modeling.### Default-Deny NetworkPolicy

A cluster-wide default-deny NetworkPolicy ensures no pod can talk to any other pod or external endpoint unless an explicit allow rule exists.Combined with Istio, this creates layered defense: NetworkPolicy at the Kubernetes level and AuthorizationPolicy + mTLS at the service mesh level.### Traffic Baselining and Anomaly Detection with Kiali

Kiali visualizes the service mesh topology while Prometheus alerts on unexpected connection patterns. The security team maintains a baseline of normal east-west traffic. Any new or anomalous flow triggers investigation.### Helm Chart Integration

These controls are enabled by default when deploying with:yaml

security:
fullBundle: true
istio:
enabled: true
mTLS: strict
egressAllowlist: true

### Key Takeaways

Network-level Zero Trust requires encryption (mTLS), authentication, and explicit authorization for every connection.
Default-deny policies combined with ServiceEntries provide strong egress and east-west control.
Micro-segmentation limits blast radius: a compromised component can only reach what it is explicitly allowed to reach.
Continuous baselining with Kiali turns the mesh into an active security sensor.

This network foundation enables safe sandboxing and runtime protection in the following guides.**Next in the series**: Sandboxing Options and Trade-offs – Kata, gVisor, Seatbelt, Docker, and Cloudflare Workers.

---

_ClawQL Security Best Practices Series • Part 7 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Sandboxing Options and Trade-offs: Kata, gVisor, Seatbelt, Docker, and Cloudflare Workers\*\***Part 8 of the ClawQL Security Best Practices Series\***\*May 2026**

With network-level Zero Trust established (Guide 7), the next critical layer is runtime isolation for the highest-risk workloads — especially MCP tool execution and agent code running. This guide compares sandboxing technologies and explains why ClawQL defaults to Kata Containers for MCP workloads.### Why Strong Sandboxing Is Non-Negotiable

Agentic systems routinely execute untrusted or dynamically generated code. Container namespaces alone are insufficient when an agent has access to tools like sandbox_exec, document processing, or external API calls. A breakout must be extremely difficult and contained.### Isolation Technologies Compared

| Technology         | Isolation Type            | Performance Overhead | Attack Surface Reduction  | ClawQL Usage                   |
| ------------------ | ------------------------- | -------------------- | ------------------------- | ------------------------------ |
| Docker (default)   | Namespace + cgroups       | Low                  | Low                       | Never in production            |
| gVisor             | Userspace kernel          | Medium               | High                      | Acceptable for non-MCP         |
| Seatbelt           | macOS sandbox profiles    | Low                  | Medium                    | Local dev only                 |
| Kata Containers    | Lightweight VM (hardware) | Medium-High          | Very High                 | Default for all MCP workloads  |
| Cloudflare Workers | V8 isolates / edge        | Very Low             | High (for edge functions) | Optional for lightweight tools |

### Kata Containers – ClawQL’s Default for MCP

Kata provides a full hardware VM boundary per pod using lightweight VMs (QEMU/KVM or Firecracker).**Key Advantages:**Kernel-level isolation: even if the container is fully compromised, the attacker cannot escape the VM.
Strongest protection for MCP tool execution and sandboxed code.
Enforced via Kyverno RuntimeClass policy and Helm defaults.

**Kyverno Enforcement Example:**yaml

apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
name: enforce-kata-for-mcp
spec:
validationFailureAction: Enforce
rules: - name: require-kata
match:
resources:
kinds: ["Pod"]
namespaces: ["openclaw", "clawql"]
validate:
message: "MCP and sandbox workloads must use Kata runtime"
pattern:
spec:
runtimeClassName: "kata"

### When to Use Lighter Options

**gVisor**: Acceptable for general non-execution workloads where Kata overhead is undesirable. Provides syscall interception without a full VM.
**Seatbelt / macOS Sandbox**: Used only for local developer workstations.
**Cloudflare Workers**: Suitable for lightweight, stateless edge functions that do not need full cluster access.
**Plain Docker**: Strictly forbidden for any production MCP or agent execution path.

The Operator and Helm chart automatically apply the correct RuntimeClass based on workload type when security.kata.enabled: true.### Key Takeaways

Kata Containers deliver the strongest isolation for agentic MCP workloads by using hardware VM boundaries.
Weaker options like gVisor or standard Docker are insufficient when agents can execute arbitrary code.
RuntimeClass enforcement via Kyverno ensures the correct sandbox is always used.
Choose isolation strength based on workload risk — never default to convenience over security.

Strong sandboxing completes the foundational runtime protection. The next guides focus on protecting the MCP interface itself.**Next in the series**: MCP Runtime Protection – Panguard, ATR Rules, and Agentic Threat Mitigation.

---

_ClawQL Security Best Practices Series • Part 8 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **MCP Runtime Protection: Panguard, ATR Rules, and Agentic Threat Mitigation\*\***Part 9 of the ClawQL Security Best Practices Series\***\*May 2026**

The MCP interface is the highest-risk attack surface in any agentic platform. Agents interact with tools, memory, documents, and external systems through natural language, making traditional prompt-based defenses insufficient. This guide details how ClawQL protects the MCP runtime using Panguard, ATR scoping, and layered governance.### Panguard AI as the Synchronous Chokepoint

Panguard sits directly in front of the intelligent MCP gateway (clawql-api) and acts as the primary real-time intercept layer.**Key Capabilities:**Sub-50ms latency per tool call
Real-time ATR (Agent Task Request) rule evaluation
Blocking of malicious or out-of-scope requests
Coverage of OWASP Agentic Top 10 risks
Full session auditing

All clawql_execute calls, native vertical tools, and proxy plugin dispatches flow through Panguard before any downstream execution.### ATR Rules and Explicit Tool Scoping

Instead of relying on fragile prompt filtering, ClawQL uses structured ATR claims attached to JWT session tokens:Each tool call is validated against the user’s role, vertical permissions, and current task scope.
Agents cannot self-escalate privileges.
Cross-vertical actions (e.g., lending fraud patterns applied to insurance) require explicit elevated claims.
Sandbox execution and dangerous operations are tightly gated.

Panguard rejects any call that violates these rules and returns a clear error to the agent.### Microsoft Agent Governance Toolkit as Deterministic Overlay

Panguard is complemented by the Microsoft Agent Governance Toolkit running as a sidecar. While Panguard provides fast, AI-augmented protection, the Toolkit adds deterministic, rule-based governance with different failure modes. Together they create defense-in-depth at the MCP layer.### Prompt and Response Logging with Redaction

Every MCP interaction is logged with:Full context (redacted via Presidio in the Fluent Bit pipeline)
Tool parameters and results
Decision metadata (why a call was allowed or blocked)

Logs are written to WORM storage with Merkle roots for tamper evidence.### Key Takeaways

The MCP interface must be treated as the primary attack surface and protected with synchronous, low-latency interception.
ATR-based capability scoping is far more effective than prompt injection defenses.
Layered protection (Panguard + Microsoft Toolkit) provides resilience through diverse failure modes.
Comprehensive auditing and redaction ensure forensic readiness without exposing sensitive data.

Strong MCP runtime protection builds directly on the sandboxing and network controls from previous guides and enables safe agentic operation at scale.**Next in the series**: Data Classification and PII Redaction – Never Let Sensitive Data Hit Logs.

---

_ClawQL Security Best Practices Series • Part 9 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Data Classification and PII Redaction: Never Let Sensitive Data Hit Logs\*\***Part 10 of the ClawQL Security Best Practices Series\***\*May 2026**

Even with strong runtime protection and sandboxing (Guides 8–9), sensitive data inevitably flows through agent sessions, documents, and tool calls. This guide explains how ClawQL prevents PII, financial data, and other sensitive information from ever reaching persistent log stores.### Classification vs Redaction

Data classification and redaction are distinct but complementary controls:**Classification** tells you _what_ data is sensitive and how it should be handled.
**Redaction** ensures sensitive data is removed or masked _before_ it is written to any queryable or long-term storage.

Both are required. Classification without redaction leaves raw PII in logs. Redaction without classification leaves you unable to reason about your data holdings.ClawQL maintains a formal data classification policy with tiers (Public, Internal, Confidential, Restricted) that maps to redaction rules.### Presidio in the Fluent Bit Pipeline

ClawQL runs Microsoft Presidio as a pipeline stage in Fluent Bit — not as per-pod sidecars.**Why pipeline-level redaction?**One consistent redaction engine for all log sources.
Fewer failure modes and surfaces to maintain.
Redaction happens before logs reach Loki.

Presidio identifies and redacts PII (names, SSNs, credit cards, medical records, etc.) and financial data in real time as logs are collected.### Redaction-Before-Write for WORM Compliance

All security-relevant logs are written to WORM storage. Because redaction occurs before write:No raw sensitive data ever lands in persistent stores.
WORM compliance is maintained without needing record deletion (which defeats WORM).
Forensic value is preserved — enough context remains for investigation while PII is removed.

### Forensic-Friendly Logging Design

Redaction rules are tuned to balance privacy and usability:Entity replacement with tokens (e.g., [REDACTED_SSN]) rather than full removal.
Context around redacted fields is retained where possible.
Full unredacted logs (if ever needed for incident response) are available only through strict break-glass procedures with multi-party approval.

### Key Takeaways

Redaction must happen before data reaches any persistent log store — never after.
Pipeline-level Presidio integration provides consistent, maintainable coverage across the entire platform.
Classification policy + redaction-before-write satisfies both privacy regulations and forensic requirements.
This approach ensures sensitive data never becomes a liability in logs, even during full incident investigations.

Proper data handling completes the protection of information in motion and at rest, enabling safe monitoring and response in the following guides.**Next in the series**: Model Integrity – Verifying Weights Before Inference.

---

_ClawQL Security Best Practices Series • Part 10 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Model Integrity: Verifying Weights Before Inference\*\***Part 11 of the ClawQL Security Best Practices Series\***\*May 2026**

Model weights represent one of the largest and most overlooked attack surfaces in AI platforms. Traditional container scanning misses them entirely because they are large binary blobs fetched at runtime. This guide explains how ClawQL closes the “model-in-the-middle” attack vector with cryptographic verification before any inference begins.### The Model Weight Gap

Container images can be verified with Cosign and Kyverno, but model weights (Ollama models, Hugging Face checkpoints, custom fine-tunes) are typically downloaded directly and bypass image scanning. A poisoned weight file can contain backdoors that activate only during inference, exfiltrate data, or alter agent behavior.ClawQL treats model weights with the same rigor as container images.### Init-Container Verification Pattern

Every inference or agent pod that loads model weights runs a mandatory init container that performs verification before the main container starts.**Core Verification Steps:**SHA-256 hash validation against a signed manifest.
Cosign blob signature verification.
Manifest stored in Harbor alongside the weights.

**Example Init Container:**yaml

initContainers:

- name: verify-weights
  image: harbor.clawql.internal/clawql/weight-verifier:latest
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

The main inference container only starts if the init container succeeds.### Harbor Manifest Storage

Signed manifests and weights are stored in Harbor:One unified trust root for images and models.
Replication and scanning policies apply uniformly.
Kyverno policies can extend verifyImages logic to model-related init containers.

### Key Takeaways

Model weights must be verified on every pod start, not just on first download.
The init-container pattern combined with Cosign + SHA-256 provides strong cryptographic assurance.
Storing manifests in Harbor unifies supply chain controls for both containers and models.
This control closes a critical gap that standard container security tools cannot address.

Model integrity ensures the AI brains running your agents are exactly the ones you authorized and have not been tampered with.**Next in the series**: Runtime Monitoring and Observability – Falco, Wazuh, Prometheus, and Merkle Metrics.

---

_ClawQL Security Best Practices Series • Part 11 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Runtime Monitoring and Observability: Falco, Wazuh, Prometheus, and Merkle Metrics\*\***Part 12 of the ClawQL Security Best Practices Series\***\*May 2026**

Strong prevention and containment are incomplete without comprehensive visibility. This guide covers ClawQL’s runtime monitoring stack, which provides deep observability into system behavior, detects anomalies, and correlates events across layers.### The Observability Stack

ClawQL deploys a full open-source observability suite:**Falco** (eBPF) — syscall-level monitoring and Kubernetes audit log integration. Detects suspicious activity such as unexpected shells, file modifications, or network connections inside containers.
**Wazuh** — OSS SIEM for log correlation, rule-based alerting, vulnerability detection, and compliance reporting.
**Prometheus** — metrics collection with custom exporters for Merkle root verification and Cuckoo filter health.
**Loki** — log aggregation (receives only redacted logs from the Presidio pipeline).
**Tempo** — distributed tracing for request flows through the intelligent MCP gateway.
**Kiali** — Istio service mesh topology and traffic visualization.

### Alert Tuning and Ownership

Wazuh and Falco generate high volumes of events by default. ClawQL requires:Named owner responsible for alert tuning.
Tiered response (low-confidence → alert only; high-confidence → auto-quarantine via Talon).
Regular tuning sessions to reduce noise while preserving signal.

### Node Pinning Strategy

Observability workloads are pinned to dedicated non-GPU nodes using node selectors and taints. This prevents monitoring overhead from affecting inference latency or consuming GPU VRAM needed for agents.### Merkle and Cuckoo Metrics

Custom Prometheus metrics expose:Merkle root verification success/failure rates.
Cuckoo filter false-positive rates (critical for security paths).
Audit trail completeness.

These metrics ensure cryptographic integrity is actively monitored, not assumed.### Key Takeaways

Runtime monitoring turns the platform into a sensor that detects compromise early.
Layered tools (Falco for low-level, Wazuh for correlation, Prometheus for metrics) provide comprehensive coverage with different strengths.
Alert tuning and node pinning are operational requirements, not optional.
Merkle and Cuckoo metrics bring cryptographic controls into day-to-day observability.

Effective monitoring enables the automated response and containment covered in the next guide.**Next in the series**: Automated Response and Containment – Falco + Talon Quarantine, Panguard Blocking.

---

_ClawQL Security Best Practices Series • Part 12 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Automated Response and Containment: Falco + Talon Quarantine, Panguard Blocking\*\***Part 13 of the ClawQL Security Best Practices Series\***\*May 2026**

Detection without automated response leaves security teams overwhelmed. This guide covers ClawQL’s high-confidence automated containment mechanisms that limit damage while keeping humans in the loop.### Confidence Tier Mapping

Not every alert warrants automatic action. ClawQL uses a tiered system:**Low confidence** — Log only, no notification.
**Medium confidence** — Alert on-call via Slack/page.
**High confidence** — Immediate automated containment + page.

Rules are tuned and reviewed regularly by the designated alert owner.### Falco + Talon Quarantine Flow

Falco detects suspicious events (unexpected shell in a pod, privilege escalation, anomalous outbound connection). On high-confidence matches, Talon automatically:Removes the pod from Service endpoints.
Applies a restrictive NetworkPolicy isolating the pod.
Preserves the pod for forensic analysis instead of terminating it.
Triggers a Wazuh alert with full context.

The pod remains running in quarantine until human review and manual release.### Panguard Blocking

Panguard provides synchronous blocking at the MCP layer:Rejects out-of-scope or malicious tool calls in <50ms.
Returns a clear error to the agent so it can gracefully handle the block rather than hallucinate or retry.
Logs the full session for audit.

Agents are coded to surface blocks to the user instead of silently failing.### Human-in-the-Loop Design

Automation augments, never replaces, human oversight:All automated actions are reversible.
Quarantined pods are easily inspected.
Break-glass procedures exist for urgent manual intervention.

### Key Takeaways

Automated containment turns fast detection into fast response, limiting blast radius.
Tiered confidence prevents alert fatigue while enabling immediate action on serious threats.
Falco + Talon provides pod-level isolation; Panguard provides MCP-level blocking.
Preservation for forensics is prioritized over immediate termination.

This automated response layer works hand-in-hand with monitoring (Guide 12) and feeds directly into incident response processes.**Next in the series**: Incident Response and Recovery – PICERL, WORM Audits, and Tested Backups.

---

_ClawQL Security Best Practices Series • Part 13 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Incident Response and Recovery: PICERL, WORM Audits, and Tested Backups\*\***Part 14 of the ClawQL Security Best Practices Series\***\*May 2026**

Even with layered prevention, containment, and monitoring, incidents will eventually occur. This guide details ClawQL’s structured incident response process, tamper-evident audit capabilities, and the requirement for regularly tested recovery paths.### PICERL Runbooks

ClawQL follows the PICERL framework (Prepare, Identify, Contain, Eradicate, Recover, Lessons Learned). Dedicated runbooks cover common scenarios:Vault lease expiry and emergency revocation
Panguard outage fallback (graceful degradation of MCP traffic)
Talon-quarantined pod review and release
JWT signing key rotation
Wazuh alert escalation paths

All runbooks are version-controlled, tested quarterly, and accessible via out-of-band communications.### WORM Audits and Merkle-Rooted Forensics

Every security-relevant event (MCP tool calls, memory operations, document processing, routing decisions) is recorded with:Full redacted context
Merkle root linking the event to the broader workflow tree
Immutable WORM storage

This creates a tamper-evident forensic trail. Investigators can verify the integrity of logs and reconstruct exact sequences of events.### Quarterly Restore Testing

Backups are useless if untested. ClawQL mandates:3-2-1+ backup strategy (3 copies, 2 media types, 1 offsite)
Quarterly full restore tests with documented results
Tests must successfully restore a complete ClawQLInstance including memory graph, documents, and audit trails

Results are stored in the STRIDE artifact repository with timestamps.### Out-of-Band Communications

Primary infrastructure (Slack, internal chat, monitoring) may be compromised or unavailable during an incident. ClawQL requires:Self-hosted Matrix or Mattermost on separate hardware
Pre-defined activation triggers and access lists
Regular testing of the out-of-band channel

### Key Takeaways

Incident response must be practiced, not theoretical — PICERL runbooks and quarterly restore tests are mandatory.
WORM storage + Merkle roots provide cryptographically verifiable audit trails for post-incident forensics.
Human oversight and out-of-band communications ensure resilience when primary systems are affected.
Recovery testing closes the loop between prevention and actual operational readiness.

This process guide ties together all previous controls into a complete security lifecycle.**Next in the series**: GPU and Resource Protection – Preventing Rogue Agent Denial-of-Service.

---

_ClawQL Security Best Practices Series • Part 14 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **GPU and Resource Protection: Preventing Rogue Agent Denial-of-Service\*\***Part 15 of the ClawQL Security Best Practices Series\***\*May 2026**

Agentic workloads can consume massive GPU resources through runaway loops, infinite tool calling, or maliciously crafted prompts. Without proper controls, a single rogue agent can starve the entire cluster of inference capacity. This guide details how ClawQL protects GPU resources using quotas, limits, and node isolation.### ResourceQuota and LimitRange Configuration

ClawQL enforces hard GPU limits at the namespace level:yaml

apiVersion: v1
kind: ResourceQuota
metadata:
name: openclaw-gpu-quota
namespace: openclaw
spec:
hard:
requests.nvidia.com/gpu: "4" # Set to your actual maximum intended concurrency
limits.nvidia.com/gpu: "4"

**Best Practice**: Set the quota to your real maximum agent concurrency (not 1). The goal is a safety ceiling, not artificial restriction.Pair this with a LimitRange to enforce per-pod limits:yaml

apiVersion: v1
kind: LimitRange
metadata:
name: gpu-limit-range
spec:
limits: - type: Container
defaultRequest:
nvidia.com/gpu: 1
default:
nvidia.com/gpu: 1
max:
nvidia.com/gpu: 2

### Node Selectors and Taints

Inference workloads (model serving, agent execution) are pinned to dedicated GPU nodes using node selectors and taints. Observability, logging, and control-plane components are explicitly excluded from these nodes.This isolation prevents monitoring overhead from introducing latency jitter on critical inference paths.### Preventing Rogue Agent Scenarios

**Runaway tool loops** are contained by Panguard ATR rules and token-budget controls in Memory 2.0.
**ResourceQuota** acts as the final hard stop if an agent bypasses application-level limits.
**Kata sandboxing** (Guide 8) adds isolation so even a compromised agent cannot directly manipulate GPU devices outside its assigned resources.

### Key Takeaways

GPU quotas and limits are essential to prevent denial-of-service from rogue or poorly behaving agents.
Set realistic maximums based on your hardware and expected concurrency.
Combine quotas with node isolation to protect inference performance.
Resource protection must work together with MCP runtime controls and sandboxing for complete defense.

This specialized protection ensures the platform remains stable and available even under abnormal agent behavior.**Next in the series**: Workstation and Local Development Security – Same Posture Everywhere.

---

_ClawQL Security Best Practices Series • Part 15 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Workstation and Local Development Security: Same Posture Everywhere\*\***Part 16 of the ClawQL Security Best Practices Series\***\*May 2026**

Security is not only a production concern. Developer workstations are often the weakest link and the most common entry point for supply chain attacks. ClawQL enforces the same high security standards in local development environments as in production.### Full Stack on Docker Desktop

Developers run the complete clawql-full-stack Helm chart on Docker Desktop with the security bundle enabled:yaml

security:
fullBundle: true
kata:
enabled: true
panguard:
enabled: true
weightVerification:
enabled: true

This deploys the intelligent MCP gateway, Panguard, Kyverno policies, and golden images locally.### Panguard CLI for Local MCP Proxy

The pga up command starts a local Panguard instance that mirrors production behavior:Same ATR rule enforcement
Same blocking and auditing
Local MCP proxy for Cursor, Claude Desktop, and other clients

All local tool calls go through the same security chokepoint as production.### Additional Local Protections

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

This local security layer ensures the entire development lifecycle aligns with the platform’s defense-in-depth model.**Next in the series**: Production Deployment – One-Command Secure Full Stack.

---

_ClawQL Security Best Practices Series • Part 16 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Production Deployment: One-Command Secure Full Stack\*\***Part 17 of the ClawQL Security Best Practices Series\***\*May 2026**

All previous security controls culminate in a single, repeatable, secure deployment process. This guide provides the exact command and checklist to deploy a fully hardened ClawQL instance with every defense-in-depth layer enabled.### Security-Enabled Helm Command

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

The Kubernetes Operator handles reconciliation and self-healing of security components.### Post-Deploy Verification Checklist

Confirm all pods use Kata runtime where required
Verify Cosign signatures on running images
Test Panguard blocking with a deliberate out-of-scope tool call
Validate model weight verification on a sample inference pod
Check Merkle root metrics in Prometheus
Confirm no external egress except approved ServiceEntries
Run a full end-to-end MCP tool call and review redacted logs

### Key Takeaways

A secure ClawQL deployment is achieved through a single, opinionated Helm command with explicit security flags.
Defense-in-depth is enabled by default — not as optional add-ons.
Follow the documented deployment order and post-deploy checklist to avoid misconfiguration.
Treat the full secure stack as the baseline; partial deployments are only for non-production testing.

This completes the operational deployment foundation of the series.**Next in the series**: Threat Modeling with STRIDE for Agentic AI Systems.

---

_ClawQL Security Best Practices Series • Part 17 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Threat Modeling with STRIDE for Agentic AI Systems\*\***Part 18 of the ClawQL Security Best Practices Series\***\*May 2026**

Threat modeling is not a one-time exercise. In agentic MCP platforms, where systems are dynamic and agents can chain tools unpredictably, STRIDE must be a living process that evolves with the platform. This capstone guide explains how ClawQL applies STRIDE specifically to agentic AI systems.### STRIDE for Agentic Systems

STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) is adapted to address the unique risks of MCP, autonomous agents, and multi-backend orchestration.**S**poofingAgent identity spoofing via forged ATR claims or stolen JWTs
Model weight impersonation (model-in-the-middle attacks)

**T**amperingMerkle tree manipulation of memory graph or documents
Tool call parameter tampering in transit
Model weight poisoning

**R**epudiationAgents denying tool calls or actions
Lack of immutable audit trails

**I**nformation DisclosurePII leakage through logs or MCP responses
Memory cross-vertical recall exposing restricted data

**D**enial of ServiceRogue agent GPU exhaustion
MCP gateway flooding or Panguard bypass attempts

**E**levation of PrivilegeAgent escaping sandbox to host
Privilege escalation via tool chaining or vertical bypass

### Living Threat Model Process

ClawQL treats the threat model as a living artifact:Updated quarterly or on any major change (new vertical, new proxy plugin, new MCP tool).
Linked directly to controls in the Defense-in-Depth guide.
Reviewed as part of every Helm chart upgrade gate.
Stored in version-controlled, signed Git repository with full history.

New components (e.g., a new vertical or external MCP proxy) require a STRIDE entry before production deployment.### Gating Deployments with STRIDE

No production change is approved without:Updated STRIDE analysis for the affected components.
Mapping of new threats to existing or new controls.
Sign-off from the security owner.

This ensures security scales with platform growth rather than becoming a checkbox.### Key Takeaways

STRIDE for agentic systems must address dynamic behaviors like tool chaining, memory recall, and multi-backend routing.
Threat modeling must be continuous and tied to deployment gates, not a static document.
Every new feature or integration requires explicit threat analysis and control mapping.
A living STRIDE model turns security from reactive to proactive across the entire ClawQL lifecycle.

This strategic practice ties together all technical controls in the series and prepares the platform for long-term evolution.**Next in the series**: OWASP Agentic Top 10 and How ClawQL Mitigates Each One.

---

_ClawQL Security Best Practices Series • Part 18 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **OWASP Agentic Top 10 and How ClawQL Mitigates Each One\*\***Part 19 of the ClawQL Security Best Practices Series\***\*May 2026**

The OWASP Agentic Top 10 highlights the most critical risks in autonomous AI agent systems. ClawQL was designed from the ground up with these risks in mind. This guide maps each major risk to the specific controls and architecture patterns that mitigate it.### 1. Prompt Injection / Jailbreaking

**Risk**: Malicious instructions that override agent behavior.  
**ClawQL Mitigation**: ATR scoping + Panguard synchronous enforcement. Capabilities are restricted at the tool level, not through prompt filtering. Natural language is never the security boundary.### 2. Sensitive Information Disclosure

**Risk**: Leakage of PII, credentials, or proprietary data.  
**ClawQL Mitigation**: Presidio redaction in the Fluent Bit pipeline before any log write, combined with GraphQL projection and Memory 2.0 token-budget trimming. Redaction-before-write ensures sensitive data never reaches persistent stores.### 3. Privilege Escalation

**Risk**: Agent gaining unauthorized access to tools or data.  
**ClawQL Mitigation**: JWT ATR claims validated on every MCP call, explicit tool scoping per role/vertical, and least-privilege RBAC. Cross-vertical actions require elevated claims.### 4. Model Denial of Service

**Risk**: Resource exhaustion through runaway loops or heavy inference.  
**ClawQL Mitigation**: GPU ResourceQuota + LimitRange, Panguard rate limiting, and token-budget controls in Memory 2.0 recall.### 5. Supply Chain Vulnerabilities

**Risk**: Compromised dependencies, images, or model weights.  
**ClawQL Mitigation**: Harbor as single trust root with allowlist-only resolution, Cosign keyless signing, golden distroless images, and init-container model weight verification.### 6. Insecure Output Handling

**Risk**: Agent output leading to command injection or unsafe actions.  
**ClawQL Mitigation**: Structured tool calling through the intelligent MCP gateway. All outputs are validated and scoped before execution. No raw shell or direct code execution outside Kata sandboxes.### 7. Training Data / Memory Poisoning

**Risk**: Contaminated knowledge graph or RAG corpus.  
**ClawQL Mitigation**: Merkle-rooted provenance on every Memory 2.0 ingest, Cuckoo filter deduplication, and Presidio redaction on document intake. Cross-vertical recall requires explicit elevated ATR.### 8. Unauthorized Code Execution

**Risk**: Agent executing arbitrary code.  
**ClawQL Mitigation**: Kata Containers as default runtime for all MCP/sandbox workloads, combined with explicit sandbox_exec tool gating and read-only root filesystems.### 9. Overreliance on Agent Autonomy

**Risk**: Blind trust in agent decisions without oversight.  
**ClawQL Mitigation**: Human-in-the-loop via HITL approval gates in automation, audit logging of all decisions, and Merkle-rooted workflow trails for full accountability.### 10. Multi-Step Tool Chaining Attacks

**Risk**: Agents chaining tools in harmful sequences.  
**ClawQL Mitigation**: Intelligent routing engine with historical success scoring and sensitivity checks, plus Panguard session-level ATR rules that evaluate cumulative risk across chained calls.### Key Takeaways

ClawQL mitigates the OWASP Agentic Top 10 through defense-in-depth rather than single-point solutions.
The majority of risks are addressed at the architectural level (ATR scoping, sandboxing, cryptographic provenance) rather than reactive prompt filtering.
Every major risk has multiple overlapping controls from different layers of the stack.
This mapping is reviewed quarterly as part of the living STRIDE process (Guide 18).

The complete series equips you with both tactical implementation details and strategic understanding of agentic security.**Next (Final) in the series**: Quarterly Security Review Checklist – Keeping Defense-in-Depth Alive.

---

_ClawQL Security Best Practices Series • Part 19 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---

# **Quarterly Security Review Checklist: Keeping Defense-in-Depth Alive\*\***Part 20 of the ClawQL Security Best Practices Series\***\*May 2026**

Defense-in-depth is not a set-it-and-forget-it architecture. It requires continuous validation and maintenance. This final capstone guide provides the operational checklist that must be executed quarterly to keep the entire security posture effective over time.### Quarterly Review Cadence

Perform this full review every three months, or after any major change (new vertical, new proxy backend, Helm upgrade, or Kubernetes version bump). Assign a named security owner responsible for completion and documentation.### 1. Supply Chain & Image Verification

Verify all running images are pulled from Harbor with valid Cosign signatures.
Confirm allowlist-only resolution is enforced and no external registries are in use.
Review Trivy/OSV-Scanner results for new critical vulnerabilities.
Validate SBOMs exist for all production images and model weights.

### 2. Admission Control & Runtime Policies

Check Kyverno policies are active and in “Enforce” mode.
Confirm all MCP and sandbox pods use Kata runtime.
Verify model weight verification init containers are functioning on inference pods.
Review and approve any temporary namespace exemptions.

### 3. Identity & Zero Trust Controls

Audit Vault dynamic secret leases and revoke any orphaned credentials.
Rotate JWT signing keys if due.
Verify ATR claim enforcement is working on a sample of MCP tool calls.
Confirm YubiKey signing requirement is enforced on all Helm chart changes.

### 4. Network & Containment

Review Istio ServiceEntries and egress allowlists against current needs.
Validate default-deny NetworkPolicy is blocking unauthorized traffic.
Check Kiali for unexpected east-west connections.
Confirm mTLS is in strict mode everywhere.

### 5. Monitoring & Observability

Review Wazuh and Falco alert tuning — reduce noise, improve signal.
Check Prometheus metrics for Merkle root verification and Cuckoo filter health.
Confirm observability workloads are pinned away from GPU nodes.
Test Talon quarantine and release process on a non-production pod.

### 6. Data Protection & Logging

Verify Presidio redaction is active in the Fluent Bit pipeline.
Sample WORM logs to ensure no raw PII is present.
Confirm Merkle roots are being recorded for all critical workflows.

### 7. Backup & Recovery Testing

Perform a full restore test of a ClawQLInstance (including memory, documents, and audit trails).
Document restore time, success rate, and any issues.
Verify 3-2-1+ backup strategy is functioning.

### 8. STRIDE & OWASP Review

Update the living STRIDE threat model with any new components.
Re-map OWASP Agentic Top 10 risks to current controls.
Document any new threats and required mitigations.

### 9. Documentation & Runbooks

Confirm all PICERL runbooks are current.
Verify out-of-band communication (Matrix/Mattermost) is tested and ready.
Ensure this quarterly checklist itself is up to date.

### Key Takeaways

Security is a continuous process, not a destination.
Quarterly reviews with a named owner and documented results prevent drift and degradation.
Every layer — supply chain, admission, network, runtime, monitoring, and recovery — must be actively validated.
Treat the full defense-in-depth stack as a living system that requires ongoing care.

Completing this checklist keeps ClawQL’s security posture strong, auditable, and ready for both current and future threats.**End of Series**

---

_ClawQL Security Best Practices Series • Part 20 • May 2026_  
Based on the official ClawQL Comprehensive Defense-in-Depth Security Guide.

---
