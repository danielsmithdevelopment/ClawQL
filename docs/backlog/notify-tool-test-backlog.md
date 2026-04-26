# `notify` / Slack — test backlog & GitHub issue drafts

Shipped coverage lives in **`src/clawql-notify.test.ts`**, **`src/server.test.ts`**, **`src/server-http.test.ts`**, **`src/grpc-notify-parity.test.ts`**, and **`src/notify-graphql-path.test.ts`**. Use the sections below to open GitHub issues when you want deeper assurance.

**GitHub:** opened as [#136](https://github.com/danielsmithdevelopment/ClawQL/issues/136), [#137](https://github.com/danielsmithdevelopment/ClawQL/issues/137), [#138](https://github.com/danielsmithdevelopment/ClawQL/issues/138), [#139](https://github.com/danielsmithdevelopment/ClawQL/issues/139), [#140](https://github.com/danielsmithdevelopment/ClawQL/issues/140) (2026-04-23). **Landed in repo and closed on GitHub:** [#136](https://github.com/danielsmithdevelopment/ClawQL/issues/136), [#138](https://github.com/danielsmithdevelopment/ClawQL/issues/138), [#140](https://github.com/danielsmithdevelopment/ClawQL/issues/140). **Still open (optional depth):** [#137](https://github.com/danielsmithdevelopment/ClawQL/issues/137), [#139](https://github.com/danielsmithdevelopment/ClawQL/issues/139). Retain this file as a spec mirror.

---

## Draft issue 1 — MCP `callTool("notify")` stdio integration — [#136](https://github.com/danielsmithdevelopment/ClawQL/issues/136) — **done (in repo)**

**Implemented:** **`src/server.test.ts`** — stdio **`callTool("notify")`** with **`CLAWQL_TEST_SLACK_FETCH_STUB`** + multi-spec (Slack + petstore); success and **`ok:false`** Slack JSON paths.

**Title:** `test: stdio MCP client calls notify with mocked upstream`

**Body:**

- Extend **`src/server.test.ts`** (or a dedicated script) to start **`dist/server.js`** with **`CLAWQL_ENABLE_NOTIFY=1`**, **`CLAWQL_SPEC_PATHS`** including Slack + a second spec for multi/REST, and a fake **`CLAWQL_SLACK_TOKEN`**.
- Mock **`node-fetch`** at the process boundary (or inject a test double) so **`callTool({ name: "notify", arguments: … })`** is exercised end-to-end without hitting `api.slack.com`.
- Assert MCP error shape for invalid tool args (Zod) vs handler errors.

**Why:** Confirms tool registration, JSON schema, and the stdio transport path—not only `handleNotifyToolInput` in-process.

---

## Draft issue 2 — Optional live / recorded Slack contract — [#137](https://github.com/danielsmithdevelopment/ClawQL/issues/137)

**Title:** `test: optional Slack Web API contract (secrets or VCR)`

**Body:**

- Add an **opt-in** script (e.g. **`npm run test:notify:live`**) gated on **`CLAWQL_SLACK_TEST_CHANNEL`** + **`CLAWQL_SLACK_TOKEN`** (or a dedicated test workspace token).
- Alternatively: record **`nock`** / **MSW** cassettes for **`chat.postMessage`** request shape (form body, `Authorization: Bearer`, path) and commit **sanitized** fixtures.
- Document in **`docs/notify-tool.md`** under CI: default **`npm test`** stays offline.

**Why:** Catches Slack API drift and regressions in URL/body construction that mocks might not reflect.

---

## Draft issue 3 — Single-spec GraphQL path for Slack — [#138](https://github.com/danielsmithdevelopment/ClawQL/issues/138) — **done (in repo)**

**Title:** `test: notify when execute uses in-process GraphQL for Slack (no REST fallback)`

**Implemented:**

- **`src/notify-graphql-path.test.ts`** — `executeOperationGraphQL(chat_postMessage)` sanity plus **`handleNotifyToolInput`** against a loopback HTTP stub; asserts **`executeRestOperation`** is **not** called (no REST fallback).
- **`src/test-utils/fixtures/minimal-slack-chat-postmessage.json`** — minimal Slack-shaped OpenAPI with the same **`chat_postMessage`** operation id; the full **`providers/slack/openapi.json`** still does not build under **`@omnigraph/openapi`** / **`@omnigraph/json-schema`**, so production single-spec Slack continues to hit GraphQL build failure → REST fallback until upstream fixes that.
- **`vitest.config.ts`** — **`resolve.alias`** for **`graphql`** (plus **`dedupe`**) so Vitest does not load two **`graphql`** realms; otherwise **`execute()`** rejects the Omnigraph-built schema.

**Original body (for history):**

- Today’s mocked **`fetch`** tests use **multi-spec** so **`execute`** always uses REST.
- When **`providers/slack/introspection.json`** (or equivalent) exists and GraphQL succeeds for **`chat_postMessage`**, **`notify`** never calls **`node-fetch`**.
- Add a conditional test (skip if introspection missing) or a tiny fixture OpenAPI + pregenerated introspection in **`src/test-utils/fixtures/`** to assert **`notify`** still returns correct success / **`ok:false`** handling on the GraphQL path.

**Why:** Avoids a false sense of safety when CI only exercises REST.

---

## Draft issue 4 — Ouroboros / schedule integration — [#139](https://github.com/danielsmithdevelopment/ClawQL/issues/139)

**Title:** `test: Ouroboros milestones call notify (or schedule → notify on failure)`

**Body:**

- When **`packages/clawql-ouroboros`** (or **`schedule`**, [#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76)) wires completion / failure hooks, add integration tests that stub Slack and assert **`notify`** is invoked with expected **`channel`** / **`text`**.
- Cross-link **`docs/schedule-synthetic-checks.md`**.

**Why:** Product path is “done signals” from workflows, not only direct MCP calls from Cursor.

---

## Draft issue 5 — HTTP MCP + gRPC parity — [#140](https://github.com/danielsmithdevelopment/ClawQL/issues/140) — **done (in repo)**

**Implemented:** **`src/server-http.test.ts`** (Streamable HTTP **`listTools`** includes **`notify`**); **`src/grpc-notify-parity.test.ts`** (gRPC **`ListTools`** includes **`notify`**).

**Title:** `test: notify over Streamable HTTP and gRPC transports`

**Body:**

- Mirror **`server.test.ts`** list-tools checks for **`clawql-mcp-http`** and **`mcp-grpc-transport`** if those stacks list tools differently.
- One smoke test per transport with **`CLAWQL_ENABLE_NOTIFY=1`**.

**Why:** Optional tools must appear consistently on every MCP surface.
