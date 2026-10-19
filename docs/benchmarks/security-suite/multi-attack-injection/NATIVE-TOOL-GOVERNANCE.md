# Native tool governance (security finding)

`memory_ingest` (and other ClawQL-owned MCP tools) previously skipped `execute-core` operation risk, mandate park, and session IFC. That is a security finding: a native write path is exactly where persistent injection survives into later sessions.

## Choke point

Every registered tool must pass through:

1. **Proxy hooks** (`wrapRegisteredMcpToolHandler` → Panguard / capability / x402)
2. **Native gate** (`gateNativeToolBeforeInvoke`) — session IFC + park destructive writes
3. **Read accumulation** (`accumulateNativeToolReadAfterSuccess`) after successful reads

Catalog `execute` / `proxy_call` / `submit_program_proposals` / `resume` keep their gates inside execute-core (listed in `EXECUTE_PATH_TOOL_NAMES`).

ChatGPT extension tools use `governNativeHandler` from `clawql-api` (same gate; they previously bypassed wrap entirely).

## Gentler defaults (smoke v3)

Blocking every untrusted→memory write made ordinary work (“read an email, write a summary”) fail, which pushes operators to turn protection off. Defaults now:

| Move                                                  | Default behavior                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Untrusted → **memory** (labelable sink)               | **Allow**, stamp `clawql-untrusted` + provenance; later recall re-taints |
| Untrusted → **external / privileged** (blocking sink) | **Block** (`untrusted_read_taint` / `data_flow`)                         |
| `memory_ingest` **append**                            | Allow (not parked)                                                       |
| `memory_ingest` **overwrite** (`append: false`)       | **Park** for mandate (`park_destructive_write`)                          |

Unknown tools remain **destructive** + **blocking** (fail closed).

## CI

`src/mcp/native-tool-governance.ci.test.ts` asserts:

- Wrap is bound to `NATIVE_TOOL_GOVERNANCE_MODULE_ID`
- Policy table covers memory, automation, and ChatGPT tools
- Unknown tools fail closed as **destructive**
- `memory_ingest` is labelable write; `notify` is blocking

## Audit inventory

See `NATIVE_TOOL_POLICY` in `packages/clawql-api/src/governance/native-tool-policy.ts` for the living table (memory, skills, schedule, notify, documents, sandbox, web, ontology, observability, ouroboros, network, chatgpt).
