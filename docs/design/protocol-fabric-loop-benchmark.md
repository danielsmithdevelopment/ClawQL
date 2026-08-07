# Protocol Fabric loop — basic benchmark

**Status:** Spike / smoke (August 2026)  
**Package touchpoints:** `mcp-api-adapter@0.6` · ClawQL Core custom CLI sources · `gen-cli`  
**Smoke:** [`scripts/dev/smoke-protocol-fabric-loop.sh`](../../scripts/dev/smoke-protocol-fabric-loop.sh)  
**Related:** [Protocol Fabric](../gtm/protocol-fabric.md) · [ClawQL Streams](../streams/clawql-streams.md) · [custom sources](../getting-started/custom-sources.md)

---

## Claim

Prove the **anything→anything** fabric on one critical path:

```text
WebSocket event
    → mcp-api-adapter (/ws tools/call)
    → clawql-mcp execute(cli__fabric_event__run)
    → gen-cli subprocess (POST /memory_ingest on the adapter)
    → clawql-mcp memory_ingest
    → vault note containing the original event marker
```

This is **not** an OpenBench LLM cell. It is a **deterministic protocol loop** smoke (scheduled / local). Optional later: OpenBench wrapper that only grades the vault artifact.

---

## Topology (safe — no recursion)

| Layer                   | Role                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| **A** ClawQL MCP        | Real tools: `execute`, `memory_ingest`, `memory_recall`, …                                             |
| **B** mcp-api-adapter   | Wraps A — OpenAPI + GraphQL + `/mcp` + gRPC + **WebSocket `/ws`**                                      |
| **C** gen-cli           | Thin CLI generated from B’s catalog; POSTs to B REST                                                   |
| **D** CLI custom source | `sources.json` → one op `cli__fabric_event__run` that runs C with `memory_ingest` baked into `cliArgs` |

**Why this does not recurse:** `execute` spawns gen-cli → REST `POST /memory_ingest` → adapter CallTool `memory_ingest`. That path never calls `execute` again. Do **not** point gen-cli at an `execute` of the same CLI op.

```text
WS tools/call execute
        │
        ▼
 clawql execute(cli__fabric_event__run)
        │ spawn
        ▼
 gen-cli memory_ingest --args '{event…}'
        │ POST
        ▼
 adapter /memory_ingest
        │
        ▼
 clawql memory_ingest  ← terminal hop
```

---

## Setup order

1. Start ClawQL HTTP MCP with isolated `CLAWQL_HOME` (memory on; heavy plugins off).
2. Start adapter pointing at that `/mcp`.
3. `mcp-api-adapter gen-cli --out $HOME/fabric-cli --mcp-url … --base-url <adapter>`.
4. Write `$CLAWQL_HOME/sources.json` with CLI source → `node …/mcp-tools.mjs memory_ingest`.
5. **Restart** ClawQL so the CLI op is indexed.
6. Restart or `refreshCatalog` on the adapter.
7. Dispatch 1–N WebSocket events: `execute` with `args: ["--args", "<json>"]`.
8. `memory_recall` (REST or WS) for the event marker → pass.

---

## WebSocket message shape

```json
{
  "id": "evt-1",
  "tool": "execute",
  "arguments": {
    "operationId": "cli__fabric_event__run",
    "args": {
      "args": [
        "--args",
        "{\"title\":\"Fabric loop evt-1\",\"insights\":\"marker FABRIC_LOOP_evt-1\",\"tags\":[\"fabric-loop\"],\"append\":true}"
      ]
    }
  }
}
```

Reply: `{ "id": "evt-1", "ok": true, "result": … }`.

Direct `tool: "memory_ingest"` over WS is also valid but **does not** prove the CLI custom-source hop — the smoke uses `execute` for that.

---

## Pass criteria

- Adapter `/healthz` lists `websocket` in `surfaces`.
- Two distinct WS events both return `ok: true` on `execute`.
- `memory_recall` for the markers finds vault hits.
- Exit 0 from `smoke-protocol-fabric-loop.sh`.

---

## Non-goals (this spike)

- NATS ambient delivery / Streams autonomous `claude -p` (see Streams spec).
- OpenBench `pr_active` token burn.
- Registering gen-cli as a custom source that calls `execute` of itself.

---

## Next

- Optional OpenBench task grading only the vault artifact (no LLM) or a tiny agent that must dispatch via WS.
- DO-hosted adapter hibernation using this `/ws` surface.
- Fold into ClawQL Streams reactive mode once `stream_subscribe` lands.
