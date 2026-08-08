# clawql-tee Air-Gap Audit Transport — Specification v0.1

**Status:** Draft · August 2026 · v0.1  
**Component:** `cellrt-attestation` · `cellrt-storage` · `clawql-tee-verifier` (standalone)  
**Depends on:** [`clawql-cellrt`](./clawql-cellrt.md) v0.1 · [`clawql-tee`](./clawql-tee.md) v0.1 · AMD SEV-SNP (or TDX) attestation

---

## 1. Problem

Even with SEV-SNP hardware attestation and LTX WORM trails, a paranoid threat model still has a gap: **audit data reaches the verifier over a network**. A compromised operator, cloud provider, or transit path could filter, modify, or delay events.

```text
Hardware (SEV-SNP) → Binary measurement → WORM entries → Network transport → Verifier
```

The first three links are cryptographically hardened. The fourth is not.

Air-gap audit transport replaces network delivery with a **physical unidirectional channel**: QR code sequences displayed inside the TEE boundary, scanned by a camera outside it. Information flows one way only. The channel cannot receive instructions. A compromised network stack cannot influence what the screen displays.

---

## 2. Transport model

### 2.1 Unidirectionality

```text
TEE boundary (SEV-SNP confidential VM)
  │
  │  Screen / printer
  │  ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
  │  QR codes (one-way physical channel)
  │  ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
  │  Camera (verifier device, outside TEE)
  │
Air gap
  │
  └─ Verifier device (may reach AMD KDS / Intel PCS on its own network)
       ├─ Reconstruct audit trail from QR sequence
       ├─ Verify Merkle chain
       ├─ Verify attestation against AMD KDS / Intel PCS
       └─ Emit verification certificate
```

No return channel. The air gap is structural, not policy.

### 2.2 What traverses the channel

Multiplexed in one sequence:

1. **WORM audit trail** — cell spawn, tool calls, inference calls, virtual key events, destruction; Merkle-linked
2. **TEE attestation report** — SEV-SNP/TDX report + cert chain
3. **Session binding** — cell ID, virtual key ID, event hash, RTP/OBT record hash

---

## 3. QR sequence format

### 3.1 Frame structure

```rust
#[derive(Serialize, Deserialize)]
pub struct AuditFrame {
    pub session_id: Uuid,
    pub frame_index: u32,           // 0-based, strictly sequential
    pub total_frames: u32,
    pub frame_type: FrameType,      // Header | AuditChunk | Attestation | SessionBinding | Footer

    pub payload: Vec<u8>,           // compressed (+ optional encrypted) chunk
    pub payload_hash: [u8; 32],     // SHA-256 of payload

    pub prev_frame_hash: [u8; 32],  // SHA-256 of previous frame; frame 0 = zeros
    pub chain_root: [u8; 32],       // running Merkle root through this frame

    pub hmac: [u8; 32],             // HMAC-SHA256; key from Header ephemeral
}

pub enum FrameType {
    Header,
    AuditChunk,
    Attestation,
    SessionBinding,
    Footer,
}
```

### 3.2 Header (frame 0)

```rust
pub struct HeaderPayload {
    pub cellrt_version: String,
    pub session_id: Uuid,
    pub cell_id: String,                // agent:{subscription_id}:{event_id}
    pub virtual_key_id: Uuid,
    pub session_start: DateTime<Utc>,
    pub session_end: DateTime<Utc>,
    pub total_audit_entries: u32,
    pub total_frames: u32,
    pub ephemeral_pubkey: [u8; 32],     // X25519 — verifier checks HMAC chain
    pub sequence_schema_version: u8,    // 1
}
```

Ephemeral key is generated per session inside the TEE. Verifier uses the public key to ensure frames were not interleaved from another session.

### 3.3 Payload encoding

1. WORM entries as **CBOR** (compact vs JSON)
2. **zstd** compress (typical 5–10× for structured logs)
3. Chunk target ~2 KB (QR v40 ECC M ≈ 2.3 KB binary)
4. Optional **ChaCha20-Poly1305** with session ephemeral key (confidentiality; integrity from Merkle/HMAC regardless)

**Target:** QR Version 40, Error Correction Level **M** (~15% recovery). Scan ~200–500 ms/frame with a good scanner.

### 3.4 Footer (last frame)

```rust
pub struct FooterPayload {
    pub final_merkle_root: [u8; 32],
    pub total_audit_entries_verified: u32,
    pub attestation_report_hash: [u8; 32],
    pub session_signature: [u8; 64],    // Ed25519 over final_merkle_root
                                        // ties to cellrt Cosign-verified identity
}
```

---

## 4. Display and scan protocol

### 4.1 Display (inside TEE)

```rust
// cellrt-attestation — airgap_display

pub async fn generate_sequence(session: &CompletedCellSession) -> Result<AirgapAuditDisplay> {
    let audit_entries = session.db.get_all_worm_entries().await?;
    let attestation = TeeAttestation::generate(&session.cell_context).await?;

    let mut builder = FrameSequenceBuilder::new(session.id);
    builder.add_header(session)?;
    builder.add_audit_chunks(&audit_entries)?;
    builder.add_attestation(&attestation)?;
    builder.add_session_binding(session)?;
    builder.add_footer()?;
    Ok(AirgapAuditDisplay::from_frames(builder.build()?))
}
```

Default hold: **500 ms/frame**. Optional IR/acoustic ACK advances early; without ACK, timer preserves the air gap (no network back-channel).

### 4.2 Display outputs

| Method            | Notes                                               |
| ----------------- | --------------------------------------------------- |
| **HDMI**          | Standard monitor on TEE VM — most practical         |
| **Serial**        | ASCII QR via console — headless                     |
| **E-ink**         | Slower refresh; persistent between frames           |
| **Thermal print** | Paper strip — physical artifact; scan later offline |

Thermal printer is especially useful for regulated workflows: regulator takes the printout, scans at leisure with `clawql-tee-verifier`.

### 4.3 Scan (outside TEE)

`clawql-tee-verifier` validates each frame:

1. Strictly sequential `frame_index` (gaps → reject / rescan)
2. `payload_hash` matches payload
3. `prev_frame_hash` links Merkle chain
4. HMAC under Header ephemeral key

On complete sequence:

1. Recompute Merkle root vs Footer
2. Verify SEV-SNP/TDX attestation against AMD KDS / Intel PCS (**from verifier device**, not from the TEE)
3. Verify Ed25519 session signature
4. Reconstruct WORM entries → `VerificationResult`

---

## 5. Frame count estimates

| Audit entries        | Compressed (est.) | Frames @ ~2 KB | Scan @ 500 ms/frame |
| -------------------- | ----------------- | -------------- | ------------------- |
| 50 (short)           | ~5 KB             | ~5             | ~2.5 s              |
| 200 (normal)         | ~20 KB            | ~15            | ~7.5 s              |
| 1,000 (long)         | ~80 KB            | ~50            | ~25 s               |
| 5,000 (heavy)        | ~350 KB           | ~200           | ~100 s              |
| 10,000 (full export) | ~650 KB           | ~375           | ~3 min              |

Plus ~10 frames overhead (Header, Attestation, SessionBinding, Footer). Attestation + cert chain ≈ 2 frames compressed.

Normal sessions: &lt; 10 s — acceptable for regulated audit. Large exports: prefer thermal printer.

---

## 6. Integration

### 6.1 Triggers

```rust
pub enum AuditExportTrigger {
    CellDestroyed,
    BudgetExhausted,
    SecurityAlertFired,
    RegulatorRequest { session_id: Uuid },
    PeriodExport { since: DateTime<Utc> },
    DailyExport { time: NaiveTime },
}
```

Regulated deployments may set `autoExportOnCellDestroy: true` so every session produces a QR (or printed) export.

### 6.2 Helm values

```yaml
cellrt:
  tee:
    enabled: false
    attestation: true
    airgapAudit:
      enabled: false
      displayOutput: hdmi # hdmi | serial | eink | thermal
      frameIntervalMs: 500
      ecLevel: M # L | M | Q | H
      autoExportOnCellDestroy: false
      encryptPayload: true
      thermalPrinter:
        enabled: false
        device: /dev/usb/lp0
```

### 6.3 CLI

```bash
# HDMI QR sequence for a completed session
clawql-cellrt audit export \
  --session-id agent:sub-abc123:event-001 \
  --output hdmi \
  --frame-interval-ms 500

# Thermal printer
clawql-cellrt audit export \
  --session-id agent:sub-abc123:event-001 \
  --output thermal \
  --printer /dev/usb/lp0

# Verifier device (outside TEE)
clawql-tee-verifier verify \
  --input scanned-frames.cbor \
  --expected-measurement sha256:abc123... \
  --amd-kds-endpoint https://kdsintf.amd.com
```

---

## 7. Threat model coverage

| Threat                                       | Without QR transport | With QR transport               |
| -------------------------------------------- | -------------------- | ------------------------------- |
| Compromised network modifies audit entries   | Undetected           | Merkle break — rejected         |
| Operator selectively filters events          | Undetected           | Frame gap — rejected            |
| Cloud provider replays old trail             | Partial (timestamps) | + session binding to event hash |
| TEE binary tampered                          | SEV-SNP measurement  | Same — attestation in sequence  |
| QR sequence from another session interleaved | N/A                  | HMAC / ephemeral key detects    |
| Partial scan                                 | N/A                  | Frame gap — rescan              |

**Out of scope / known limitation:** a threat actor who controls the display path (compromised display driver / GPU) could show false QR codes. Mitigate with TEE→display TCB when hardware allows; document as limitation otherwise. Verifier device trust is also out of scope (regulator's device).

---

## 8. Zero-trust story

```text
1. Binary attestation (Cosign + SEV-SNP)
2. WASM capability sandbox
3. Attestation-gated virtual keys
4. WORM audit (LTX, RPO=0)
5. QR air-gap transport          ← this document
6. GPU confidential computing
```

Each link removes one trust assumption. Together they remove the **operator** from the trust model — a regulated customer can verify the chain independently.

---

## 9. `clawql-tee-verifier` (standalone)

Runs on the regulator's device — **not** on ClawQL infrastructure:

```text
clawql-tee-verifier (Apache 2.0 binary)
  ├─ Camera input (phone / USB webcam / dedicated scanner)
  ├─ Frame decoder (CBOR + zstd + ChaCha20-Poly1305)
  ├─ Merkle chain verifier
  ├─ AMD KDS / Intel PCS client
  ├─ Attestation verifier
  ├─ Session signature verifier (Ed25519)
  └─ Verification certificate generator (e.g. signed PDF)
```

No ClawQL runtime dependency beyond the **expected measurement constant** pinned at cellrt release time (verifiable against Cosign attestation).

Ship separately from the cellrt binary so regulators can download and audit the verifier independently.

---

## Further reading

- [`docs/streams/clawql-tee.md`](./clawql-tee.md) — hardware TEE + attestation-gated secrets
- [`docs/streams/clawql-qr-stream-transport.md`](./clawql-qr-stream-transport.md) — 7th mcp-api-adapter surface + Streams `qr` source (generalizes this frame format)
- [`docs/streams/clawql-cellrt.md`](./clawql-cellrt.md) — owned cell runtime
- [`docs/streams/clawql-streams.md`](./clawql-streams.md) — WORM event types / session lifecycle
- [`docs/government/clawql-government.md`](../government/clawql-government.md) — auditor on-site QR export consumer
- [`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md)

---

_clawql-tee Air-Gap Audit Transport · Spec v0.1 · August 2026 · Draft_  
_Companion: clawql-cellrt Spec v0.1 · clawql-tee Spec v0.1_
