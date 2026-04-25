# Defense-in-Depth Security Stack for Self-Hosted Infrastructure

**Advanced Infrastructure Security — Reference Guide**  
**Zero Trust · Immutability · Cryptographic Controls · Incident Response**  
**Making Unauthorized Persistence Structurally Difficult**

**April 2026** — Comprehensive reference (aligns with **ClawQL** security slides **§08** in `clawql-slides.md`).

---

## Learning Objectives

By the end of this module, you should be able to:

- Identify the challenges of silent compromises in traditional self-hosted environments.
- Explain each component of a modern defense-in-depth security stack.
- Apply threat modeling to prioritize controls for a given environment.
- Describe why individual controls matter and how they interact synergistically.
- Analyze how the combined architecture improves detection and recovery.
- Plan bootstrapping and incident response before they are needed.
- Discuss operational realities of implementing and maintaining such a stack.

**ClawQL note:** The platform’s **MCP server**, **Helm** stack, **Istio**, **Trivy/OSV-Scanner**, **Vault**, **Merkle** audit, and **optional Fabric** are designed to **plug into** this model—not replace organizational controls such as **SSO**, **YubiKey** policy, or **SIEM**.

---

## The Security Challenge in Self-Hosted Infrastructure

### The problem

In self-hosted and on-prem environments, attackers commonly exploit:

- Application vulnerabilities
- Supply-chain compromises
- Misconfigurations

Once inside, they establish **persistent backdoors**, crypto miners, or data exfiltration channels.

**Key issues with traditional mutable infrastructure**

- Mutable servers allow easy in-place modifications.
- Configuration drift accumulates over time.
- Hidden persistence mechanisms are difficult to detect.
- Average **dwell time** before detection often exceeds **200 days**.

### Our goal

Transform stealthy, persistent access into **loud, short-lived, observable events**.

**Strategic objectives**

- Make unauthorized writes, persistence, and lateral movement **structurally impossible** or **immediately visible**.
- Minimize **Mean Time to Detection (MTTD)** and **Mean Time to Recovery (MTTR)**.
- Enable rapid, clean recovery without lengthy forensic analysis.

---

## Threat modeling

### Definition and importance

**Threat modeling** is a structured process to identify threats, attack vectors, and mitigations **before** architecture decisions are finalized. Without it, controls are often misaligned with actual risks.

### STRIDE threat categories

| Category | Description |
|----------|-------------|
| **S**poofing | Impersonating a user or system |
| **T**ampering | Unauthorized modification of data |
| **R**epudiation | Denying actions were performed |
| **I**nformation disclosure | Exposing data to wrong parties |
| **D**enial of service | Disrupting availability |
| **E**levation of privilege | Gaining unauthorized privilege |

### Six-step threat modeling process

1. Define scope and assets.
2. Enumerate threats (using **STRIDE** + **MITRE ATT&CK** where helpful).
3. Assess likelihood and impact.
4. Define mitigations per threat.
5. Implement and validate controls.
6. **Repeat** on every major change.

---

## Foundational principles

### 1. Zero trust

- Assume every request is potentially malicious.
- Continuous verification of identity, device, context, and behavior.
- No implicit trust — even for internal network traffic.
- Short-lived sessions with re-authentication at every boundary.

**In ClawQL:** Optional **Istio** mTLS, **AuthorizationPolicy**, **ClawQL**-scoped **K8s** **ServiceAccounts**, and **Onyx** permission model for knowledge retrieval.

### 2. Immutability

- Deploy only from known-good, **cryptographically signed** artifacts.
- Do not modify running instances in place; **any change = new deployment** from a new image.
- **Recovery = replacement**, not ad hoc repair on live disk.

**In ClawQL:** **Golden Image** pipeline (**distroless** / minimal bases), **Cosign**, **digest-pinned** Helm, **Merkle**-verifiable workflow outputs.

### 3. Least privilege

- Grant only the permissions required for a specific task.
- Prefer temporary, narrowly scoped access (no standing org-wide admin on production clusters).
- **Policy-as-code** for reviewable, auditable rules.

**In ClawQL:** **RBAC** in **K8s**, **provider tokens** in **Vault**/Secrets, **Flink/Onyx** service accounts, **MCP** tool scoping.

---

## Immutable infrastructure with signed golden images

**Definition:** Root filesystem mounted read-only where feasible. All deployments use versioned, **cryptographically signed** base images (e.g. **Packer**, **NixOS**, **dm-verity**-backed or **distroless** containers per your base).

### Why it matters

- Prevents unauthorized writes and configuration drift.
- Tampering is blocked or detected at boot/schedule.
- Recovery is **instance replacement**; system state is verifiable against the signed artifact.

### Practical examples

- Attacker attempts to drop a rootkit: **`/usr`** read-only or **dm-verity** / immutable layers reject the write.
- Reboot or reschedule restores the verified baseline.
- Configuration changes require **building and signing a new** image and rolling via **IaC**.

**ClawQL:** **Trivy** + **OSV-Scanner** + **SBOM** in CI; **OPA Gatekeeper** / **Kyverno** at admission; chart pins **image digest**.

---

## Infrastructure as code (IaC) for everything

**Definition:** Infrastructure, configuration, policy, and deployments are expressed declaratively in version-controlled code (**Terraform**, **Pulumi**, **Argo CD**, **Flux**, **Helm**, etc.). No unreviewed manual changes in production.

### Why it matters

- Single source of truth; reduced drift.
- Every change can pass automated validation, tests, and review.
- Roll back to a prior state in minutes.

**ClawQL:** Single **`charts/clawql-full-stack`** (or equivalent) **`values.yaml`**; **`CLAWQL_BUNDLED_OFFLINE`**, provider URLs, **Istio** and **Flink** toggles in Git.

---

## YubiKey for signed commits

**Definition:** Hardware key used to sign **Git** commits and tags (**GPG** or **SSH**). The private key used for signing does not leave the device (depending on configuration).

### Why it matters

- Strengthens **non-repudiation** and repository integrity.
- **CI/CD** can reject unsigned or unverifiable commits when policy requires it.
- Complements, not replaces, **SLSA** / **Sigstore** for **build** provenance.

### Enforcement (organizational)

- Branch protection: required reviews + required status checks.
- Pipelines reject commits that do not meet signing policy.
- **Org policy:** all production deploy tags signed.

---

## Zero-trust architecture (network and workload)

- Continuous verification per request (identity + context + least privilege).
- **mTLS** for service-to-service traffic where applicable.
- **Short-lived** credentials via **Vault** and workload identity (e.g. **SPIRE** in advanced setups).

**ClawQL:** **Istio** mTLS, **Kiali** visibility, **Vault** dynamic secrets, **Istio** **AuthorizationPolicy** per namespace.

---

## Single sign-on (SSO) and machine identity

- Central **IdP** for **human** access to **Grafana**, **Kiali**, **OpenClaw**, **PagerDuty** consoles, and **K8s** **API** (via your chosen integration).
- **Machine** identities: **K8s** **ServiceAccounts**, **SPIFFE** IDs in mesh, **AWS/GCP** workload identity for external connectors (if any).

**ClawQL** does not replace your **IdP**; it **consumes** **OAuth**/**OIDC** or static tokens you configure.

---

## Phishing-resistant MFA with YubiKey (FIDO2 / passkeys)

- Mandatory for production **break-glass**, **Vault** unseal operations (if supported), and org policy for **SSO** admin roles.
- **TOTP** is **phishable** under real-time relay; **FIDO2** is **origin-bound**.

---

## RBAC, IAM, and least privilege

- **Kubernetes RBAC** bound to **least** necessary **Role** / **ClusterRole**.
- **Temporary** elevation (JIT) for production changes where possible.
- **ClawQL** provider tokens: one secret per provider; no shared mega-token across environments.

---

## HashiCorp Vault (or OpenBao) with ephemeral / short-lived credentials

- Dynamic credentials where supported; static secrets in **KV** with rotation policy.
- **Audit** log of secret access; **Istio**-protected path from workloads to **Vault** in hardened setups.
- **ClawQL** Helm: **Vault Agent** injector or equivalent pattern — see `clawql-slides` Infrastructure section.

---

## Multisig for Vault and HSM for key material (high-regulated)

- **M-of-N** for **unseal** / **root** operations; **HSM**-backed keys in regulated environments.
- ClawQL **Merkle** and **Fabric** (optional) can anchor **governance** events; org **HSM** is outside the app.

---

## Mutual TLS (mTLS)

- **Bidirectional** authentication for **east-west** traffic in the mesh.
- **ClawQL:** **Istio** with **STRICT** peer authentication in production overlays.

---

## Network policies and firewall rules

- **Default deny**; allow only required paths (namespace → service → port).
- **Egress** control for build jobs and `execute`-driven outbound calls to known APIs.
- **Cilium** + **eBPF** optional for deeper policies.

**ClawQL:** **NetworkPolicy** per product namespace; **Istio** **EgressGateway** and **ServiceEntry** for allowlisted external APIs.

---

## DNS security

**Often overlooked** channel for **exfil** and **C2**.

**Attack vectors:** DNS tunneling, C2 beacons, cache issues, hijacking.

**Controls:** **DNSSEC** (where you control the zone), **DoH/DoT** for clients if policy allows, **RPZ**, **egress** DNS logging and **anomaly** rules (NXDOMAIN storms, long TXT, etc.).

**ClawQL cluster:** Harden **CoreDNS** or equivalent; log **egress** from `clawql` **namespace**; consider **Istio**-visible DNS metrics.

---

## Container and Kubernetes hardening

### Admission controllers

- **OPA Gatekeeper** or **Kyverno**: no privileged pods, no hostPath where forbidden, **signed** images only, **distroless** or approved bases.

### Image scanning and SBOM

- **Trivy** / **Grype** in CI; **OSV-Scanner** for **CVE** and **ecosystem**; **CycloneDX/SPDX** **SBOM** per build.
- **Block** Critical/High per policy; **Grafana** annotations on new bad digests.

### Runtime

- **gVisor** / **Kata** / **seccomp** / **AppArmor** as appropriate for your threat model.

**ClawQL** Golden Image and **slide** **deck** call out the same.

---

## Endpoint and developer workstation security

**Workstations** are a primary path for **supply-chain** and **token** theft.

**Technical:** FDE, **EDR**, no local admin for dev, **MDM**, separate VM for high-risk usage.

**Policy:** patch SLA (e.g. 72h for critical), phishing drills, **YubiKey** for **git** sign and **SSO** admin.

---

## Runtime monitoring and anomaly detection

- **Falco** (eBPF) for syscall / K8s audit anomalies.
- **FIM** on static assets where needed.
- **Immutability** makes deviations **obvious** (new binary in a read-only image path → alert).

---

## Supply-chain vigilance, logging, and auditing

- **SBOM** + **Cosign** verify before deploy; **Merkle**-signed attestation in advanced setups.
- **Immutable** or **WORM** logging for **audit**-critical streams; **SIEM** correlation.
- **ClawQL** **`audit`** tool and **Merkle** for workflow evidence; **Loki**/ELK per org.

---

## Vulnerability management (tiered response)

| Severity | CVSS (typical) | Response time (example) | Actions |
|----------|----------------|-------------------------|---------|
| **Critical** | 9.0–10.0 | **24 hours** | Block deploy; escalate; emergency patch |
| **High** | 7.0–8.9 | **72 hours** | Block or waiver with owner; patch window |
| **Medium** | 4.0–6.9 | **30 days** | Track; schedule |
| **Low** | 0.0–3.9 | **Quarterly** | Document accepted risk |

*Tune SLAs to your org. ClawQL CI should fail **Critical/High** per `policy.yaml`.*

---

## Fast recovery

1. **Detect** — alerts from metrics, **Falco**, **Istio** 5xx, **Trivy** in CI, **Uptime** **Kuma**.
2. **Isolate** — quarantine **namespace** / **NetworkPolicy**; rotate **Vault** + provider tokens.
3. **Redeploy** — fresh **signed** image via **IaC**; **no** hand-editing **running** pods.
4. **Verify** — **Merkle**/scan green; **smoke** **MCP** `listTools` + one **`execute`**.

---

## Backup and data recovery (3-2-1+)

- **3** copies, **2** media types, **1** offsite (or **air-gapped** for regulated).
- **Object Lock** / **WORM** where required; **encryption** with **separate** **backup** keys; **isolated** backup credentials.
- **Quarterly** full restore test (Postgres, **Obsidian** vault, **MinIO**).

**ClawQL** state: **Postgres** (Seeds, Merkle), **Paperless** DB, **Onyx** index strategy per deployment, **Obsidian** on PVC or host path (documented).

---

## Bootstrapping and key ceremony

The **chicken-and-egg** of first trust: **HSM** / **air-gapped** **ceremony** for **root** **CA**, **K8s** **bootstrap** tokens, **Vault** **unseal** **shards** (Shamir), **cosign** **key** **gen**, **witnesses**, **geographic** **distribution**, **annual** **cold** **rebuild** test.

---

## Incident response: PICERL (example)

| Phase | Actions |
|-------|--------|
| **P**reparation | Runbooks, **on-call**, **backup** test, **tabletop** |
| **I**dentification | Triage, **scope**, **Istio** / **Falco** / **SIEM** |
| **C**ontainment | Isolate, **revoke** creds, **block** at **egress** |
| **E**radication | **Remove** **malware** by **redeploy** from **signed** **image** |
| **R**ecovery | **Restore** from **clean** **backup** if needed; **monitor** |
| **L**essons | Blameless **post-mortem** (e.g. **within 72h**) |

---

## End-to-end secure lifecycle (integrating the stack)

**Signed commit (optional YubiKey)** → **signed build** (CI: **Trivy**, **OSV**, **SBOM**) → **Cosign** → **verified** **registry** → **immutable** **Helm** **deploy** (**Istio** mTLS, **NetPol**) → **runtime** **Vault** **tokens** → **continuous** **monitoring** (Prometheus, **Falco**, **Jaeger**) → **Detect** → **Isolate** → **Redeploy** → **improve**

**ClawQL-specific:** **`CLAWQL_BUNDLED_OFFLINE`**, **MCP** `audit` + **Merkle**, **optional** **Fabric** for **consortium** **provenance**, **Ouroboros** **Seeds** for **reproducible** **workflows**.

---

## End-to-end attack scenario (supply chain — npm)

| Phase | Without stack | With full stack |
|-------|---------------|-----------------|
| **Supply chain** | Malicious package in build | **SBOM** + **verify**; **SLSA**/policy **fails** **build** |
| **Execution** | **Backdoor** in **container** | **Read-only** / **verified** **image**; **Falco** **alerts** |
| **Lateral** | Stolen **kube** **creds** | **mTLS** + **netpol** + **short-lived** **Vault** **tokens** |
| **Persistence** | **Survives** **reboot** on **mutable** **node** | **Replace** **node** / **pod** from **signed** **image**; **IaC** **only** |

---

## Operational realities

- **Maintenance:** rotation, **patch** **windows**, **quarterly** **restore** drills.
- **Complexity** vs **resilience** trade-off; automate everything you can in **IaC** and **Helm**.
- **Outcome:** **Persistence** for attackers becomes **hard**, **loud**, and **short**-lived if your org implements the **full** model.

---

## References and further reading

- **NIST** SP 800-207 (Zero Trust); **CISA** Zero Trust Maturity Model; **Google** BeyondCorp (concepts).
- **CNCF** cloud native security whitepaper; **CIS** Kubernetes benchmark; **NSA/CISA** Kubernetes hardening.
- **MITRE** ATT&CK; **OWASP** threat modeling cheat sheet; **NIST** CSF 2.0.
- **SLSA**; **Sigstore** / **Cosign**; **NIST** SP 800-57 (key management).

---

## Assessment and labs (suggested for internal training)

**Discussion:** Why does **immutability** make **Falco**’s job easier? **STRIDE** on a **clawql** **namespace** diagram. **Bootstrap** **risk**. **TOTP** vs **FIDO2**. Workstation **compromise** path.

**Hands-on:** **Signed** commits + **CI** reject; **Falco** in **k3d**; **tabletop** **npm** **package**; **STRIDE** on one **Ouroboros** **Seed**.

---

## Module summary

- **No** single **control** is **enough**; **layers** **reinforce** each other.
- **Threat** **modeling** **first**; **IaC** **always**; **immutability** **+** **detect** **+** **recover** **+** **learn**.
- **ClawQL** gives you a **MCP**-centric, **Merkle**-audited, **mesh**-ready, **scanned** **Helm** platform—**your** **IdP**, **HSM**, **EDR**, and **SIEM** still **own** the **perimeter** **around** it.

---

_End of document — `docs/clawql-security-defense-in-depth.md` — April 2026_

_For slide summaries, see **§08** in `docs/clawql-slides.md`._
