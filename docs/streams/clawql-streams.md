# ClawQL Streams — Specification v0.1

**Status:** Draft · August 2026  
**Package:** `clawql-streams` (planned)  
**Depends on:** `clawql-web` · `clawql-inference` · `clawql-payments` · `clawql-ouroboros` · NATS JetStream  
**Related:** [`mcp-api-adapter`](../mcp/mcp-api-adapter.md) (MCP → APIs) · [Agentic Gateway](../inference/clawql-inference.md) · [Ouroboros](../ouroboros/)

---

## 1. What this is

ClawQL Streams is the event-driven autonomous agent execution layer for ClawQL. It extends the existing `schedule` tool pattern from time-based triggers to event-based triggers — arbitrary event sources fire, ClawQL processes them, and agents act without any human initiating the session.

This is the self-sovereign alternative to Anthropic Managed Agents and the generalizable version of what Stripe built internally with Minions: event-triggered agent subprocesses with full tool access, WORM audit on every action, and infinite scale via Durable Objects or Kubernetes HPA depending on deployment target.

Together with ClawQL Core (any protocol → MCP) and [`mcp-api-adapter`](../mcp/mcp-api-adapter.md) (MCP → any protocol), Streams completes the **Protocol Fabric**: MCP as the common intermediate representation, plus an event loop that can act on world events — not only interactive agent sessions.

---

## 2. Problem statement

Every major AI lab and enterprise running autonomous agents at scale has built the same thing independently:

- **Stripe Minions** — Slack reaction → context prefetch → Claude subprocess → PR. Custom internal build. ~500-tool MCP server (Toolshed) built from scratch. Goose fork. No sovereignty, no reuse outside Stripe.
- **Anthropic Managed Agents** — Cron/API trigger → Claude on Anthropic servers → built-in tools. Metered session-hour pricing. No operator-owned WORM audit. No sovereignty. Multi-agent coordination still research preview.
- **OpenAI Codex / Agents SDK** — Pipeline anomaly or API call → agent subprocess. Managed runtime. No sovereignty, no WORM Merkle trail, no multi-protocol surface.

All three implement the same logical pattern: **external event → context fetch → agent reasoning → tool execution → audit**. All three built it for themselves, for one trigger type, on their own infrastructure, with no sovereignty option.

ClawQL Streams is that pattern as a platform: any event source, any trigger type, WORM audit on every action, self-hosted or Cloudflare-deployed, infinite scale via DO or K8s HPA, full ClawQL tool surface available to every agent session.

---

## 3. Core architecture

### 3.1 The event loop

```text
Event source (WebSocket / NATS / webhook / cron / API call)
         │
         ▼
ClawQL Streams router (thin, stateless)
         │
         per event:
         ├─ publish to NATS JetStream (durable buffer)
         ├─ memory_ingest summary → WORM (audit trail, always)
         │
         └─ significance filter (local, fast)
                    │
                    ├─ below threshold: buffer only, no agent call
                    │
                    └─ above threshold:
                              │
                              ├─ spawn agent session
                              │    (claude -p / Anthropic API / inference gateway)
                              │
                              └─ agent has full MCP tool access:
                                   memory_recall · search · execute
                                   web_fetch · notify · workflow
                                   stream_read · memory_ingest
```

ClawQL is a long-running process. It can hold a WebSocket open, receive messages, and act — including `memory_ingest`, `notify`, or spawning `claude -p` — without waiting for an interactive MCP client. The MCP client-initiated limitation only applies when pushing _to_ Cursor/Claude Desktop; Streams is ClawQL acting as the event loop itself.

### 3.2 Three delivery modes

Every event source supports all three simultaneously:

| Mode           | Mechanism                                             | Best for                                      |
| -------------- | ----------------------------------------------------- | --------------------------------------------- |
| **Reactive**   | Event → `memory_ingest` → WORM immediately            | Audit trail, compliance, always-on recording  |
| **Ambient**    | Event → NATS buffer → delivered on next MCP tool call | Agent awareness without spawning a subprocess |
| **Autonomous** | Event → significance filter → agent subprocess        | Act on events without human initiation        |

Autonomous mode is the new capability. Reactive and ambient modes extend existing ClawQL behavior (WORM audit and NATS already ship).

### 3.3 Significance filter

Before spawning an agent subprocess, ClawQL runs a local significance check — fast, cheap, no model call. Only events that pass are escalated to autonomous execution. Everything still goes to NATS and WORM regardless.

Filter types (configurable per subscription):

- **Threshold** — numeric value crosses a boundary (price delta, error rate, queue depth)
- **Pattern** — event content matches a regex or JSON path expression
- **Rate** — N events within T seconds (burst detection)
- **Composite** — AND/OR of the above
- **Always** — every event spawns an agent (high-value, low-volume sources)
- **Never** — buffer and ambient delivery only (high-volume, audit-only sources)

### 3.4 Agent session

When the significance filter passes, ClawQL spawns an agent session:

```ts
// Internal — not user-facing API
const session = await agentSession({
  prompt: subscription.prompt,
  context: {
    event: summarizedEvent,
    vaultSnapshot: await memoryRecall(subscription.recallQuery),
    priorEvents: await streamRead(subscription.topic, { limit: 5 }),
  },
  model: subscription.model ?? "claude-sonnet-4-6",
  tools: subscription.allowedTools,
  maxTurns: subscription.maxTurns ?? 10,
  budgetTokens: subscription.budgetTokens ?? 8000,
  auditLevel: "WORM",
});
```

The agent has access to the full ClawQL MCP tool surface, scoped by ATR claims on the subscription definition. It cannot call tools outside its declared scope regardless of what the event content requests — same Panguard enforcement as interactive sessions.

After the session completes, the result is:

- Written to WORM with correlation to the triggering event
- Published to NATS (available for downstream consumers)
- Optionally: sent via `notify` to a Slack channel or webhook
- Optionally: passed to an Ouroboros loop for ensemble validation before action

### 3.5 Rate control

Event sources can fire faster than agent sessions can run. ClawQL Streams handles this at three layers:

- **Subprocess throttle** — maximum concurrent agent sessions per subscription. Above this, events buffer in NATS and process in order when capacity is available.
- **Batching** — accumulate N events or T seconds, then spawn one agent session with the batch.
- **Escalation** — if NATS buffer depth exceeds a threshold, spawn additional ClawQL replicas (K8s HPA) or additional DO instances (Cloudflare) to drain the backlog. Buffer depth is exposed on `/metrics` for Prometheus alerting.

---

## 4. Event sources

All event sources implement the `StreamSource` interface:

```ts
interface StreamSource {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  on(event: "message", handler: (msg: StreamMessage) => void): void;
  topic: string;
  sourceType: StreamSourceType;
}

type StreamSourceType =
  | "websocket"
  | "nats"
  | "webhook"
  | "cron" // existing schedule tool, unified here
  | "api_poll" // polling a REST endpoint on interval
  | "grpc_stream" // gRPC server streaming
  | "sse" // Server-Sent Events
  | "kafka" // optional, enterprise
  | "kinesis"; // optional, AWS regulated
```

### 4.1 WebSocket source

```ts
stream_subscribe({
  source: "wss://stream.example.com/events",
  topic: "market.AAPL",
  sourceType: "websocket",
  auth: { type: "bearer", tokenEnv: "STREAM_API_KEY" },
  prompt: "Analyze this price event. If delta > 2% notify #trading-desk.",
  recallQuery: "AAPL prior positions and thresholds",
  significance: {
    type: "threshold",
    path: "$.delta_pct",
    operator: ">",
    value: 1.0,
  },
  model: "claude-sonnet-4-6",
  maxTurns: 5,
  budgetTokens: 4000,
  allowedTools: ["memory_recall", "notify", "memory_ingest"],
  auditLevel: "WORM",
});
```

### 4.2 Webhook source

ClawQL exposes `POST /streams/webhook/{subscriptionId}` as an inbound HTTP endpoint. Any system that can POST JSON fires events into the subscription.

```ts
stream_subscribe({
  sourceType: "webhook",
  topic: "github.pr_merged",
  prompt: "A PR was merged. Update the vault with what changed and why.",
  significance: { type: "always" },
  allowedTools: ["memory_ingest", "web_fetch"],
});
// Returns: { webhookUrl: 'https://your-clawql/streams/webhook/sub_abc123' }
```

### 4.3 Cron source (existing `schedule` unified)

The existing `schedule` tool is a special case of `stream_subscribe` with `sourceType: "cron"`. Both interfaces remain valid; `schedule` continues to work unchanged. Internally both use the same fiber and WORM infrastructure.

### 4.4 NATS source

Subscribe to a NATS subject as an event source — useful when other ClawQL instances or external systems already publish to NATS:

```ts
stream_subscribe({
  sourceType: "nats",
  topic: "clawql.idp.document_processed",
  prompt: "A document finished processing. Ingest the extraction summary to vault.",
  significance: { type: "always" },
  allowedTools: ["memory_ingest", "knowledge_search_onyx"],
});
```

### 4.5 API poll source

Poll a REST endpoint on an interval, treating each changed response as an event:

```ts
stream_subscribe({
  sourceType: "api_poll",
  url: "https://api.example.com/status",
  intervalMs: 30000,
  topic: "system.status",
  changeDetection: "json_diff",
  prompt: "System status changed. If any service is degraded, notify #ops.",
  significance: { type: "pattern", path: "$.status", pattern: "degraded|down" },
  allowedTools: ["notify", "memory_ingest"],
});
```

---

## 5. MCP tools

`CLAWQL_ENABLE_STREAMS=1` (default on when any stream source is configured).

### Management tools

| Tool                             | Description                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `stream_subscribe`               | Create a subscription with source, prompt, significance filter, and tool scope |
| `stream_unsubscribe`             | Stop a subscription by ID                                                      |
| `stream_list`                    | List active subscriptions with status, event counts, and last-fire timestamp   |
| `stream_status`                  | Health and NATS buffer depth for a subscription                                |
| `stream_pause` / `stream_resume` | Temporarily suspend without destroying the subscription                        |

### Consumption tools

| Tool             | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| `stream_read`    | Read buffered events from NATS for a topic (manual drain)     |
| `stream_replay`  | Replay events from a time window (NATS JetStream replay)      |
| `stream_pending` | Return count of unread events across all active subscriptions |

### Ambient delivery

On every MCP tool call, if `CLAWQL_STREAMS_AMBIENT_DELIVERY=1`, ClawQL checks the NATS buffer for pending events and appends a `pendingStreamEvents` field to the tool response:

```json
{
  "result": { "...normal tool result..." },
  "pendingStreamEvents": [
    {
      "topic": "market.AAPL",
      "count": 3,
      "summaries": ["AAPL +2.3% on earnings beat", "volume spike 3.2x"],
      "lastEventAt": "2026-08-06T14:23:11Z",
      "subscriptionId": "sub_abc123"
    }
  ]
}
```

The agent decides whether to call `stream_read` for the full events or continue with its current task.

---

## 6. Scaling architecture

### 6.1 Cloudflare Durable Objects (hosted path)

Each subscription gets a DO instance. The DO holds the WebSocket connection, the NATS publisher, and the significance filter. When an event passes the filter, the DO either:

- Spawns a Claude API call inline (short, low-latency events)
- Publishes to a work queue DO that manages the subprocess pool

DO hibernation handles idle subscriptions — the connection stays alive (WebSocket hibernation API) but the DO sleeps between events, waking in milliseconds on message arrival.

```text
WebSocket source
       │
       ▼
Gateway Worker (stateless, routes by topic)
       │
       ▼
Subscription DO (one per subscription)
  ├─ WebSocket connection (hibernated between events)
  ├─ SQLite: subscription config, last event, buffer stats
  ├─ on message: significance filter
  │
  └─ above threshold:
          │
          ▼
     Agent DO (one per event, ephemeral)
       ├─ Claude API call
       ├─ MCP tool calls (back into ClawQL)
       ├─ WORM write + NATS publish
       └─ self-destructs
```

### 6.2 Kubernetes HPA (self-hosted path)

ClawQL deployment exposes a `clawql_streams_nats_consumer_lag` metric on `/metrics`. The HPA scales ClawQL replicas based on this lag — as events pile up, more replicas drain the NATS queue in parallel.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: clawql-streams-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: clawql-mcp-http
  minReplicas: 1
  maxReplicas: 50
  metrics:
    - type: External
      external:
        metric:
          name: clawql_streams_nats_consumer_lag
        target:
          type: AverageValue
          averageValue: "100"
```

Each replica picks up events from the NATS consumer group. NATS delivers each event to exactly one replica — no duplicate processing. The WORM write uses the Postgres backend when multiple replicas are active to avoid JSONL file conflicts.

### 6.3 Regulated / air-gapped path

Same as K8s HPA but:

- NATS runs inside the cluster (existing `nats.enabled: true` Helm value)
- No Cloudflare, no external NATS
- Model calls go to a self-hosted inference path via the inference gateway
- WORM writes to the internal Postgres instance
- Zero required external calls

| Environment            | Scaling mechanism                         |
| ---------------------- | ----------------------------------------- |
| Cloudflare-hosted      | DO per event, infinite scale, pay-per-use |
| Self-hosted cloud      | K8s HPA on NATS consumer lag              |
| Air-gapped / regulated | K8s HPA, internal NATS, no external calls |

Same `stream_subscribe` interface across all three. The deployment target determines which scaling backend fires.

### 6.4 Durable Objects and mcp-api-adapter

A DO instance is a natural home for one adapter wrapping one upstream MCP server: HTTP handler for OpenAPI/GraphQL/`/mcp`, WebSocket for DO-native persistent sessions, catalog cache in SQLite across hibernation wakes. **gen-cli** stays a build-time tool (disk writes do not map to DO). WebSocket as a sixth adapter surface matters in the DO context because hibernation is WebSocket-native — Streamable HTTP remains the fallback for clients that cannot do WebSocket. See [`docs/mcp/mcp-api-adapter.md`](../mcp/mcp-api-adapter.md).

---

## 7. Security model

### 7.1 ATR scoping on subscriptions

Every subscription declares its `allowedTools` — the set of MCP tools the agent session may call. Panguard enforces this on every tool call within the session. The event content cannot grant additional scope. Prompt injection in an event payload cannot cause the agent to call `execute` if `execute` is not in the subscription's `allowedTools`.

### 7.2 WORM on every event

Every event is written to WORM before any agent action. The payload is **hashed, not stored** — event content may contain PII or sensitive financial data. The hash proves the event existed and was processed without storing the data itself. Full event content goes to the NATS buffer (TTL-controlled) and optionally to a separate encrypted cold store.

```json
{
  "schemaVersion": "1.0",
  "eventId": "uuid",
  "timestamp": "...",
  "source": { "component": "clawql-streams", "subscriptionId": "sub_abc123" },
  "event": {
    "type": "STREAM_EVENT_RECEIVED",
    "topic": "market.AAPL",
    "significanceResult": "ABOVE_THRESHOLD",
    "agentSessionSpawned": true
  },
  "payloadHash": "sha256:..."
}
```

### 7.3 Budget caps

Every subscription declares `maxTurns` and `budgetTokens`. The agent session hard-stops when either is exceeded. For subscriptions tied to `clawql-payments` credits, `budgetUsd` replaces `budgetTokens` and the DeductionService holds credits before the session starts, releasing or capturing on completion.

---

## 8. Relationship to existing ClawQL packages

| Package            | Role in Streams                                                         |
| ------------------ | ----------------------------------------------------------------------- |
| `clawql-web`       | `WebSocketSourceProvider` — holds connections, receives messages        |
| `clawql-inference` | Runs the agent subprocess / API call for agent sessions                 |
| `clawql-memory`    | `memory_ingest` for WORM audit; `memory_recall` for context             |
| NATS JetStream     | Durable event buffer; consumer groups for K8s HPA                       |
| `clawql-payments`  | `DeductionService` for credit-gated agent sessions                      |
| `clawql-ouroboros` | Optional ensemble validation before kinetic actions                     |
| Panguard           | ATR enforcement on every tool call within agent sessions                |
| `clawql-audit`     | WORM writes for every event received and action taken                   |
| `mcp-api-adapter`  | MCP → OpenAPI / GraphQL / `/mcp` / gRPC / CLI (and DO-native WebSocket) |

`clawql-streams` is a thin coordination layer over these existing packages. Most of the implementation is wiring, not new code.

---

## 9. Protocol Fabric (why Streams + adapter matter together)

```text
Any input protocol
  CLI · OpenAPI · GraphQL · gRPC · WebSocket · MCP
           │
           ▼
    ClawQL Core (→ MCP)
           │
           ▼
      MCP (common IR)
           │
           ▼
  mcp-api-adapter (MCP →)
           │
           ▼
Any output protocol
  CLI · OpenAPI · GraphQL · gRPC · WebSocket · MCP
```

Streams adds the **event loop** around that fabric: world events enter via WebSocket/NATS/webhook/cron, ClawQL acts (WORM, ambient delivery, or autonomous agent), and results can leave via any output surface. ESB analogy for GTM: N×M protocol integrations collapse to N+M with MCP as the bus — Streams is how the bus reacts without a human at the console.

---

## 10. Helm values

```yaml
streams:
  enabled: false # opt-in; CLAWQL_ENABLE_STREAMS=1 for env gate

  scalingBackend: kubernetes # kubernetes | durable-objects
  hpa:
    enabled: true
    minReplicas: 1
    maxReplicas: 50
    targetConsumerLag: 100

  ambientDelivery: true # inject pendingStreamEvents on every tool response

  defaults:
    maxConcurrentSessions: 10
    batchWindowMs: 0 # 0 = no batching
    budgetTokens: 8000
    maxTurns: 10

  auditLevel: WORM # WORM | LOG | none
  subscriptionStore: postgres # postgres | jsonl
```

---

## 11. CLI

```text
clawql streams <subcommand>
  subscribe      Create a subscription (interactive or --config file)
  unsubscribe    Remove a subscription by ID
  list           List active subscriptions with status
  status         Show buffer depth and event counts for a subscription
  pause          Pause a subscription without removing it
  resume         Resume a paused subscription
  read           Drain buffered events for a topic
  replay         Replay events from a time window
  pending        Show total pending events across all subscriptions
  worker         Start the streams processing worker (sidecar mode)
```

---

## 12. Comparison to alternatives

|                      | Stripe Minions              | Anthropic Managed Agents | OpenAI Agents SDK | ClawQL Streams                                        |
| -------------------- | --------------------------- | ------------------------ | ----------------- | ----------------------------------------------------- |
| **Trigger**          | Slack reaction              | Cron / API call          | API call          | WebSocket · NATS · webhook · cron · poll · gRPC · SSE |
| **Tool catalog**     | Custom (Toolshed, internal) | Built-in + custom        | Built-in + custom | Any MCP server via mcp-api-adapter                    |
| **Audit trail**      | Internal                    | Provider-managed         | Provider-managed  | WORM Merkle chain, operator-owned                     |
| **Sovereignty**      | Internal only               | Provider servers         | Provider servers  | Self-hosted · air-gapped · Cloudflare                 |
| **Scale**            | Internal K8s                | Provider-managed         | Provider-managed  | DO per event (CF) or K8s HPA                          |
| **Protocol surface** | Internal                    | API only                 | API only          | Any protocol both directions                          |
| **Model**            | Goose + Claude Code         | Claude only              | OpenAI only       | Any model via inference gateway                       |
| **Payments**         | x402 demo                   | None                     | None              | Full economics stack                                  |
| **Open source**      | No                          | No                       | Partial           | Apache 2.0 core                                       |
| **Multi-agent**      | No                          | Research preview         | Yes               | Ouroboros ensemble                                    |

**Positioning:** ClawQL Streams is the self-sovereign alternative to Anthropic Managed Agents, with Stripe Minions-level tool integration and Agents SDK-level orchestration — triggered by any event source, audited to WORM, deployable anywhere.

---

## 13. Open questions

1. **DO identity for WORM.** When an Agent DO writes a WORM entry, what identity does it carry — the subscription owner, the DO instance, or both? This matters for multi-tenant deployments.
2. **Cross-subscription coordination.** Two subscriptions fire on the same event source simultaneously. Should they see each other's agent outputs? Default no; shared NATS subject for opt-in coordination is worth specifying.
3. **Replay and idempotency.** When NATS replays events (outage recovery), the significance filter re-runs and agent sessions may re-spawn. Need idempotency keys on agent sessions keyed to event ID + subscription ID.
4. **DO to self-hosted parity.** Some features (WebSocket hibernation, per-event DO isolation) are Cloudflare-native. The K8s path approximates them but does not have exact parity — document what differs.
5. **Kafka / Kinesis for enterprise.** High-volume regulated sources may already publish to Kafka or Kinesis. First-class in v0.1 or v0.2?

---

## Further reading

- [`docs/mcp/mcp-api-adapter.md`](../mcp/mcp-api-adapter.md) — MCP → APIs (inverse of ClawQL Core)
- [`docs/inference/clawql-inference.md`](../inference/clawql-inference.md) — Agentic Gateway / inference path
- [`docs/mcp/schedule-synthetic-checks.md`](../mcp/schedule-synthetic-checks.md) — existing cron pattern Streams unifies
- NATS JetStream — existing event backbone in Helm / compose
