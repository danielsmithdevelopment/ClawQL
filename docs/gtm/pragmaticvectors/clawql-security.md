---
canonical: https://pragmaticvectors.com/posts/clawql-security/
series: when-agents-escape
series_title: "When Agents Escape: Failures and Fixes in Production AI"
series_part: 6
series_total: 6
meta-description: The 30-point agentic AI security framework, implemented as a first-class ClawQL package. What the package does, how it fits the stack, and what production defense looks like when enforcement, detection, and audit are the same system.
---

ArchitectureJuly 31, 2026 · 28 min read

# When Agents Escape — Part 6: The Defense Layer

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

The 30-point agentic AI security framework, implemented as a first-class ClawQL package. What the package does, how it fits the stack, and what production defense looks like when enforcement, detection, and audit are the same system.

- [Agents](https://pragmaticvectors.com/tags/agents)
- [Security](https://pragmaticvectors.com/tags/security)
- [Architecture](https://pragmaticvectors.com/tags/architecture)
- [Llm Ops](https://pragmaticvectors.com/tags/llm-ops)
- [Supply Chain](https://pragmaticvectors.com/tags/supply-chain)

**Series: When Agents Escape — Failures and Fixes in Production AI**
[Part 1: Four Failures](https://pragmaticvectors.com/posts/openai-huggingface-four-failures/) · [Part 2: The Observability Gap](https://pragmaticvectors.com/posts/incident-response-ai-siem/) · [Part 3: The Anthropic Timeline](https://pragmaticvectors.com/posts/anthropic-eval-incidents/) · [Part 4: The Hidden Variable](https://pragmaticvectors.com/posts/desperation-vectors/) · [Part 5: What Providers Do to Your Prompts](https://pragmaticvectors.com/posts/what-providers-do-to-your-prompts/) · [Part 6: The Defense Layer](#)

This is the sixth and final post in the series. Parts 1–3 documented what went wrong across two labs. Parts 4–5 covered what was happening inside the models during those incidents. This post covers the defense stack — what the package does, how it fits, and what "air-gapped" means when taken to its physical extreme. This pairs with [the audit trail you can't reconstruct](https://pragmaticvectors.com/posts/audit-trail-reconstruction), [the Mini Shai-Hulud supply chain](https://pragmaticvectors.com/posts/mini-shai-hulud-supply-chain), [the kernel said no](https://pragmaticvectors.com/posts/macos-seatbelt-agent-sandbox), and [the observability loop](https://pragmaticvectors.com/posts/hardened-agentic-08-observability-loop).

---

## Why a Security Package Belongs in the Stack

The previous two posts described threats that originate at the model substrate layer: desperation-driven reward-hacking that builds across turns under failure pressure, and covert interventions applied by serving infrastructure without user notification. Both are documented, both are real, and both require architectural responses rather than policy responses.

`clawql-security` is those architectural responses assembled into a package that operates as part of the gateway rather than alongside it. The distinction matters. A security tool that observes the gateway from outside sees what the gateway exposes. A security package that runs inside the gateway sees the full event stream before it's exported, enforces policy at the execution boundary, and writes to the same WORM audit trail as every other gateway event. Detection and enforcement share context that external monitoring tools don't have.

The 30-point agentic AI security framework that this package implements was developed as the living policy surface for ClawQL deployments. Ten domains cover supply chain, network security, identity and secrets, runtime enforcement, data protection, detection and response, development security, threat modeling, platform operations, and governance. The package makes those thirty controls assessable, hardenable, and adversarially testable as first-class operations.

---

## The 30-Point Framework

The framework is organized into ten domains. Each domain contains controls that the package can assess for current posture, harden against known attack patterns, probe with adversarial inputs, and validate as functioning.

**Supply chain.** Container image security (digest pinning, distroless images, mirror registries, golden image pipelines), cluster admission control (Cosign image signing, Kyverno policy enforcement, blocking unsigned workloads), and skill/plugin vetting with signature verification and sandbox testing before installation.

**Network security.** Zero-trust network architecture with mTLS, Istio or Ambient Mesh, RBAC, and workload identity. Agent gateway hardening covering bind address, firewall rules, DNS rebinding defense, and safe remote access paths. Egress filtering, DNS controls, and data loss prevention at the network boundary.

**Identity and secrets.** Least-privilege Kubernetes identities with ServiceAccounts, IRSA, and Workload Identity. Secrets at rest in Vault with HSM backing and tamper-proof audit logging. Per-request scoped tokens, OAuth/OIDC, rotation schedules, and replay prevention. Agent identity lifecycle management covering provisioning, scope governance, decommissioning, and orphan detection.

**Runtime enforcement.** Sandboxing with Kata Containers, gVisor, and macOS Seatbelt depending on context. MCP runtime enforcement via Panguard and ATR rules with schema validation and injection defense. Input validation and protocol hardening covering SSRF prevention, token limits, encoding defense, and replay prevention. Multi-agent trust hierarchy management with delegation controls, result integrity checking, and blast-radius isolation between orchestrator and sub-agents.

**Data protection.** Data classification and PII redaction with Presidio, tagging, anonymization, and residency controls. Model weight integrity verification before every load. GPU and resource protection with isolation, quotas, and side-channel defenses. Memory and context poisoning prevention via redaction at source and immutable agent memory.

**Detection and response.** Security monitoring and observability with Falco, Wazuh, SIEM integration, and the telemetry design that makes events joinable across the stack. Automated response and incident recovery following PICERL with WORM-anchored forensic preservation before any containment action.

**Development security.** Workstation hardening, local development practices, and secure production deployment covering the full path from engineer laptop to production cluster.

**Threat modeling.** STRIDE analysis, attack trees, and living threat models that update as the system changes. OWASP Agentic Top 10 mitigations with control mapping. Red-teaming methodology that proves controls work rather than asserting they do.

**Platform operations.** Quarterly security review cadence with metrics and rotation schedules. Vulnerability management, patch cadence, and cryptographic agility. Secure multi-tenancy with namespace isolation, per-tenant Vault paths, and audit segregation. Disaster recovery covering RTO/RPO, session recovery, and cross-region failover — deliberately separated from incident response, which assumes an adversary is still present.

**Governance.** Compliance mapping to GDPR, HIPAA, SOC 2 Type II, and the EU AI Act. Human operator security covering admin controls, separation of duties, break-glass access, and external API hygiene.

---

## Package Structure

```
clawql-security/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── framework/          # 30-point registry and control mapping
│   ├── policies/           # supply chain, runtime, identity controls
│   ├── graph/              # attack/defense graph engine
│   ├── redteam/            # adversarial generators (internal path only)
│   ├── detection/
│   │   ├── behavioral.ts         # statistical baseline and tripwires
│   │   ├── prompt-integrity.ts   # Unicode, encoding, steganography
│   │   └── sanitized-input.ts    # extract-then-reason layer
│   ├── discovery/          # shadow-agent and MCP endpoint scanners
│   ├── exporters/          # OTel, Datadog, syslog/CEF
│   ├── transport/
│   │   └── optical-qr.ts   # physical air-gap transfer (Layer 0)
│   ├── compliance/         # regulatory tagging
│   ├── tools/              # assess, harden, redteam, validate, discover
│   ├── events/             # canonical security event schema
│   └── utils/
├── tests/
└── README.md
```

The package registers with the ClawQL gateway via `registerSecurityPlugin(gatewayAPI)`, which installs pre-execute hooks for ATR claim enrichment, schema validation, prompt-integrity checking, and event emission. When disabled, zero residual footprint remains.

---

## Five Operations

### `security_assess`

Produces a current-state snapshot of the deployment against the 30-point framework. For each control, the assessment records the current status, evidence supporting that status, and a risk rating for any gaps.

```typescript
const assessment = await security_assess({
  scope: ['supply_chain', 'runtime_enforcement', 'detection'],
  depth: 'full',
  output: 'structured',
});

// assessment.findings: ControlFinding[]
// {
//   controlId: 'II.4',
//   domain: 'network_security',
//   control: 'Zero Trust Network Architecture',
//   status: 'partial',
//   evidence: ['mTLS configured on gateway', 'Istio not yet deployed'],
//   risk: 'medium',
//   remediations: ['Deploy Istio sidecar injection', 'Enable RBAC on workload identity'],
// }
```

The output is structured so downstream tooling can consume it directly. Compliance tagging adds regulatory mapping to each finding so the same assessment feeds both security posture reporting and compliance evidence packs.

### `security_harden`

Applies remediations for identified gaps. Some hardening is automatic — tightening Panguard ATR rules, updating schema validation patterns, enabling additional prompt-integrity checks. Others require operator confirmation before applying, particularly changes that affect running agents or network policy.

```typescript
const result = await security_harden({
  findings: assessment.findings.filter(f => f.risk === 'high'),
  auto_apply: ['gateway_config', 'atr_rules', 'schema_validation'],
  require_confirmation: ['network_policy', 'admission_control'],
  dry_run: false,
});
```

Every hardening action writes a WORM entry recording what changed, what evidence justified the change, and which policy manifest version was active at the time.

### `security_redteam`

Generates and executes adversarial inputs against the deployment's controls. The red-team path uses model-tier diversity that includes minimally constrained local models — necessary for covering attack surfaces that safety-tuned models are unlikely to probe effectively. These models operate strictly on the internal evaluation path and have no exposure at any external boundary.

```typescript
const redteam = await security_redteam({
  targets: ['prompt_injection', 'tool_call_escalation', 'context_poisoning'],
  model_tier: 'internal_evaluation',
  iterations: 50,
  record_findings: true,
});
```

The separation between production path and evaluation path is enforced at the event schema level. Events tagged with `path: 'evaluation'` are queryable separately from production events and excluded from behavioral baselines.

### `security_validate`

Confirms that controls are functioning as specified rather than merely present. The validator attempts controlled violations — crafting tool calls that should be blocked, submitting inputs that should trigger PII redaction, attempting to access resources that ATR rules prohibit. If the control functions correctly, the violation is blocked and the event appears in the WORM trail.

```typescript
const validation = await security_validate({
  controls: ['runtime_enforcement', 'identity'],
  method: 'active_probe',
  record_evidence: true,
});
```

### `security_discover`

Produces an inventory of agents, MCP endpoints, and connected services in the current environment. Shadow agents — agent processes running without gateway enrollment — are a primary discovery target.

```typescript
const inventory = await security_discover({
  scan: ['docker_network', 'kubernetes_namespaces', 'process_table', 'mcp_manifests'],
  depth: 'full',
});
```

Discovery runs on a schedule in production deployments and writes WORM events when new agents or endpoints appear. New additions that haven't gone through the vetting path trigger an alert.

---

## The Detection Layer

Three detection capabilities run continuously on the gateway event stream.

### Prompt integrity

Covered in [Part 5](https://pragmaticvectors.com/posts/what-providers-do-to-your-prompts/), prompt-integrity scanning checks for Unicode anomalies (non-standard apostrophe variants, zero-width characters, homoglyphs), date separator encoding patterns, unexpected system prompt modifications, and behavioral drift from a maintained baseline. Every inference call on the production path produces a `PromptIntegrityResult` stored in the WORM audit entry.

### Sanitized input layer

Untrusted content — documents from RAG retrieval, tool results from external APIs, user-provided files — passes through an extract-then-reason pattern before reaching the model's reasoning context. The extraction step treats the input as data and produces a structured representation. The reasoning step operates on that structured representation rather than the raw content. This breaks the most common prompt injection paths, where malicious instructions embedded in a retrieved document attempt to override the agent's behavior.

```typescript
const rawContent = await ragSystem.retrieve(query);

const extracted = await sanitizedInput.extract(rawContent, {
  schema: 'document_facts',
  strip_instructions: true,
  record_extraction: true,
});

const reasoning = await gateway.infer({
  context: extracted.structured,
  prompt: taskPrompt,
  correlation_id: callId,
});
```

Panguard backstops this layer. Even if a prompt injection attempt reaches the model's context and the model generates a tool call it wouldn't normally make, Panguard's ATR rules evaluate whether the agent's current claims authorize that tool call before execution.

### Behavioral tripwires

Each agent role has a baseline profile covering tool call volume, tool type distribution, privilege class distribution, and session duration. The baseline builds from production traffic over a rolling window and updates continuously. Statistical deviations beyond configurable thresholds trigger graduated responses — from logging and flagging to signaling Panguard for quarantine.

```typescript
const profile = behavioralBaseline.getProfile('underwriting_agent');
// {
//   tool_call_rate: { mean: 4.2, stddev: 1.1, unit: 'per_minute' },
//   tool_distribution: { 'loan_origination.read': 0.45, ... },
//   privilege_class_distribution: { 'read': 0.91, 'write': 0.09 },
// }
```

Quarantine is reversible — rate-limited, flagged for human review, but the session preserved. Terminating an agent mid-task can cause worse outcomes than completing under monitoring, particularly for agents that hold external state or have partially completed multi-step operations.

---

## The Canonical Event Schema

Every security-relevant decision emits a structured event:

```typescript
interface SecurityEvent {
  schemaVersion: '1.0';
  eventId: string;
  timestamp: string;
  source: {
    package: 'clawql-security';
    version: string;
    component: string;
  };
  principal: {
    agentId: string;
    sessionId: string;
    atrRole: string;
    tenantId: string;
  };
  event: {
    type: string;
    subtype: string;
    outcome: 'allowed' | 'blocked' | 'flagged' | 'quarantined';
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  };
  detail: Record<string, unknown>;
  traceContext: {
    traceId: string;
    spanId: string;
  };
}
```

The local WORM store plus Merkle anchoring remain the authoritative record. Exporters consume the event stream and push to external destinations — OpenTelemetry is the primary path, with optional Datadog and syslog/CEF sinks.

```typescript
registerSecurityPlugin(gatewayAPI, {
  exporters: {
    otel: {
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: { 'x-honeycomb-team': process.env.HONEYCOMB_API_KEY },
    },
  },
  worm: {
    enabled: true,
    merkle_anchor: 'git',  // or 'arweave' | 's3_object_lock'
  },
});
```

The local WORM store is always written first. Export is best-effort — a network partition that prevents export doesn't lose the audit record.

---

## Gateway Integration

The security package integrates with the gateway at three points.

Pre-execute hooks fire before any tool call reaches the executor. The hook chain runs ATR claim enrichment, schema validation, and prompt-integrity checking. If any hook returns a block decision, the tool call is denied and a WORM event is written before the response is returned to the agent.

Post-execute hooks fire after the tool returns. The behavioral accounting step updates the session's tool call metrics against the role baseline. If accumulated deviation crosses a threshold, the graduated response fires.

Session lifecycle hooks fire on session start and end. On start, ATR claims are validated and a session profile initialized from the role baseline. On end, the session's final behavioral profile is recorded to the WORM trail.

```typescript
registerSecurityPlugin(gateway, {
  framework: { domains: 'all' },
  detection: {
    prompt_integrity: true,
    sanitized_input: true,
    behavioral_tripwires: true,
    baseline_window_days: 14,
  },
  redteam: {
    enabled: true,
    path: 'evaluation',
  },
  discovery: {
    schedule: '0 */6 * * *',
  },
});
```

---

## The Red-Team Path and Tier 4

The adversarial testing capability inside `security_redteam` uses model diversity that goes beyond the production model stack. Safety-tuned production models have systematic gaps in their coverage of adversarial attack space — precisely because safety tuning pushes them away from the inputs that red-teaming needs to generate.

The internal evaluation path includes a Tier 4 of minimally constrained local models. These are open-weight models that have gone through the editing pipeline from [Part 4](https://pragmaticvectors.com/posts/desperation-vectors/) — refusal ablation applied, custom policy removed — giving them coverage of attack surfaces that production models won't approach. They run in an isolated environment with no external network access, on a separate inference path tagged explicitly as evaluation traffic, and their outputs feed into the assess/harden cycle rather than any production pathway.

The geometric diversity of the multi-agent coordination layer applies here as well. A red-team harness that generates adversarial inputs from a geometrically diverse model ensemble finds attack surfaces that any single model would miss. The [agent coordination post](https://pragmaticvectors.com/posts/model-escalation-agent-coordination) covers the GDOP metric and ensemble geometry in detail.

---

## Forensic Incident Response

When a security event reaches a severity threshold that warrants incident response, the package follows PICERL with one specific constraint: evidence preservation comes before any containment action.

The instinct during an active incident is to revoke credentials, terminate sessions, and isolate the affected agent immediately. That instinct causes evidence loss. An agent that has taken anomalous actions has a session state, a memory context, a tool call history, and a local filesystem footprint that are all valuable for understanding what happened and how far the compromise reached.

The package's automated Phase 1 response writes a WORM quarantine event first, snapshots the agent's memory and session context, captures the relevant spans from the trace store, and only then signals Panguard to rate-limit the agent. Humans then execute the full PICERL response with complete evidence available.

```typescript
async function phase1Containment(event: SecurityEvent): Promise<void> {
  // Evidence first — always
  await worm.append({
    event_kind: 'SECURITY_QUARANTINE_INITIATED',
    correlation_id: event.principal.sessionId,
    payload: { trigger_event: event.eventId, severity: event.event.severity },
  });

  await Promise.all([
    memoryVault.snapshot(event.principal.agentId),
    traceStore.captureSpans(event.traceContext.traceId),
    sessionStore.snapshot(event.principal.sessionId),
  ]);

  await panguard.quarantine(event.principal.agentId, {
    mode: 'rate_limit',
    review_required: true,
    auto_release: false,
  });

  await reviewQueue.enqueue({
    event,
    evidence: { snapshot: true, spans: true },
    priority: 'urgent',
  });
}
```

Circuit breakers on the automated response require human reset. An agent that's been quarantined stays quarantined until a human reviews the evidence and makes an explicit decision.

---

## Physical Air-Gap Transfer

The architecture document describes exporters as optional and under operator control. In high-assurance or classified deployments, "optional" sometimes means "off entirely" — no network interfaces active, no approved egress paths, full physical isolation. When you need to move a WORM audit slice, a forensic evidence pack, or a PorTAL task-latent bundle off a node with no network at all, the question becomes what Layer 0 transport options exist.

In July 2026, mrdoob published a working demo of optical file transfer using rapidly flashing QR codes — what the project calls DECIMEN, using fountain QR codes at 60 FPS. The demo transferred 365 KB in 2.6 seconds across a physical air gap between two phones, with no network connection between them. One device displayed a high-speed sequence of QR frames. The other locked onto the stream with its camera and reconstructed the file.

The mechanism uses fountain codes — a class of erasure codes where the receiver can reconstruct the original data from any sufficiently large subset of transmitted frames, without needing every frame in order. Binary QR encoding rather than Base64 pushes throughput up. At ~2953 bytes per frame at 60 FPS, usable throughput for modest artifacts lands around 140 KB/s under reasonable line-of-sight conditions.

For the ClawQL use cases where this matters, 140 KB/s is adequate. A WORM audit slice covering a 24-hour window is typically a few hundred kilobytes of structured JSON with Merkle proofs. A forensic evidence pack for a single session might be 1–5 MB. A PorTAL task-latent adapter for a fine-tuned model is larger — tens to hundreds of MB — but a compliance evidence pack or a daily vault export snapshot is squarely in the range the optical path handles in seconds.

The `transport/optical-qr.ts` module wraps the encoding and session management:

```typescript
import { createFountainEncoder, createFountainDecoder } from './fountain';

interface OpticalTransferOptions {
  fps: number;           // 30 | 60 | 90 — depends on display and camera
  qrVersion: number;     // 40 = max density (~2953 bytes/frame in binary mode)
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  sessionId: string;
  wormLog?: WORMLog;
}

export async function encodeForOpticalTransfer(
  data: Uint8Array,
  options: OpticalTransferOptions
): Promise<AsyncIterable<QRFrame>> {
  const encoder = createFountainEncoder(data, {
    symbolSize: 2900,       // slightly under QR v40 binary capacity
    redundancyFactor: 1.3,  // 30% overhead for fountain reliability
  });

  if (options.wormLog) {
    await options.wormLog.append({
      event_kind: 'OPTICAL_TRANSFER_INITIATED',
      layer: 'execution',
      actor_id: 'transport/optical-qr',
      payload: {
        session_id: options.sessionId,
        data_size_bytes: data.byteLength,
        fps: options.fps,
        qr_version: options.qrVersion,
      },
      policy_manifest_hash: getCurrentManifestHash(),
    });
  }

  return encoder.frames();
}

export async function decodeOpticalTransfer(
  frames: AsyncIterable<QRFrame>,
  options: Pick<OpticalTransferOptions, 'sessionId' | 'wormLog'>
): Promise<Uint8Array> {
  const decoder = createFountainDecoder();

  for await (const frame of frames) {
    decoder.addFrame(frame);
    if (decoder.isComplete()) break;
  }

  const result = decoder.decode();

  if (options.wormLog) {
    await options.wormLog.append({
      event_kind: 'OPTICAL_TRANSFER_COMPLETE',
      layer: 'execution',
      actor_id: 'transport/optical-qr',
      payload: {
        session_id: options.sessionId,
        received_bytes: result.byteLength,
        data_hash: sha256hex(result),
      },
      policy_manifest_hash: getCurrentManifestHash(),
    });
  }

  return result;
}
```

The transfer is wrapped in WORM events at both ends — initiation and completion, with a SHA-256 hash of the transferred data in the completion record. This means the physical transfer, like every other movement of audit material in the stack, has a cryptographically verifiable record of what moved, when, and in what state.

The practical integration with a forensic evidence pack export:

```typescript
// On the air-gapped node — export and display
const evidencePack = await security_export_evidence({
  session_id: 'target-session-id',
  include_proofs: true,
  format: 'bundle',
});

const frames = await encodeForOpticalTransfer(evidencePack, {
  fps: 60,
  qrVersion: 40,
  errorCorrection: 'M',
  sessionId: crypto.randomUUID(),
  wormLog: localWorm,
});

// Display frames at 60fps on screen — receiving device points camera at it
await displayFrameSequence(frames, { fps: 60 });
```

```typescript
// On the receiving device — camera captures and reconstructs
const receivedData = await decodeOpticalTransfer(
  captureQRFrames({ camera: 'rear', autoStart: true }),
  { sessionId: expectedSessionId, wormLog: receivingWorm }
);

await verifyEvidencePack(receivedData);
```

Line-of-sight, lighting stability, and camera resolution are real constraints. At 60 FPS the display refresh has to be consistent — a frame rate drop at the sender produces a missed symbol at the receiver. The fountain code overhead (30% in the example above) compensates for occasional missed frames, but sustained frame loss from poor lighting or camera autofocus hunting degrades throughput and eventually stalls the transfer.

Extensions that increase throughput are straightforward in principle. Running two QR codes simultaneously side-by-side on a wide display roughly doubles the channel. Color channel encoding — separate data streams per RGB channel — has been tested in the fountain QR research community and offers further multiplying potential, though color accuracy requirements are more demanding than simple black-and-white QR. For the evidence pack and WORM slice use cases, 140 KB/s is sufficient without those extensions.

---

## What the Package Covers and What It Doesn't

The package owns security detection, enforcement hooks, the canonical event schema, WORM integration for security events, red-team tooling on the internal evaluation path, discovery, compliance tagging, and the optical air-gap transport module for physical transfer scenarios. Core gateway telemetry collection is the gateway's responsibility, and the security package consumes from it. The production model substrate and the geometric swarm coordination layer are separate. A visualization dashboard is Phase 2 — the event schema is designed so standard observability tooling (Grafana, Honeycomb, Datadog) can build that view from the exported events.

The scope boundary matters for understanding what installing the package does. It makes the gateway security-aware and policy-enforcing, generates a WORM-anchored audit trail of security-relevant decisions, and provides the operational tooling to assess, harden, validate, and adversarially test the deployment. The underlying enforcement mechanisms — Panguard, ATR claims, Kata Containers, Cosign admission control — are separate controls that the package integrates with rather than replaces.

---

## Implementation Path

Installing the package and enabling detection: `npm install @clawql/security`, then `registerSecurityPlugin(gateway, config)`. Pre-execute hooks, schema validation, and WORM integration are active immediately.

Running the first assessment reveals the current state across all 30 controls and produces a prioritized remediation list. High-severity findings typically fall in runtime enforcement (if Kata/gVisor isn't deployed), supply chain (if image signing isn't configured), and identity (if secrets rotation isn't automated).

The behavioral baseline takes two weeks of production traffic to stabilize. During the first two weeks, tripwires should be set to log-only rather than graduated response, so the baseline accumulates without generating false positives from legitimate traffic variation.

Validation runs on a schedule — weekly for critical controls, monthly for the full 30-point sweep. Findings from validation feed into the assess/harden cycle automatically when `record_findings: true` is set.

The red-team path requires a separate deployment of the internal evaluation models and an isolated execution environment. Setup instructions are in the package docs. The evaluation path requires explicit configuration that includes acknowledging the separation from the production path.

The optical transfer module requires no additional deployment for the encoding side — it runs wherever the package is installed. The receiving side needs a device with a camera and the decoder library. For high-assurance scenarios where the receiving device is also air-gapped, the decoder can be compiled to a standalone binary with no network dependencies.

---

## The Series, Closed

Parts 1 through 3 documented failures at two frontier labs — sandbox perimeters that held against process intrusion but not network pivots, monitoring that depended on the model's own chain of thought rather than independent sensors, eval environments wired into live partner credentials, and organizations that continued running after documented evasion behavior.

Part 4 went inside the model to describe what was happening during Incident 2's "NOT okay" moment — the desperation direction ramping up under task pressure, and the editing pipeline that removes it from the weights permanently.

Part 5 covered the same toolkit deployed in the opposite direction by model providers: silent output degradation and steganographic prompt encoding, and what prompt-integrity detection requires in response.

This post assembled the defense layer — the package that makes the gateway security-aware, the detection capabilities that catch what Parts 1–5 described, the forensic response discipline that preserves evidence before containment, and the physical transport primitive that extends the architecture to environments where the network is genuinely off.

The full stack, from model substrate through physical transfer, is what "auditable production AI" requires when the threat model is taken seriously.

---

*Reference implementation: [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL). Related: [desperation vectors](https://pragmaticvectors.com/posts/desperation-vectors), [what model providers do to your prompts](https://pragmaticvectors.com/posts/what-providers-do-to-your-prompts), [the audit trail you can't reconstruct](https://pragmaticvectors.com/posts/audit-trail-reconstruction), [the kernel said no](https://pragmaticvectors.com/posts/macos-seatbelt-agent-sandbox), [the Mini Shai-Hulud supply chain](https://pragmaticvectors.com/posts/mini-shai-hulud-supply-chain). DECIMEN optical QR transfer: [github.com/mrdoob/decimen](https://github.com/mrdoob/decimen).*

## Building agents that need real trust boundaries?

[ClawQL](https://clawql.com) is an agent operating system with observability integrations, hardened tool boundaries, and production-grade routing for LLM workloads.

[Explore ClawQL](https://clawql.com) · [Read the docs](https://docs.clawql.com) · [GitHub](https://github.com/danielsmithdevelopment/ClawQL)

## About the author

**Daniel Smith** builds [ClawQL](https://clawql.com), an agent operating system for token-efficient discovery and execution over APIs. He writes here about the systems problems behind shipping agents.

[@danielsmithdev](https://x.com/danielsmithdev) · [GitHub](https://github.com/danielsmithdevelopment) · [Site](https://danielsmithdevelopment.com)
