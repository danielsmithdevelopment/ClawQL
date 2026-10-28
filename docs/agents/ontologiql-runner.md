# Ontologiql runner × ClawQL (combined)

**Status:** In-repo driver in `clawql-agents`  
**ADRs:** [0017 ACP-first](../adr/0017-agent-client-protocol-first-adapters.md) · [0015 Ontologiql-shaped split](../adr/0015-program-mode-alongside-search-execute.md)  
**Related:** [Cursor Agent SDK](../integrations/cursor-agent-sdk.md) · [agents spec](./clawql-agents-spec-v0.1.md)

## Planes (do not collapse)

| Plane                 | What                                                        | Package / entry                                      |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Coding-agent session  | Edit/run loops via Agent Client Protocol or native adapters | `CodingAgentDrive` / `prepareCodingAgentStackEffect` |
| ClawQL tools          | `search` / `execute` / memory / mandates                    | MCP (`mcp-connections/clawql.ts` or gateway)         |
| Compliance audit      | Tamper-evident WORM                                         | `clawql-audit` (shared by runner + Agent SDK hooks)  |
| Cursor Agent SDK bots | Versioned bots with MCP + hooks + evals                     | `docs/examples/agent-sdk/`                           |

Publishable Ontologiql-shaped runtime may speak **ACP**. Mandates, IFC, risk, and WORM **stay ClawQL**.

## Combined API

```ts
import { Effect } from "effect";
import { CodingAgentDrive, prepareCodingAgentStackEffect } from "clawql-agents";

const program = Effect.gen(function* () {
  const prepared = yield* prepareCodingAgentStackEffect({
    target: { kind: "auto", name: "cursor-cli" }, // → ACP
    // target: { kind: "auto", name: "goose" },  // → native catalog
    wormDbPath: "/var/clawql/worm.db",
  });

  return yield* Effect.gen(function* () {
    const drive = yield* CodingAgentDrive;
    if (prepared.route.kind === "acp") {
      return yield* drive.runAcpTurn({
        target: { kind: "acp", id: prepared.route.id },
        wormDbPath: "/var/clawql/worm.db",
        turn: {
          cwd: "/workspace",
          prompt: [{ type: "text", text: "Summarize the failing test." }],
          // ClawQL MCP stays on the agent via mcpServers / project mcp.json — not reimplemented as ACP methods
        },
      });
    }
    // native: drive.startNative({ ... config, atrScope })
  }).pipe(Effect.provide(prepared.layer));
});
```

- **ACP path** (`cursor-cli`): `initialize` → `authenticate` → `session/new` → `session/prompt`; WORM `SESSION_START` / `SESSION_END` with `agentName: acp:cursor-cli`.
- **Native path** (catalog seven): existing adapters + ATR + WORM (unchanged).
- **Agent SDK bots**: copy `docs/examples/agent-sdk/` into a bot; hooks append to the **same** WORM HTTP `/entries` shape the runner uses in-process.

## When to use which

| Goal                                         | Use                                   |
| -------------------------------------------- | ------------------------------------- |
| Drive Cursor CLI / any ACP agent from ClawQL | `CodingAgentDrive.runAcpTurn`         |
| Drive Goose / Hermes / … with ATR + WORM     | `CodingAgentDrive.startNative`        |
| Ship a Cursor-hosted bot with ClawQL tools   | Agent SDK `mcp-connections/clawql.ts` |
| Injection smoke on that bot                  | Agent SDK `evals/injection.eval.ts`   |

## Isolation backend (Cua / Agent Substrate)

Session containment for the open reference runner should speak **`IsolationBackendService`** (`clawql-sandbox`) — the same contract Ontologiql uses for Firecracker / Apple container later. Cua Spaces is an **optional** backend (ADR [0018](../adr/0018-cua-isolation-backend.md)): Linux Spaces on a Mac + snapshot/replay spike only. Pin `@trycua/cua@0.9.0`; never hard-depend; never publish latency/density from Cua runs. Shared conformance: `runIsolationConformanceEffect`. Guide: [`../integrations/cua-spaces.md`](../integrations/cua-spaces.md).

## Non-goals

- Re-implementing `search` / `execute` / mandates as ACP extension methods.
- Treating Cursor Approval Bot / Agent SDK approvals as ClawQL mandate digests.
- Renaming payments `CLAWQL_ACP_*`.
