# clawql-tee — Trusted Execution Environment Spec v0.1

**Status:** Draft · August 2026 · v0.1  
**Builds on:** [`clawql-cellrt`](./clawql-cellrt.md) v0.1 (software security baseline)  
**Companions:** [`clawql-tee-airgap-audit.md`](./clawql-tee-airgap-audit.md) · [`clawql-streams`](./clawql-streams.md) v0.2 · [`clawql-inference`](../inference/clawql-inference.md)  
**Repo home:** ClawQL monorepo — `crates/clawql-cellrt/cellrt-attestation/` (+ Vault/inference tee paths)

---

## 1. What this is

`clawql-tee` turns cellrt from a **security-hardened runtime** into a **cryptographically verifiable runtime**.

| Layer                     | Guarantee                                                | Trust assumption removed          |
| ------------------------- | -------------------------------------------------------- | --------------------------------- |
| cellrt (software)         | Rust memory safety, eBPF, WASM sandbox, Cosign, LTX WORM | “Trust the binary we published”   |
| **clawql-tee (hardware)** | CPU memory encryption + remote attestation               | “Trust the host OS / hypervisor”  |
| Attestation-gated Vault   | Secrets/virtual keys only after measurement matches      | “Trust AppRole credentials alone” |
| Air-gap QR audit          | Unidirectional physical audit delivery                   | “Trust the network transport”     |
| GPU CC (optional)         | Measured model weights + encrypted inference I/O         | “Trust GPU memory on the host”    |

cellrt alone: _trust us, here's the source and Cosign signature._  
clawql-tee: _don't trust us — verify the attestation; the hardware proves what's running._

---

## 2. Gaps from cellrt → tee

### Gap 1: Hardware isolation — TEE substrate

| Substrate       | Properties                                  | Availability                       | Root of trust | Recommendation                         |
| --------------- | ------------------------------------------- | ---------------------------------- | ------------- | -------------------------------------- |
| **AMD SEV-SNP** | Full VM memory encryption; hypervisor-blind | AWS m6a/r6a, Azure DCasv5, GCP N2D | AMD KDS       | **Default** for sovereign story        |
| **Intel TDX**   | VM-level isolation (Sapphire Rapids+)       | Azure DCesv5, GCP C3               | Intel PCS     | Alternative when SEV-SNP unavailable   |
| **AWS Nitro**   | Docker → enclave; simplest ops              | AWS Nitro Enclaves                 | AWS           | Fastest demo; weaker sovereignty claim |

Prefer **SEV-SNP**: attestation root is the CPU vendor, not the cloud operator. Existing Rust binary runs inside a confidential VM with no code changes for basic isolation; attestation APIs are the additive work.

### Gap 2: Remote attestation

A third party asks: _Is this really clawql-cellrt vX, on genuine SEV-SNP, with these measurements?_ Hardware produces a signed report; the verifier checks it against AMD KDS / Intel PCS — **no trust in the operator**.

```rust
// crates/clawql-cellrt/cellrt-attestation/

pub struct TeeAttestation {
    pub report: AttestationReport,    // hardware-signed measurement
    pub cert_chain: Vec<Certificate>, // VCEK / TDX quote certs
    pub user_data: [u8; 64],          // cell_id || virtual_key_id || event_hash
}

impl TeeAttestation {
    pub async fn generate(cell_context: &CellContext) -> Result<Self> { /* … */ }
    pub fn to_jwt(&self) -> Result<String> { /* standard delivery */ }
}
```

**What the attestation proves:**

1. Binary measurement matches published cellrt (Cosign-aligned)
2. Genuine SEV-SNP / TDX processor
3. VM memory encrypted; hypervisor cannot read it
4. Cell-specific binding (session context in `user_data`)
5. Vault may release secrets only after verification

Fleet surface: `GET /attestation` returns the current report + cert chain for client-side verification.

### Gap 3: Attestation-gated secret release

AppRole alone trusts that the caller _has_ role credentials. TEE path: Vault (or verifier) releases secrets only after the attestation measurement matches the expected cellrt binary hash.

```text
Cell spawn
  → TeeAttestation::generate(cell_context)
  → Vault auth with attestation JWT + expected_measurement
  → Dynamic secrets + virtual key issued only if measurement matches
  → Modified binary → different measurement → no key → inert cell
```

Bootstrap (non-tee): AppRole remains. Tee-enabled: `attestationGatedVault: true`.

### Gap 4: GPU confidential computing (inference)

CPU TEE is incomplete if GPU memory is host-readable. NVIDIA H100/H200 Confidential Computing supports **composite attestation** (CPU TEE + GPU) with modest LLM overhead.

```text
Client verifies:
  1. CPU attestation (SEV-SNP / TDX) — unmodified cellrt
  2. GPU attestation (H100 CC) — measured model weights
  3. Binding — same workload across CPU + GPU
```

Minimum demo: SEV-SNP CPU only. Add GPU CC when sovereign inference needs hardware verification of weights/inputs.

---

## 3. Architecture

```text
Client / regulator
  │
  ├─ Verify CPU attestation (AMD KDS / Intel PCS)
  ├─ Verify GPU attestation (NVIDIA RIM) — optional
  └─ Encrypted channel (TLS; attestation-bound cert optional)
           │
           ▼
    clawql-tee enclave (SEV-SNP confidential VM)
      ├─ clawql-cellrt (memory encrypted by CPU)
      │    ├─ WASM capability sandbox (clawql-core.wasm)
      │    ├─ eBPF monitoring
      │    ├─ Virtual key (attestation-gated from Vault)
      │    ├─ WORM (LTX → bucket)
      │    └─ Air-gap QR export (optional display/printer)
      │
      └─ clawql-inference (optional GPU CC)
           ├─ Measured weights
           └─ Encrypted inference I/O
```

---

## 4. Zero-trust chain

Six links — each removes one trust assumption:

1. **Binary attestation** (Cosign + SEV-SNP measurement) — binary is exactly published cellrt
2. **WASM capability sandbox** — tools cannot exceed granted WIT imports at instantiation
3. **Per-call capability accounting (planned)** — WORM records `capabilitiesExercised[]`; success via undeclared ambient host power is a Gate 3 failure ([security-ontology knowledge loop](../security/security-ontology-knowledge-loop.md) §2.3)
4. **Attestation-gated virtual keys** — model access only after hardware verification
5. **WORM audit** (LTX, RPO=0) — every action recorded before ack
6. **QR air-gap transport** — audit reaches verifier on a channel the operator cannot influence ([spec](./clawql-tee-airgap-audit.md))
7. **GPU CC** — weights and inputs never exposed to the host

The attestation is only as interesting as what it attests. Attesting an agentic execution environment with capability-constrained tools and provable audit is the product claim — not “nginx is unmodified.”

---

## 5. `cellrt-attestation` crate

| Module              | Role                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `sev.rs` / `tdx.rs` | Firmware guest report APIs (`sev` crate / TDX quote)              |
| `kds.rs`            | Fetch VCEK / PCS cert chain                                       |
| `bind.rs`           | Pack `cell_id \|\| virtual_key_id \|\| event_hash` into user_data |
| `jwt.rs`            | Encode attestation JWT for Vault / clients                        |
| `endpoint.rs`       | `GET /attestation` on fleet HTTP                                  |
| `airgap.rs`         | Frame binding for QR export (see air-gap spec)                    |

---

## 6. Hardware requirements

| Need                        | Hardware                                             |
| --------------------------- | ---------------------------------------------------- |
| Working tee demo (CPU only) | One SEV-SNP instance (AWS/Azure/GCP)                 |
| Sovereign inference (GPU)   | H100/H200 CC + CPU TEE (e.g. AWS p5 / Azure ND H100) |
| Air-gap QR export           | Display (HDMI/serial/e-ink) or thermal printer       |

macOS/dev: no TEE — stub attestation; document non-production.

---

## 7. Helm (tee additions)

```yaml
cellrt:
  tee:
    enabled: false
    substrate: sev-snp # sev-snp | tdx | nitro
    attestationGatedVault: false
    expectedMeasurement: "" # pinned release measurement
    gpuCc:
      enabled: false
    airgapAudit:
      enabled: false
      # full keys: clawql-tee-airgap-audit.md
```

---

## 8. Build sequence (tee track)

| Phase | Work                                                 | Exit criteria                               |
| ----- | ---------------------------------------------------- | ------------------------------------------- |
| T0    | cellrt HTTP bootstrap (cellrt weeks 1–4)             | Cell spawn + WORM without TEE               |
| T1    | `cellrt-attestation` SEV-SNP report + `/attestation` | External verifier validates against AMD KDS |
| T2    | Vault attestation auth; pin expected measurement     | Tampered binary gets no virtual key         |
| T3    | Air-gap QR export + `clawql-tee-verifier`            | Regulator reconstructs Merkle chain offline |
| T4    | GPU CC composite attestation (optional)              | CPU+GPU binding verified                    |

---

## 9. Open questions

1. **Vault auth method.** Custom SEV-SNP plugin vs vault-plugin-secrets-tee / community methods — pick before T2.
2. **Measurement pinning.** How Cosign release digests map to SEV-SNP launch measurements in CI.
3. **Nitro as first demo.** Accept AWS root of trust for a faster T1, or insist on SEV-SNP from day one?
4. **Display path trust.** Compromised display driver can show false QR codes — document limitation; prefer TEE→display TCB when available ([air-gap §7](./clawql-tee-airgap-audit.md#7-threat-model-coverage)).

---

## Further reading

- [`docs/streams/clawql-cellrt.md`](./clawql-cellrt.md) — owned cell runtime
- [`docs/streams/clawql-tee-airgap-audit.md`](./clawql-tee-airgap-audit.md) — QR air-gap audit transport
- [`docs/streams/clawql-streams.md`](./clawql-streams.md) — event-driven agent sessions
- [`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md)
- AMD SEV-SNP · Intel TDX · NVIDIA Confidential Computing · HashiCorp Vault attestation patterns

---

_clawql-tee · Specification v0.1 · August 2026 · Draft_  
_Companion: clawql-cellrt · clawql-tee Air-Gap Audit Transport_
