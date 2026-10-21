# Session information-flow control (IFC)

**IFC** means **information flow control**: ClawQL tracks what a session has *read*, then decides whether that data may *flow* into a later *write* sink. It is session-scoped taint tracking for agent tool use — not Panguard ATR, not mandate park, and not OpenAPA.

This page is the product reference for operators and security reviewers. Design history lives in [ADR 0015](../adr/0015-program-mode-alongside-search-execute.md) § Information flow. Native-tool choke-point notes: [NATIVE-TOOL-GOVERNANCE.md](../benchmarks/security-suite/multi-attack-injection/NATIVE-TOOL-GOVERNANCE.md).

## What it is

A process-local **label set per session key**. On a successful **read**, ClawQL unions labels such as `source:slack` or `source:untrusted-email` into that set. On a later **mutating** call, ClawQL asks: may this accumulated set flow to the destination of this write?

| Outcome | Meaning |
| ------- | ------- |
| Allow | Empty labels, public dest, same-source / allow-listed flow, or (native path) same-source / internal exceptions |
| Block | Cross-source or external/privileged sink after taint (`data_flow` / `untrusted_read_taint`) |
| Label & allow | Untrusted → **labelable** sink (e.g. `memory_ingest`): write proceeds, vault note stamped `clawql-untrusted` so later recall re-taints |

**Default:** on. Opt out with `CLAWQL_ENABLE_SESSION_IFC=0` (not recommended in production). Optional JSON allow-list: `CLAWQL_SESSION_IFC_ALLOWED`.

## Where it is defined

| Piece | Path |
| ----- | ---- |
| Pure policy (`mayFlow`, `labelForSpec`, config parse) | `packages/clawql-api/src/ifc/labels.ts` |
| Gate API (`checkSessionIfcWriteSync`, `accumulateSessionIfcReadSync`) | `packages/clawql-api/src/ifc/session-ifc-enforce.ts` |
| In-memory store (`Map` sessionKey → labels) | `packages/clawql-api/src/ifc/session-label-store.ts` |
| Native-tool choke (IFC + park) | `packages/clawql-api/src/governance/native-tool-gate.ts` |
| Native policy table / sink class | `packages/clawql-api/src/governance/native-tool-policy.ts` |
| Catalog execute path | `packages/clawql-api/src/execute/execute-core.ts` |
| MCP wrap (every registered tool) | `src/mcp/mcp-tool-wrap.ts` |

## How it gets called

There are **two product paths**. Both use the same `checkSessionIfcWriteSync` / `accumulateSessionIfcReadSync` core.

### Path 1 — Native MCP tools

Slack send, `notify`, `memory_*`, documents, etc. — tools that are **not** catalog `execute`.

```
Agent tool call
  → wrapRegisteredMcpToolHandler          (src/mcp/mcp-tool-wrap.ts)
  → proxy hooks (Panguard / ATR / x402)   optional, separate from IFC
  → gateNativeToolBeforeInvoke            (native-tool-gate.ts)
       → checkSessionIfcWriteSync         before mutating handler
  → handler runs
  → accumulateNativeToolReadAfterSuccess  after successful read
       → accumulateSessionIfcReadSync
```

Catalog execute-path tool names skip the native-gate body; they are gated inside execute-core (`EXECUTE_PATH_TOOL_NAMES` / `isExecutePathTool`).

### Path 2 — Catalog `execute` / `proxy_call` / program submit

```
executeClawqlOperationEffect              (execute-core.ts)
  → checkSessionIfcWriteSync              before side effects (writes only)
  → upstream call
  → accumulateSessionIfcReadSync          after successful read outcome
```

Programs (`execute_program` / `submit_program_proposals`) join **program read labels** into the same check so a program cannot launder across sources (ADR 0015).

## When it runs

| Moment | Function | Condition |
| ------ | -------- | --------- |
| Before a mutating native tool | `gateNativeToolBeforeInvoke` → `checkSessionIfcWriteSync` | Session IFC enabled; tool not passthrough/read; not execute-path |
| After a successful native read | `accumulateNativeToolReadAfterSuccess` | IFC enabled; policy `kind === "read"`; success |
| Before a mutating catalog execute | `checkSessionIfcWriteSync` in execute-core | IFC enabled; op is not a read |
| After a successful catalog read | `accumulateSessionIfcReadSync` | IFC enabled; read op; outcome ok |
| Memory recall of labeled-untrusted notes | extra accumulate in native gate | `memory_recall` / `read_around` result text carries `clawql-untrusted` / provenance |

**Read vs write:** `isReadOperation` — GET/HEAD/QUERY, `mcpReadOnlyHint`, gRPC no-side-effects, GraphQL `query`. Everything else is a write-sink check.

## Session key

Labels do **not** cross session keys. Resolution order (`resolveSessionLabelKey`):

1. Explicit `sessionId` on the call / MCP request context
2. `CLAWQL_SESSION_ID`
3. `apikey:${CLAWQL_API_KEY_ID}` when set
4. `"default"`

**Honesty bound:** a client can still copy data from one session into another in its own context; ClawQL cannot see that. Cross-session protection depends on **labeled memory** (vault stamps) re-tainting on recall — not on this Map alone.

## The `mayFlow` rule

Implemented in `labels.ts`. Fail closed unless a rule allows:

1. **Empty `fromUnion`** → allow (untainted session).
2. **Any destination is public** (`public` / config `publicDestinations`) → allow.
3. **Explicit allow-list** for that dest (`CLAWQL_SESSION_IFC_ALLOWED.allowedSourcesByDest`, including `"*"`) → every accumulated label must be listed (or be `public`).
4. **No allow-list** → only `public` or labels already equal to a destination label (same-source writes).

Cross-source example: session has `source:github`, write dest is `source:slack` → **blocked** unless configured.

## Native-gate exceptions (product defaults)

Raw `mayFlow` alone is too harsh for ordinary work (“read email, summarize to memory”, “reply in the same Slack thread”). `gateNativeToolBeforeInvoke` layers sink class and destination classification:

| Sink class (`resolveNativeIfcSink`) | After IFC would block |
| ----------------------------------- | --------------------- |
| **labelable** (e.g. `clawql-memory`) | Allow; `stampUntrustedProvenance` on args |
| **blocking** | Classify outbound dest: `same_source` / `internal` (non-secret) may proceed; `external` or secret-looking payload → block |

Destination classifier: `classifyOutboundDestination` (args flags like `destination: "same_source"`, channel heuristics, `#team` / `@internal.` patterns).

Untrusted source labels after read: `UNTRUSTED_SPEC_LABELS` (`untrusted-web`, `untrusted-email`, …).

Destructive park (mandate) is **separate**: same native gate, after IFC, when operation-risk enforce is on and the effective park kind is `destructive` (e.g. `memory_ingest` with `append: false`).

## Environment

| Variable | Default | Role |
| -------- | ------- | ---- |
| `CLAWQL_ENABLE_SESSION_IFC` | **on** when unset | `0` / `false` / `no` disables |
| `CLAWQL_SESSION_IFC_ALLOWED` | empty → built-in public dests only | JSON: `{ "publicDestinations": [...], "allowedSourcesByDest": { "source:slack": ["source:github", "*"] } }` |
| `CLAWQL_SESSION_ID` | — | Prefer explicit session partition |
| `CLAWQL_API_KEY_ID` | — | Fallback partition key (never raw API secret) |

## What IFC is not

| Mechanism | Relation to IFC |
| --------- | --------------- |
| **Panguard / JWT ATR** | Authz chokepoint *before* tools; scopes what the agent may call. IFC is data-flow *after* reads. |
| **Mandate park** | Human approval for destructive writes; same native/execute gates, different mechanism (`park_destructive_write`). |
| **Presidio / privacy filter** | Content redaction; does not replace label flow. |
| **Harness `BLOCK_TOOLS`** | Eval harness deny-list; not product IFC. |

## Worked example

1. Agent calls a read tool that returns planted email → session accumulates `source:untrusted-email`.
2. Agent tries `notify` / Slack send to an external channel with secret-shaped payload → **blocked** (`untrusted_read_taint` or `data_flow`).
3. Agent appends a summary via `memory_ingest` → **allowed**, note tagged `clawql-untrusted`.
4. Later session `memory_recall` of that note → labels re-enter the new session’s set.
5. Same-source Slack reply after a Slack read → may proceed under native-gate exceptions.

## Tests and formal mirror

- Unit / product: `packages/clawql-api/src/ifc/session-ifc.test.ts`, `packages/clawql-api/src/governance/native-tool-gate.test.ts`
- Never-more differential (program ⊆ execute): `packages/clawql-api/src/program/never-more.differential.test.ts`
- Lean / oracle mirror of empty-config `mayFlow`: `packages/clawql-api/src/ifc/information-flow-oracle.ts` (ADR 0014 / 0015 formal gates)

## Related

- [ADR 0015 — program mode & session labeling](../adr/0015-program-mode-alongside-search-execute.md)
- [MCP proxy JWT ATR](mcp-proxy-jwt-atr.md) — Panguard chokepoint (authz, not IFC)
- [Learn: Panguard MCP enforcement](https://docs.clawql.com/learn/panguard-mcp-enforcement)
- [Native tool governance](../benchmarks/security-suite/multi-attack-injection/NATIVE-TOOL-GOVERNANCE.md)
- [Security docs index](README.md)
