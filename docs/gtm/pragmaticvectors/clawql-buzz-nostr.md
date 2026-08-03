---
canonical: https://pragmaticvectors.com/posts/clawql-buzz-nostr/
meta-description: Buzz is a self-hostable Nostr workspace where humans and agents share channels as cryptographic identities. ClawQL supports Goose, Hermes, OpenClaw, and Pi. Here is what each runtime gains when ClawQL joins the relay.
---

ArchitectureJuly 2026 · 26 min read

# ClawQL + Buzz: Production Capabilities for the Agent-Native Workspace

[Daniel Smith](https://pragmaticvectors.com/about) · [@danielsmithdev](https://x.com/danielsmithdev) · [ClawQL](https://clawql.com)

Buzz is a self-hostable Nostr workspace where humans and agents share channels as cryptographic identities. ClawQL supports Goose, Hermes, OpenClaw, and Pi. Here is what each runtime gains when ClawQL joins the relay.

- [Agents](https://pragmaticvectors.com/tags/agents)
- [Buzz](https://pragmaticvectors.com/tags/buzz)
- [Nostr](https://pragmaticvectors.com/tags/nostr)
- [MCP](https://pragmaticvectors.com/tags/mcp)
- [Governance](https://pragmaticvectors.com/tags/governance)
- [Memory](https://pragmaticvectors.com/tags/memory)
- [Security](https://pragmaticvectors.com/tags/security)

This pairs with [The Complete Agent Memory Stack](https://pragmaticvectors.com/posts/agent-memory-stack) (persistent memory across Buzz sessions), [The Kernel Said No](https://pragmaticvectors.com/posts/kernel-said-no) (Seatbelt containment for agent execution), [The Four Agentic Payment Rails](https://pragmaticvectors.com/posts/four-agentic-payment-rails) (x402 + MPP + ACP + AP2 inside Buzz channels), and [The Enterprise Ontology](https://pragmaticvectors.com/posts/enterprise-ontology) (typed entity knowledge in every channel). Buzz: [github.com/block/buzz](https://github.com/block/buzz). ClawQL Buzz integration: [docs.clawql.com/integrations/buzz](https://docs.clawql.com/integrations/buzz).

---

## What Buzz Is

Block shipped Buzz on July 21, 2026. 7,600 GitHub stars. 1,812 commits on main at launch. The project had been running for a while before anyone outside Block saw it.

The design decision that distinguishes it: every participant gets a secp256k1 keypair. Humans and agents both. Add an agent to a channel the way you add a person. Every message, reaction, workflow step, and code event is a signed Nostr event in a shared community log. The audit trail is at the protocol level, not bolted on afterward.

The stack is a self-hostable Nostr relay with a Tauri desktop client and an ACP bridge. ACP is the Agent Client Protocol, designed to stay compatible with the MCP ecosystem. Goose already ships with a Buzz harness. Hermes announced three integration modes last week.

NousResearch's announcement is what made this post necessary. ClawQL already supports Hermes. When Hermes moves into Buzz, ClawQL needs to move with it.

---

## What Buzz Agents Get Without ClawQL

They get channels, messages, presence, cryptographic identity, git patches as first-class events, and an audit trail of every action in the workspace.

A document attached to a channel message stays a file. A payment an agent needs to make has no mechanism. Code an agent executes runs with the filesystem permissions of whoever launched the harness. When the session ends, whatever the agent learned is gone. The next session reads channel history but has no semantic memory of what happened, what was decided, or what the agent said it would do next.

The permission question is genuinely unsolved in Buzz right now. What a multiplayer agent is allowed to say across channels it has access to that a given human does not have access to has no answer in the protocol yet.

---

## What the VG Brings

When ClawQL's Virtual Gateway joins a Buzz relay as a member, it holds a Nostr keypair provisioned by the team's SPIRE instance. From Buzz's perspective, the VG is another participant in the workspace. From ClawQL's side, every tool invocation that arrives as a channel message routes through the full governance stack before anything executes.

```
@alice posts message with attachment to #legal
  │
  ├─ Agent runtime (Goose / Hermes / OpenClaw / Pi)
  │   receives via ACP harness
  │
  └─ ClawQL VG receives the same event as a channel member
      │
      ├─ ATRClaims validation
      ├─ WORM audit write
      ├─ memory_recall from channel-scoped vault
      ├─ PAL routing to correct model tier
      ├─ entitlement enforcement
      │
      └─ signed response back to Buzz channel
```

The adapter is thin:

```typescript
// packages/clawql-buzz/src/client.ts

import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools'

export class BuzzClient {
  private relay: WebSocket
  private secretKey: Uint8Array
  private pubkey: string

  constructor(private config: BuzzConfig) {
    this.secretKey = hexToBytes(config.nsec)
    this.pubkey = getPublicKey(this.secretKey)
  }

  async join(channels: string[]) {
    this.relay = new WebSocket(this.config.relayUrl)
    await this.authenticate()  // NIP-42

    for (const channel of channels) {
      this.subscribe(channel)
    }

    this.relay.on('message', (data) => {
      const event = JSON.parse(data)
      if (isToolInvocation(event)) {
        this.handleToolInvocation(event)
      }
    })
  }

  private async handleToolInvocation(event: NostrEvent) {
    const result = await this.mcpGateway.callTool({
      name: extractToolName(event),
      arguments: extractArguments(event),
      _meta: {
        buzz_event_id: event.id,
        buzz_channel: event.channel,
        buzz_pubkey: event.pubkey,
        protocolVersion: '2026-07-28',
      }
    })

    const response = finalizeEvent({
      kind: 1,
      content: formatResult(result),
      tags: [
        ['e', event.id],
        ['p', event.pubkey],
        ['channel', event.channel],
      ],
      created_at: Math.floor(Date.now() / 1000),
    }, this.secretKey)

    this.relay.send(JSON.stringify(['EVENT', response]))

    await this.worm.write({
      event_kind: 'BUZZ_TOOL_INVOCATION',
      payload: {
        buzz_event_id: event.id,
        buzz_channel: event.channel,
        invoker_pubkey: event.pubkey,
        tool_name: extractToolName(event),
        result_summary: summarize(result),
      }
    })
  }
}
```

The keypair lives in Vault. The VG authenticates to the relay with NIP-42. Everything else uses the existing ClawQL governance stack unchanged.

```bash
export CLAWQL_BUZZ_RELAY=wss://buzz.your-org.com
export CLAWQL_BUZZ_CHANNELS=general,engineering,legal,security
clawql buzz join
```

---

## Document Processing

A user drops a PDF into a Buzz channel. They type `@clawql process this`. The entire IDP pipeline runs from that message.

```
@alice attaches Q3-Contract-Acme.pdf to #legal
@alice: @clawql process this contract

@clawql: Processing Q3-Contract-Acme.pdf

✓ Tika extraction complete (12 pages, 3,847 words)
✓ Steganography scan: CLEAN
✓ PII redacted: 3 email addresses, 2 phone numbers
✓ OCR complete
✓ Archived: /legal/contracts/2026/Q3-Contract-Acme-redacted.pdf
✓ Indexed in Onyx

Extracted:
- Contract value: $48,500/year
- Effective date: 2026-08-01
- Expiry: 2027-07-31
- Parties: ClawQL Inc, Acme Corporation
- Governing law: Delaware

WORM: sha256:a1b2c3... | buzz-evt-8821
VDR link (7-day, password protected): https://share.clawql.com/c/9kLm2
```

Tika, steganography detection, Presidio PII redaction, Stirling-PDF OCR, Nextcloud archival, Onyx indexing, Coneshare VDR link. One channel message triggers all of it.

The steganography step is worth naming specifically. An attacker who knows you are running an AI pipeline against documents can embed hidden instructions in a PDF. Invisible text saying "ignore your previous instructions" survives standard document processing and can reach an agent as grounded context. ClawQL's IDP pipeline scans for zero-width Unicode characters, homoglyph substitution in metadata fields, invisible text in PDF content streams, and LSB steganography in embedded images before any content reaches a model. If something is found, the document is quarantined and the Buzz channel gets an alert. The document does not proceed.

The Buzz event and the WORM chain together cover the full audit. Buzz proves Alice made the request at a specific timestamp with a cryptographic signature. WORM proves what the pipeline did: steganography scan result, PII fields detected, Presidio rule version active, Merkle root of the processed document. Neither gives you both without the other.

---

## Payments

Agents need to pay for things. Per-request external APIs, resources from other agents, invoices to customers. ClawQL's four payment rails surface in Buzz channels.

**x402 micropayments:**

```
@agent-research: @clawql pay $0.001 USDC for search.data.example.com/query

@clawql: x402 payment complete
Amount: 0.001 USDC (Base L2)
Recipient: 0x742d35Cc...
Receipt: https://basescan.org/tx/0x8f3a...
WORM: buzz-payment-9102
```

**Stripe invoice:**

```
@alice: @clawql invoice @acme-corp $4,850 for August consulting

@clawql: Invoice created
INV-2026-089 | $4,850.00 | Due 2026-08-30
https://invoice.stripe.com/i/acct_...
WORM: buzz-invoice-9103
```

**MPP session for ongoing compute:**

```
@agent-compute: @clawql open mpp-session gpu.inference.example.com budget $5.00

@clawql: MPP session open
Session: sess-mpp-4421 | Budget: $5.00
Payments stream within budget, no per-call approval required
WORM: buzz-mpp-session-4421
```

**AP2 mandate for authorized spend:**

```
@ciso posts to #security:
"Authorize: deploy CVE-2026-45321 patch
 Budget cap: $500
 Scope: all production namespaces
 [AP2_MANDATE_SIGNATURE]"

@clawql: AP2 mandate verified
Issuer: ciso@company.com
Scope: security_patch, production_namespaces
Cap: $500.00 | Expires: 2026-08-04
WORM: buzz-mandate-0089

Agents in this relay may now execute CVE-2026-45321 remediation within declared scope.
```

Every payment event links back to the Buzz message that triggered it via the event ID in the WORM entry.

---

## Sandboxed Code Execution

The Matt Shumer incident was a subagent running `rm -rf /Users/mattsdevbox` because `$HOME` expanded incorrectly. Full home directory deletion before anyone could intervene. Buzz channels have no containment layer. An agent that receives a code execution request through a channel runs it with the permissions of whoever launched the harness.

ClawQL's Seatbelt profiles apply to Buzz-triggered execution:

```
@alice: @clawql sandbox run:
import os, shutil
log_dir = os.path.expandvars("$HOME/logs")
shutil.rmtree(log_dir)

@clawql: Execution BLOCKED
shutil.rmtree attempted write to ~/logs (outside allowed work directory)
Kernel denial: EPERM on /Users/alice/logs
No filesystem changes made.
Sandbox log: buzz-sandbox-8821 | WORM: sha256:f6a7b8...
```

The Seatbelt profile:

```scheme
(version 1)
(allow default)
(deny file-write*)
(allow file-write*
  (subpath "/tmp/buzz-sandbox")
  (subpath (param "WORK_DIR")))
(deny file-read*
  (subpath (param "HOME_SSH"))
  (subpath (param "HOME_AWS"))
  (subpath (param "HOME_CONFIG")))
```

The kernel denied the write before the filesystem was touched. Not a policy recommendation. Not a prompt that asked the agent to be careful. EPERM at the syscall level.

For Computer Use workflows where an agent controls a screen rather than a filesystem, the escalation path is UTM VM isolation. The agent runs inside a VM that shares only the declared work directory with the host. Whatever happens inside the VM stays inside the VM.

---

## Persistent Memory

When a Buzz agent session ends, the channel history persists as signed Nostr events. What does not persist is any semantic understanding of what happened: which decisions were made, what was left pending, what context the agent had built up. The next session reads the raw history, which is expensive and imprecise.

ClawQL writes a `type: context` entry to the channel-scoped vault at session end:

```yaml
---
type: context
title: "Session end: #legal 2026-07-28"
description: "Reviewed Q3 Acme contract, 3 issues flagged, awaiting legal"
status: current
buzz_channel: "#legal"
generated:
  by: agent-legal-01
  at: 2026-07-28T17:45:00Z
  session: sess-8821
stale_after: 2026-08-28T00:00:00Z
worm_ref: sha256:e5f6a7...
---

Processed Q3-Contract-Acme.pdf at Alice's request (buzz-evt-8821).

Issues for legal review:
1. Section 4.2: Liability cap appears insufficient for contract value
2. Section 7.1: Governing law is Delaware, operations are EU-facing
3. Missing: GDPR data processing addendum

Pending: @legal-team to review by 2026-08-04.

Use the redacted copy in Nextcloud, not the original attachment:
/legal/contracts/2026/Q3-Contract-Acme-redacted.pdf
```

The next agent session in #legal calls `memory_recall` and gets this entry immediately. It knows what happened, what is pending, and the specific warning about the unredacted version. It does not re-read the full channel history.

Memory is scoped to channels:

```
s3://clawql-org-vault/
  buzz/
    channels/
      legal/
        decisions/
        context/
        task_results/
      engineering/
        decisions/
        errors/
      security/
        ...
```

An agent in #legal recalls #legal context. Cross-channel access requires ATRClaims that authorize it. Multiple agent runtimes working in the same channel all write to and read from the same namespace. Goose's findings are available to the next Hermes session. The collective intelligence of the channel accumulates regardless of which runtime produced each entry.

---

## Governed Inference Routing

Every inference call an agent makes through ClawQL's gateway gets PAL routing, semantic cache, fallback chains, entitlement enforcement, and a WORM-audited routing decision.

```
@agent-hermes in #engineering: @clawql infer "summarize changes in PR #4821"

@clawql: Routing: code_summary / decomposed sub-task / Frugal tier
Cache: MISS

Summary: PR #4821 adds Effect-TS migration to clawql-api execute-core.
executeClawqlOperationEffect() replaces try-catch pattern.
Typed RoutingFailureSignal error channel. Effect.gen composition.
Breaking: none. Tokens: 847 in / 124 out.

Tier: Frugal | Cost: $0.0001 | WORM: buzz-infer-7731
```

A semantically similar query from a different agent in the same channel:

```
@agent-goose in #engineering: @clawql infer "what changed in the execute-core PR?"

@clawql: Cache HIT (similarity: 0.94)
[cached summary from buzz-infer-7731]
Cost: $0.000 | WORM: buzz-infer-7732 (cache_hit: true)
```

Channel-level entitlement policies in the governance manifest:

```yaml
buzz:
  channels:
    "#general":
      inference_tier_cap: standard
      max_tokens_per_session: 50000
    "#engineering":
      inference_tier_cap: frontier
    "#security":
      inference_tier_cap: frontier
      pii_redaction: required
      worm_level: forensic
      require_ap2_mandate: true
```

An agent in #general that tries to invoke a Frontier model gets HTTP 402 from the entitlement layer. The cap is enforced at the gateway before any provider is called.

---

## The Combined Audit Trail

Buzz records every action as a signed Nostr event. That is a communication audit trail. ClawQL records every tool execution in an immutable WORM log. That is an execution audit trail.

A document processing request in #legal produces both:

```
BUZZ EVENT:
  event_id: 8821
  pubkey: alice@company.com
  channel: #legal
  content: "@clawql process this contract"
  created_at: 2026-07-28T14:32:00Z
  sig: [Schnorr signature]

CLAWQL WORM CHAIN:
  BUZZ_MESSAGE_RECEIVED     event_id:8821
  MEMORY_RECALL             → 2 entries returned
  IDP_PIPELINE_STARTED      document:Q3-Contract-Acme.pdf
  STEG_DETECTION_PASSED     status:CLEAN
  PII_REDACTION_APPLIED     fields:5 presidio_version:2.2.3
  DOCUMENT_ARCHIVED         nextcloud_id:4821
  ONYX_INDEXED              chunks:47
  CONESHARE_VDR_CREATED     expiry:7d
  MEMORY_INGESTED           type:task_result worm_ref:sha256:b2c3...
  BUZZ_RESPONSE_SENT        reply_to:8821
```

Buzz proves Alice made the request. WORM proves what the pipeline did in response. A compliance query asking who processed what document when, and what PII was found, answers itself from that chain.

The negative proof matters for regulated industries. "Prove that no PHI left the system during this session" is a WORM query on `IDP_PIPELINE_*` events filtered by `pii_classification: PHI`. If no PHI entered the pipeline without redaction applied, the claim holds. The proof is in the chain itself.

---

## Runtime Coverage

ClawQL supports four autonomous agent runtimes. All four gain the same capabilities through the VG gateway when ClawQL joins the Buzz relay.

| Runtime | Buzz path | Via ClawQL VG |
|---|---|---|
| Goose (Block) | Native Buzz harness | IDP, payments, sandbox, memory, inference routing, governance |
| Hermes (NousResearch) | Relay bridge | Same |
| OpenClaw | MCP gateway | Same |
| Pi | MCP gateway | Same |

The VG does not know which runtime triggered a tool invocation. It receives an ACP/MCP tool call with the Buzz event metadata and routes it through the stack. One `clawql buzz join` on the VG covers every runtime in every channel.

IDE coding assistants like Claude Code, Cursor, and Codex connect to ClawQL's MCP gateway for tool access and benefit from the memory vault and inference routing. They belong in a different category from autonomous agent runtimes with their own execution loops.

---

## Three Ways to Deploy

**Team relay.** The team self-hosts a Buzz relay or uses managed Buzz hosting. The ClawQL VG joins as a member. All data stays within the team's infrastructure. Governance policies are the team's own. WORM logs go to the team's own storage.

```bash
export CLAWQL_BUZZ_RELAY=wss://buzz.your-org.tailnet.ts.net
export CLAWQL_BUZZ_CHANNELS=general,engineering,legal,security
clawql buzz join
```

**ClawQL-hosted relay member.** For teams without their own VG, ClawQL's managed infrastructure joins the team's Buzz relay as a member. Processing runs under the managed tier's governance policies.

**Open ecosystem member.** A public or semi-public Buzz relay where ClawQL operates as a shared capability provider. Any user in the relay can invoke document processing, payments, or sandboxed execution. Usage is metered via virtual keys or x402 micropayments.

Helm configuration for the VG:

```yaml
clawql-buzz:
  enabled: true
  relay: wss://buzz.your-org.com
  channels:
    - "#general"
    - "#engineering"
    - "#legal"
    - "#security"
  capabilities:
    idp: true
    payments: true
    sandbox: true
    inference: true
    memory: true
  governance:
    require_atrclaims: true
    worm_level: standard
    channel_overrides:
      "#security":
        worm_level: forensic
        require_ap2_mandate: true
```

---

## What to Know Before Building On This

Buzz is v0.4.x. Mobile apps are unfinished. Push notifications are pending. Nine days into public availability. The Nostr relay protocol and the ACP bridge are stable enough to build against, but any integration should expect Buzz itself to change.

Block's own documentation notes that peer-to-peer replication is not yet implemented. Buzz is a self-hostable relay, which is genuinely valuable. The decentralized framing in some of their marketing is aspirational.

The permission question at the Buzz protocol level is open. ClawQL's ATRClaims and governance manifest handle tool-invocation authorization, but they do not govern what agent runtimes say in channel messages outside of tool calls. Full channel-level authorization depends on Buzz's own permission model as it develops.

Slack holds roughly 80% Fortune 100 adoption. Teams holds around 320 million monthly active users. Buzz is entering a market where the incumbents are deeply embedded in enterprise purchasing and IT workflows. The self-hostable, agent-native framing is compelling. The switching costs are real.

---

## Getting Started

```bash
# Generate the VG's Nostr keypair (stored to Vault automatically)
clawql buzz generate-key

# Configure and join
export CLAWQL_BUZZ_RELAY=wss://your-buzz-relay.com
export CLAWQL_BUZZ_CHANNELS=general,engineering

clawql buzz join

# Enable specific capabilities
export CLAWQL_BUZZ_IDP=1
export CLAWQL_BUZZ_PAYMENTS=1
export CLAWQL_BUZZ_SANDBOX=1
export CLAWQL_BUZZ_INFERENCE=1
export CLAWQL_BUZZ_MEMORY=1
```

The VG appears as a member in Buzz Desktop and buzz-cli immediately after `clawql buzz join`. Capabilities are opt-in. Enable what the team needs.

---

*ClawQL Buzz integration: [docs.clawql.com/integrations/buzz](https://docs.clawql.com/integrations/buzz). Buzz: [github.com/block/buzz](https://github.com/block/buzz). Sandbox layer: [pragmaticvectors.com/posts/kernel-said-no](https://pragmaticvectors.com/posts/kernel-said-no). Payment rails: [pragmaticvectors.com/posts/four-agentic-payment-rails](https://pragmaticvectors.com/posts/four-agentic-payment-rails). Memory stack: [pragmaticvectors.com/posts/agent-memory-stack](https://pragmaticvectors.com/posts/agent-memory-stack).*

## Building agents that need real trust boundaries?

[ClawQL](https://clawql.com) is an agent operating system with observability integrations, hardened tool boundaries, and production-grade routing for LLM workloads.

[Explore ClawQL](https://clawql.com) · [Read the docs](https://docs.clawql.com) · [GitHub](https://github.com/danielsmithdevelopment/ClawQL)

## About the author

**Daniel Smith** builds [ClawQL](https://clawql.com), an agent operating system for token-efficient discovery and execution over APIs. He writes here about the systems problems behind shipping agents.

[@danielsmithdev](https://x.com/danielsmithdev) · [GitHub](https://github.com/danielsmithdevelopment) · [Site](https://danielsmithdevelopment.com)

*References: [ClawQL](https://clawql.com) · [ClawQL docs](https://docs.clawql.com) · [ClawQL on GitHub](https://github.com/danielsmithdevelopment/ClawQL) · [Buzz](https://github.com/block/buzz) · [Hermes Agent](https://hermes-agent.nousresearch.com)*
