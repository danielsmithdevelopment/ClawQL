# Defense in depth — engineering deliverables matrix

**Purpose:** Trace every major control in [`clawql-security-defense-in-depth.md`](clawql-security-defense-in-depth.md) (companion to **§08** / slides **68–79** in [`../presentations/clawql-slides.md`](../presentations/clawql-slides.md)) to **concrete** repo artifacts, **CI** jobs, **Helm** knobs, or **GitHub issues**. This is the **authoritative engineering backlog** for “what is **already in Git** vs what is **planned**.”

**Relationship to the slide deck:** **`clawql-slides.md`** describes the **target** product and infrastructure story (**Golden Image**, **SBOM**, **Cosign**, mesh, Vault, etc.). **Do not** replace that narrative with “CI only” language — use **this matrix** to show **shipped / partial / planned** next to the same bullets so decks and RFPs stay ambitious while engineering stays honest.

**Tracking:** [GitHub #164](https://github.com/danielsmithdevelopment/ClawQL/issues/164). Reconcile compliance packaging with [#133](https://github.com/danielsmithdevelopment/ClawQL/issues/133) (SOC2/HIPAA docs + Helm hardening).

---

## How to read this document

| Status        | Meaning                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| **Shipped**   | Implemented in this repository today (verify paths in **Artifact** column).               |
| **Partial**   | Some layers exist; gaps listed in **Notes** or covered by open issues.                    |
| **Planned**   | Tracked issue(s); no primary implementation in-repo yet.                                    |
| **Customer**  | Organizational control (IdP, YubiKey policy, SIEM, EDR, HSM) — ClawQL documents, does not ship. |
| **N/A**       | Educational / process-only section in the reference guide, not a product deliverable.       |

**Issue links** use `https://github.com/danielsmithdevelopment/ClawQL/issues/<n>`.

---

## Matrix (control → status → issue → artifact)

| # | Control / topic (reference doc) | Status | Issue(s) | Artifact / location |
| - | -------------------------------- | ------ | -------- | ------------------- |
| 1 | **Threat modeling** (STRIDE, six-step process) | **N/A** | — | Process for operators; ClawQL documents patterns — not enforced in code. |
| 2 | **Zero trust** (identity per request, no implicit trust) | **Partial** | [#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155), [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88) | MCP HTTP/gRPC auth via env ([`docs/mcp-tools.md`](../mcp-tools.md), [`.env.example`](../../.env.example)); **Istio** optional in Helm — **not** default chart templates today. |
| 3 | **Immutability** (replace, don’t patch live) | **Partial** | [#132](https://github.com/danielsmithdevelopment/ClawQL/issues/132) | [`docker/Dockerfile`](../../docker/Dockerfile) **distroless** runtime; K8s rolling updates via [`charts/clawql-mcp`](../../charts/clawql-mcp); **digest-first** values + **Kyverno `verifyImages`** (`kyverno.imageSignaturePolicy`, **on by default**; opt out **`enabled=false`**) — full “no bypass” admission still operator + GitOps discipline (#132). |
| 4 | **Least privilege** (RBAC, scoped tokens) | **Partial** | [#193](https://github.com/danielsmithdevelopment/ClawQL/issues/193), [#182](https://github.com/danielsmithdevelopment/ClawQL/issues/182) | Helm `podSecurityContext` / `securityContext` hooks ([`charts/clawql-mcp/values.yaml`](../../charts/clawql-mcp/values.yaml)); provider auth split per [`docs/mcp-tools.md`](../mcp-tools.md); **mutation allowlists** — **planned** (#193). |
| 5 | **Signed golden images + digest pins** | **Partial** | [#132](https://github.com/danielsmithdevelopment/ClawQL/issues/132), [#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156) | [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml): **Cosign** keyless sign on pushed digest; BuildKit **SBOM** + **SLSA provenance** attestations. **Helm:** digest pins in values; Kyverno **`verifyImages`** (**`kyverno.imageSignaturePolicy`**, default **enabled**). |
| 6 | **Supply chain — OSV + lockfile scan** | **Shipped** | [#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156) (**CI + publish + docs**); MCP **`search`/`execute`** surface → [#202](https://github.com/danielsmithdevelopment/ClawQL/issues/202) | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) **`supply-chain`**; root [`osv-scanner.toml`](../../osv-scanner.toml). |
| 7 | **Supply chain — Trivy (fs, vuln)** | **Shipped** | [#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156) | **`supply-chain`** job; [`.trivyignore`](../../.trivyignore). |
| 8 | **Supply chain — Trivy (built image)** | **Shipped** | [#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156); optional in-cluster rescan → [#203](https://github.com/danielsmithdevelopment/ClawQL/issues/203) | [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml): **Trivy** on **local OCI layout** before **`skopeo copy`** to GHCR (**HIGH** / **CRITICAL**, **`.trivyignore`**). |
| 9 | **SBOM (CycloneDX / SPDX) per build** | **Partial** | [#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156) | **Repo:** Syft **CycloneDX JSON** artifact in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) **`supply-chain`**. **Images:** BuildKit **`--sbom=true`** on **`docker buildx build`** in **`docker-publish`** (OCI layout → **`skopeo copy`**). SPDX export not wired. |
| 10 | **Cosign sign + verify** | **Partial** | [#132](https://github.com/danielsmithdevelopment/ClawQL/issues/132), [#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156) | **Sign:** keyless **`cosign sign`** in **`docker-publish`**. **Verify:** operator [`cosign verify`](../../docker/README.md) + deploy guide [`image-signature-enforcement.md`](image-signature-enforcement.md). **Cluster admission:** Kyverno **`ClusterPolicy`** in Helm (**`kyverno.imageSignaturePolicy`** default **enabled**); Kyverno install remains operator-owned (#132). |
| 11 | **IaC / Git as SoT** | **Shipped** | — | Helm chart + `values*.yaml`; [`Makefile`](../../Makefile) `lint-k8s-manifests`; workflows versioned in Git. |
| 12 | **YubiKey / signed Git commits** | **Customer** | — | Branch protection + org policy; ClawQL does not enforce. |
| 13 | **mTLS east-west (mesh)** | **Planned** | [#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155) | No Istio manifests in default `charts/clawql-mcp` release path. |
| 14 | **Vault / OpenBao (short-lived cluster secrets)** | **Planned** | [#161](https://github.com/danielsmithdevelopment/ClawQL/issues/161) | Distinct from **Obsidian** “vault” path ([`docs/memory-obsidian.md`](../memory-obsidian.md)). |
| 15 | **SSO / IdP for humans** | **Customer** | — | ClawQL **consumes** tokens you configure; no built-in IdP. |
| 16 | **Phishing-resistant MFA** | **Customer** | — | Policy for operators; not product code. |
| 17 | **NetworkPolicy / default-deny / egress allowlist** | **Planned** | [#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155) (mesh), chart hardening | No `NetworkPolicy` template in [`charts/clawql-mcp/templates`](../../charts/clawql-mcp/templates) today. |
| 18 | **DNS security (CoreDNS, RPZ, logging)** | **Customer** | — | Cluster operator responsibility; doc calls out considerations only. |
| 19 | **Admission (Gatekeeper / Kyverno)** | **Partial** | [#132](https://github.com/danielsmithdevelopment/ClawQL/issues/132) | **Kyverno** controller/CRDs: cluster add-on. **`ClusterPolicy`** (Cosign keyless **`verifyImages`**) rendered by default (**`kyverno.imageSignaturePolicy.enabled: true`**); opt out **`false`** — [`charts/clawql-mcp/values.yaml`](../../charts/clawql-mcp/values.yaml), [`image-signature-enforcement.md`](image-signature-enforcement.md). **OPA Gatekeeper** not in-repo. |
| 20 | **Runtime (Falco, gVisor, seccomp)** | **Customer / Planned** | [#199](https://github.com/danielsmithdevelopment/ClawQL/issues/199) (synthetics; not Falco) | **Falco** not in repo; operators deploy. **Uptime / synthetics** tracked separately (#199). |
| 21 | **SAST (CodeQL)** | **Shipped** | — | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml). |
| 22 | **Vuln management SLA** | **Customer** | — | Org process; CI blocks **HIGH/CRITICAL** for configured scanners — not a full SLA tool. |
| 23 | **`audit` MCP tool (ring buffer)** | **Shipped** | [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89) | [`docs/enterprise-mcp-tools.md`](../enterprise-mcp-tools.md) — **not** WORM / SIEM; use **`memory_ingest`** or export for durable trails. |
| 24 | **Merkle / workflow integrity API** | **Partial** | [#115](https://github.com/danielsmithdevelopment/ClawQL/issues/115), [#114](https://github.com/danielsmithdevelopment/ClawQL/issues/114) | Narrative + Ouroboros direction; **HTTP proof surface** — **planned** (#115). |
| 25 | **Ouroboros Postgres / events** | **Shipped** (optional) | [#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142) | Optional DB-backed event store; see [`docs/clawql-ouroboros.md`](../clawql-ouroboros.md). |
| 26 | **Backup & 3-2-1+** | **Customer** | [#133](https://github.com/danielsmithdevelopment/ClawQL/issues/133) | Documented expectations; backup implementation is deployment-specific. |
| 27 | **IR / PICERL** | **Customer** | — | Runbooks; ClawQL supplies telemetry hooks (e.g. [#160](https://github.com/danielsmithdevelopment/ClawQL/issues/160) Jaeger/OTLP) not full SOAR. |
| 28 | **SOC2 / HIPAA packaging** | **Planned** | [#133](https://github.com/danielsmithdevelopment/ClawQL/issues/133) | Docs + Helm hardening package — not a certification. |
| 29 | **Fabric / Web3 provenance** | **Planned** | [#157](https://github.com/danielsmithdevelopment/ClawQL/issues/157), [#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187) | Optional track; see ADR / supergraph issues. |
| 30 | **Public MCP gateway (x402, edge)** | **Planned** | [#88](https://github.com/danielsmithdevelopment/ClawQL/issues/88) | Edge controls for public MCP — roadmap. |
| 31 | **Safe `iac_inspect()` (dry-run)** | **Planned** | [#69](https://github.com/danielsmithdevelopment/ClawQL/issues/69) | P1 tool for policy-as-code inspection without mutation. |
| 32 | **Air-gapped sandbox** | **Planned** | [#23](https://github.com/danielsmithdevelopment/ClawQL/issues/23) | Alternative to Cloudflare Sandboxes. |
| 33 | **Dependency overrides / waivers** | **Shipped** | — | Root [`package.json`](../../package.json) **`overrides`**; [`osv-scanner.toml`](../../osv-scanner.toml) documented ignores (e.g. Next.js advisory with explicit rationale). |

---

## Compliance overlap (#133)

Controls in the reference doc that **directly** feed SOC2/HIPAA **readiness** narratives (documentation + Helm baselines) should be **cross-walked** in [#133](https://github.com/danielsmithdevelopment/ClawQL/issues/133):

- Access control / least privilege (rows **2**, **4**, **14–16**, **31**).
- Change management / integrity (rows **3**, **5**, **9–11**, **12**).
- Logging & monitoring (rows **20**, **23–24**, **27**, [#160](https://github.com/danielsmithdevelopment/ClawQL/issues/160)).
- Vulnerability management (rows **6–10**, **21–22**).

---

## Maintenance

- **On merge** of security-relevant CI, Helm, or Docker changes: update the **Status** / **Artifact** columns in this file (or in the same PR).
- **When closing #164:** keep this file as the living checklist; close the issue only when stakeholders agree the matrix is **complete for v1** (all rows have an explicit status and owner).

---

_Last updated: 2026-04-28 — SBOM / Cosign / Trivy image gates in `docker-publish` + Syft artifact in CI; issue [#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164)._
