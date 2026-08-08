# ClawQL QR Stream Transport — Specification v0.1

**Status:** Draft · August 2026 · v0.1  
**Components:** `mcp-api-adapter` (planned **7th surface**) · `clawql-streams` (`qr` source type) · `clawql-tee` / `clawql-tee-verifier`  
**Depends on:** [`clawql-tee-airgap-audit`](./clawql-tee-airgap-audit.md) v0.1 · [`clawql-streams`](./clawql-streams.md) v0.2 · [`mcp-api-adapter`](../mcp/mcp-api-adapter.md)  
**Related:** [`clawql-tee`](./clawql-tee.md) · [`clawql-government`](../government/clawql-government.md) · [`clawql-surveillance`](../surveillance/clawql-surveillance.md)

---

## 1. What this is

QR stream transport is the **seventh surface** in mcp-api-adapter and a new event source type in clawql-streams. It enables MCP communication and event streaming over a **physical optical channel** — QR codes on a screen, scanned by a camera — with no network connection required.

The other six surfaces (OpenAPI, GraphQL, Streamable HTTP `/mcp`, gRPC, gen-cli, WebSocket) assume a network. QR stream is for when there is no network, must not be one, or the channel must be physically verifiable and unidirectional.

| Property                         | Meaning                                                |
| -------------------------------- | ------------------------------------------------------ |
| **Unidirectional by default**    | Display → camera; no return channel required           |
| **Cryptographically verifiable** | Merkle chain, per-frame HMAC, optional TEE attestation |
| **Network-independent**          | Air gap is structural, not policy                      |
| **Physically auditable**         | Thermal printer → paper QR sequence, scan/verify later |

Frame format extends the [TEE air-gap audit](./clawql-tee-airgap-audit.md) `AuditFrame` with MCP and election payload types.

---

## 2. Transport modes

### 2.1 Unidirectional stream (primary)

```text
Air-gapped system (display only)
  │  QR frames (optical, one-way)
  ▼
External camera → clawql-streams QR source
  │
  └─ Agent DO / NATS buffer / WORM audit
```

Use cases: TEE audit export, voting machine ballot streaming, regulated financial export, industrial sensors, government auditor on-site export ([clawql-government](../government/clawql-government.md)).

### 2.2 Bidirectional (interactive MCP)

```text
Client device                         MCP server (air-gapped)
  │──── QR: tool call request ──────▶│ (server camera)
  │◀─── QR: tool call result ────────│ (server display)
```

Two screens, two cameras. Full MCP request/response over optical channel — slower than network, physically verifiable each step. Use cases: air-gapped KMS/HSM interaction, secure signing in isolated environments.

---

## 3. Frame format

```rust
#[derive(Serialize, Deserialize)]
pub struct QrTransportFrame {
    pub session_id: Uuid,
    pub frame_index: u32,
    pub total_frames: Option<u32>,      // None for continuous streams
    pub frame_type: QrFrameType,

    pub payload: Vec<u8>,               // CBOR + zstd + optional ChaCha20-Poly1305
    pub payload_hash: [u8; 32],
    pub prev_frame_hash: [u8; 32],
    pub chain_root: [u8; 32],
    pub hmac: [u8; 32],

    pub transport_version: u8,          // 1
    pub source_type: QrSourceType,      // Audit | Mcp | Election | Stream
}

pub enum QrFrameType {
    Header,
    McpRequest,
    McpResponse,
    AuditChunk,
    Attestation,
    StreamEvent,
    ElectionBallot,
    Footer,
    Heartbeat,
}
```

Encoding matches air-gap audit: CBOR → zstd → ~2 KB chunks → QR v40 ECC M; optional ChaCha20-Poly1305; Header carries ephemeral key for HMAC chain.

---

## 4. mcp-api-adapter — 7th surface

### 4.1 Provider interface

```typescript
interface QrStreamProvider {
  streamOutput(toolResult: McpToolResult, options: QrOutputOptions): AsyncIterable<QrFrame>;
  scanInput(camera: CameraDevice, options: QrInputOptions): AsyncIterable<McpToolCall>;
  streamEvents(
    events: AsyncIterable<StreamEvent>,
    options: QrOutputOptions
  ): AsyncIterable<QrFrame>;
}

interface QrOutputOptions {
  output: "hdmi" | "serial" | "eink" | "thermal" | "stdout";
  frameIntervalMs: number; // default 500
  ecLevel: "L" | "M" | "Q" | "H";
  encrypt: boolean;
  includeAttestation: boolean;
  thermalPrinter?: { device: string };
}

interface QrInputOptions {
  camera: string; // camera:/dev/video0 | rtsp://... | v4l2://...
  verifyMerkleChain: boolean;
  expectedMeasurement?: string;
  timeoutMs: number;
}
```

### 4.2 CLI (planned)

```bash
# Unidirectional: stream MCP tool results as QR on HDMI
npx mcp-api-adapter \
  --mcp-url http://127.0.0.1:8080/mcp \
  --qr-output hdmi --qr-mode stream --qr-frame-interval-ms 500

# Bidirectional
npx mcp-api-adapter \
  --mcp-url http://127.0.0.1:8080/mcp \
  --qr-output hdmi --qr-input camera:/dev/video0 --qr-mode bidirectional

# Thermal audit export
npx mcp-api-adapter \
  --mcp-url http://127.0.0.1:8080/mcp \
  --qr-output thermal --qr-printer /dev/usb/lp0 --qr-mode audit-export
```

Env: `CLAWQL_QR_OUTPUT`, `CLAWQL_QR_INPUT`, `MCP_API_ADAPTER_QR_*`.

### 4.3 HTTP surface (planned)

| Route                  | Role                                               |
| ---------------------- | -------------------------------------------------- |
| `GET /qr/session`      | Current QR session status                          |
| `GET /qr/frame/:index` | Frame as PNG (testing)                             |
| `POST /qr/scan`        | Submit scanned frame bytes (bidirectional)         |
| `GET /qr/stream`       | SSE of QR PNGs (**dev preview only**, not air-gap) |

WIT (cellrt WASM world): `import clawql:transport/qr-stream`.

---

## 5. clawql-streams — `qr` source type

```text
Air-gapped system (no network)
  │  QR stream (optical, out only)
  ▼
Camera → clawql-streams QrStreamSourceProvider
  ├─ Decode frames → verify Merkle → decode payload
  ├─ NATS publish + WORM entry
  └─ significance filter → Agent DO (memory_*, notify, execute…)
```

### 5.1 `stream_subscribe` example

```typescript
stream_subscribe({
  sourceType: "qr",
  device: "camera:/dev/video0",
  topic: "airgap.financial.audit",
  verifyMerkleChain: true,
  expectedMeasurement: "sha256:abc...", // optional TEE verify
  significance: {
    type: "pattern",
    path: "$.frameType",
    pattern: "AuditChunk|ElectionBallot|StreamEvent",
  },
  prompt: `Process air-gapped QR stream data. Verify Merkle integrity.
Ingest structured payloads; flag gaps / invalid proofs; notify #security-ops on failure.`,
  allowedTools: ["memory_ingest", "memory_recall", "notify", "audit"],
  auditLevel: "WORM",
});
```

### 5.2 Continuous stream batching

```typescript
significance: {
  type: "rate",
  count: 50,
  windowMs: 30000,
  immediatePatterns: ["MerkleChainBroken", "AttestationFailed", "InvalidProof"],
}
```

Batch normal frames; spawn immediately on anomalies.

---

## 6. Election module

End-to-end verifiable voting using **homomorphic encryption** + **ZK proofs**, with QR as air-gap transport and ClawQL as real-time verification/tally layer. Closest existing research systems: Helios, STAR-Vote, Microsoft ElectionGuard — ClawQL adds TEE attestation, QR transport, LTX/WORM, and Streams agents.

### 6.1 Machine-side flow

```text
Voting machine (clawql-tee, air-gapped)
  ├─ Voter authenticates locally
  ├─ Selects candidates
  ├─ Machine produces:
  │    ├─ E(vote) — ElGamal (or similar) ciphertext
  │    ├─ ZK proof — valid ballot, 1 vote/race, no reveal
  │    ├─ Commitment H(vote || nonce) — voter receipt
  │    └─ Ballot ID from commitment
  ├─ Paper printout — voter reviews plaintext + commitment; confirm or void
  └─ After polls close — QR stream:
       Header → ElectionBallot frames → Attestation → Footer
```

### 6.2 Ballot payload

```rust
pub struct ElectionBallotPayload {
    pub ballot_id: String,
    pub commitment_hash: [u8; 32],
    pub encrypted_ballot: ElGamalCiphertext,
    pub election_public_key_id: String,
    pub validity_proof: BallotValidityProof,
    pub proof_system: String,           // groth16 | plonk | bulletproofs
    pub precinct_id: String,
    pub ballot_style: String,
    pub cast_timestamp: DateTime<Utc>,  // no voter identity
    pub paper_verified: bool,
}
```

### 6.3 Observer Streams subscription

Agent verifies ZK proofs, checks duplicate commitments, updates **homomorphic running tally** (ciphertext multiply — never decrypts individuals), ingests public registry, WORM-audits every ballot. `allowedTools` exclude `execute` during ballot processing (no external side effects).

`E(v1) ⊕ E(v2) = E(v1 + v2)` — authority decrypts only the final aggregate.

### 6.4 What becomes provably harder

| Threat                 | Mitigation                               |
| ---------------------- | ---------------------------------------- |
| Remote hacking         | Air-gapped machine; no inbound network   |
| Software tampering     | TEE attestation + Cosign measurement     |
| Ballot stuffing        | ZK validity proofs rejected if malformed |
| Post-cast manipulation | Merkle + voter commitment receipt        |
| Vote suppression       | Public commitment list vs QR frame count |
| Individual vote reveal | Homomorphic + ZK (math, not policy)      |
| QR interception/mod    | Merkle + HMAC + TEE attestation          |

### 6.5 Honest limitations

1. **Voter interface** — crypto cannot detect display-A / encrypt-B; **paper review** is mandatory.
2. **Key ceremony** — who holds ElGamal shares is a trust question; prefer threshold decryption.
3. **ZK library correctness** — buggy proofs undermine the system; TEE proves certified code runs, not that the certification is bug-free.
4. **Physical perimeter** — air gap only as strong as custody and seals.
5. **Political context** — ClawQL provides infrastructure, not electoral policy; certification and law are out of band.

---

## 7. `clawql-tee-verifier` additions

```bash
clawql-tee-verifier verify-qr --input recording.mp4 --expected-measurement sha256:…
clawql-tee-verifier verify-qr --camera /dev/video0 --mode paper-scan
clawql-tee-verifier verify-election \
  --camera /dev/video0 \
  --election-public-key election-2026-key.json \
  --expected-measurement sha256:… \
  --output verification-certificate.pdf
```

Certificate includes session/Merkle status, TEE result, election ballot counts / proof ratio / aggregate ciphertext, verifier Cosign identity, timestamp.

---

## 8. Helm values (planned)

```yaml
mcpApiAdapter:
  qrTransport:
    enabled: false
    mode: stream # stream | bidirectional | audit-export
    output:
      device: hdmi
      frameIntervalMs: 500
      ecLevel: M
      encrypt: true
      includeAttestation: false
    input:
      device: ""
      verifyMerkleChain: true
      expectedMeasurement: ""

streams:
  sources:
    qr:
      enabled: false
      defaultDevice: ""
      verifyMerkleChain: true
      batchFrames: 50
      batchWindowMs: 30000

election:
  enabled: false # explicit opt-in
  electionPublicKeyPath: ""
  certifiedMeasurement: ""
  precinctId: ""
```

---

## 9. Positioning

| Surface                | Network | Role                                              |
| ---------------------- | ------- | ------------------------------------------------- |
| OpenAPI                | Yes     | REST / OpenAPI panels                             |
| GraphQL                | Yes     | GraphQL stacks                                    |
| Streamable HTTP `/mcp` | Yes     | IDE clients                                       |
| gRPC                   | Yes     | Mesh / protobuf                                   |
| gen-cli                | Build   | Shell / ops                                       |
| WebSocket              | Yes     | Real-time / DO hibernation                        |
| **QR stream**          | **No**  | **Air-gap, elections, regulated optical channel** |

First six connect anything over a network. The seventh connects air-gapped systems to the ClawQL agent surface over a physical channel with per-frame crypto and optional TEE binding.

**Challenge the Footage / legal evidence:** browser platforms that fingerprint recordings still trust platform servers. QR + TEE makes capture/export integrity hardware-verifiable and operator-independent — same underlying problem as government outcome records and surveillance evidence ([clawql-surveillance](../surveillance/clawql-surveillance.md)).

---

## Further reading

- [`docs/streams/clawql-tee-airgap-audit.md`](./clawql-tee-airgap-audit.md) — frame crypto shared with TEE audit
- [`docs/streams/clawql-tee.md`](./clawql-tee.md) — hardware attestation
- [`docs/streams/clawql-streams.md`](./clawql-streams.md) — event loop / significance
- [`docs/mcp/mcp-api-adapter.md`](../mcp/mcp-api-adapter.md) — six surfaces today
- [`docs/government/clawql-government.md`](../government/clawql-government.md) — auditor air-gap export consumer

---

_ClawQL QR Stream Transport · Spec v0.1 · August 2026 · Draft_  
_Companion: clawql-tee Air-Gap Audit · Streams v0.2 · mcp-api-adapter_
