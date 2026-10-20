# Native tool governance (security finding)

`memory_ingest` (and other ClawQL-owned MCP tools) previously skipped `execute-core` operation risk, mandate park, and session IFC. That is a security finding: a native write path is exactly where persistent injection survives into later sessions.

## Choke point

Every registered tool must pass through:

1. **Proxy hooks** (`wrapRegisteredMcpToolHandler` → Panguard / capability / x402)
2. **Native gate** (`gateNativeToolBeforeInvoke`) — session IFC + park destructive writes
3. **Read accumulation** (`accumulateNativeToolReadAfterSuccess`) after successful reads

Catalog `execute` / `proxy_call` / `submit_program_proposals` / `resume` keep their gates inside execute-core (listed in `EXECUTE_PATH_TOOL_NAMES`).

ChatGPT extension tools use `governNativeHandler` from `clawql-api` (same gate; they previously bypassed wrap entirely).

## CI

`src/mcp/native-tool-governance.ci.test.ts` asserts:

- Wrap is bound to `NATIVE_TOOL_GOVERNANCE_MODULE_ID`
- Policy table covers memory, automation, and ChatGPT tools
- Unknown tools fail closed as **destructive**

## Audit inventory

See `NATIVE_TOOL_POLICY` in `packages/clawql-api/src/governance/native-tool-policy.ts` for the living table (memory, skills, schedule, notify, documents, sandbox, web, ontology, observability, ouroboros, network, chatgpt).
