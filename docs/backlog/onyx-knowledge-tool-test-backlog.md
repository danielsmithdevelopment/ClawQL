# Onyx `knowledge_search_onyx` — test backlog & GitHub tracking

Shipped coverage lives in **`src/knowledge-search-onyx.test.ts`**, **`src/server.test.ts`** (stdio), **`src/server-http.test.ts`** (Streamable HTTP **`listTools`**), and **`src/grpc-onyx-parity.test.ts`** (gRPC **`listTools`**). Use this file as a spec mirror for deeper integration work.

**GitHub:** umbrella **[#144](https://github.com/danielsmithdevelopment/ClawQL/issues/144)** (2026-04-23). Spec refresh (**#143**, closed): **`npm run fetch-provider-specs`** with **`ONYX_BASE_URL`**. Deck accuracy: **[#145](https://github.com/danielsmithdevelopment/ClawQL/issues/145)**.

---

## Checklist (see #144)

- **Stdio MCP `callTool("knowledge_search_onyx")`** with upstream HTTP mocked at the process boundary — done via **`CLAWQL_TEST_ONYX_FETCH_STUB`** in **`src/rest-operation.ts`** + **`src/server.test.ts`** (same pattern as Slack **`CLAWQL_TEST_SLACK_FETCH_STUB`**).
- **Optional live or VCR** for `POST /search/send-search-message` (opt-in env or sanitized cassettes; default `npm test` stays offline).
- **Streamable HTTP + gRPC** smoke parity when those transports list optional tools — done ([#144](https://github.com/danielsmithdevelopment/ClawQL/issues/144)): **`server-http.test.ts`**, **`grpc-onyx-parity.test.ts`** (same idea as [#140](https://github.com/danielsmithdevelopment/ClawQL/issues/140) for `notify`).
