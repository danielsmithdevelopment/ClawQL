# GraphQL Mesh / OmniGraph and Node.js compatibility

ClawQL builds an in-process GraphQL schema from OpenAPI using **`loadGraphQLSchemaFromOpenAPI`** from **`@omnigraph/openapi`** (see **`src/graphql-schema-builder.ts`**). That pulls in **`@omnigraph/json-schema`**.

## Node 25: full Slack OpenAPI — schema build throws before GraphQL `execute`

On **Node 25** (observed at **v25.9.0**), building the schema for the **full** bundled Slack Web API document **`providers/slack/openapi.json`** can throw during JSON Schema union handling:

```text
TypeError: Cannot set property input of #<Object> which has only a getter
    at getUnionTypeComposers (.../node_modules/@omnigraph/json-schema/esm/getUnionTypeComposers.js:52:41)
```

The failing assignment in published ESM corresponds to this branch in the **graphql-mesh** monorepo source ([`getUnionTypeComposers.ts`](https://github.com/ardatan/graphql-mesh/blob/master/packages/loaders/json-schema/src/getUnionTypeComposers.ts)):

```ts
if (Object.keys(unionInputFields).length === 1) {
  subSchemaAndTypeComposers.input = Object.values(unionInputFields)[0].type;
}
```

Here **`subSchemaAndTypeComposers`** is a **`JSONSchemaObject`**-shaped value that may expose **`input`** as a **read-only** accessor on newer V8 / Node stacks, so a plain assignment throws.

**Node 22** and **Node 24:** we have not seen this failure when running the same **`loadGraphQLSchemaFromOpenAPI`** entrypoint against the full Slack spec in local/CI checks.

### Why ClawQL’s GraphQL-path Vitest still runs on Node 25

**`src/notify-graphql-path.test.ts`** sets **`CLAWQL_SPEC_PATH`** to **`src/test-utils/fixtures/minimal-slack-chat-postmessage.json`**, a **single-operation** cut-down that keeps **`chat_postMessage`** compatible with **`handleNotifyToolInput`**, but avoids the huge OpenAPI surface that triggers the union bug. That keeps CI’s “GraphQL first, no **`executeRestOperation`**” assertion meaningful on **22 / 24 / 25**.

### Runtime impact when the full Slack spec is loaded

If the process loads **`providers/slack/openapi.json`** (for example merged **`all-providers`** or **`CLAWQL_PROVIDER=slack`**) on **Node 25**, in-process schema construction can fail at startup or first use; **`handleClawqlExecuteToolInput`** then **falls back to REST** for single-spec **`execute`** on **OpenAPI-derived** operations (and **`notify`**, which delegates to **`execute`**). Multi-spec **`execute`** uses REST for OpenAPI/Discovery ops; **native** GraphQL/gRPC **`execute`** paths are unaffected.

---

## Filing an issue upstream

**Target repository:** [ardatan/graphql-mesh](https://github.com/ardatan/graphql-mesh) (package **`packages/loaders/json-schema`**, npm **`@omnigraph/json-schema`**). Issues: [github.com/ardatan/graphql-mesh/issues](https://github.com/ardatan/graphql-mesh/issues).

**Suggested title:** `Node 25: TypeError assigning subSchemaAndTypeComposers.input in getUnionTypeComposers ("only a getter")`

**Suggested body (copy-paste and adjust versions if needed):**

> **Environment**
>
> - Node.js: **25.x** (fails); **22.x** and **24.x** OK in downstream CI
> - `@omnigraph/json-schema`: **0.109.40** (via `@omnigraph/openapi` **0.109.41**)
>
> **Symptom**
>
> While building a GraphQL schema from the **full** Slack Web API OpenAPI 3 document (`openapi.json` from Slack’s public spec, ~170+ operations), schema construction throws:
>
> ```
> TypeError: Cannot set property input of #<Object> which has only a getter
>     at getUnionTypeComposers (.../@omnigraph/json-schema/esm/getUnionTypeComposers.js:52:41)
> ```
>
> **Suspected line** (TypeScript source): [`packages/loaders/json-schema/src/getUnionTypeComposers.ts`](https://github.com/ardatan/graphql-mesh/blob/master/packages/loaders/json-schema/src/getUnionTypeComposers.ts) — assignment to `subSchemaAndTypeComposers.input` when `Object.keys(unionInputFields).length === 1`.
>
> **Repro idea**
>
> 1. Depend on `@omnigraph/openapi` and call `loadGraphQLSchemaFromOpenAPI` with the **full** Slack Web API OpenAPI JSON.
> 2. Run on Node **25**.
>
> A **minimal** OpenAPI with only `chat.postMessage` does **not** reproduce in our tests — the failure appears tied to the large / union-heavy schema.
>
> **Downstream**
>
> - [ClawQL](https://github.com/danielsmithdevelopment/ClawQL) — in-process OpenAPI→GraphQL for `execute` / `notify`; we document behavior and use a minimal Slack fixture in Vitest for the GraphQL path. Doc: [`docs/graphql-mesh-node-compatibility.md`](https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/graphql-mesh-node-compatibility.md).

## Upstream tracking

- **graphql-mesh:** [#9447 — Node 25: TypeError assigning `subSchemaAndTypeComposers.input` in `getUnionTypeComposers` ("only a getter")](https://github.com/ardatan/graphql-mesh/issues/9447)

## References

- ClawQL: **`src/graphql-schema-builder.ts`**, **`src/graphql-in-process-execute.ts`**, **`src/notify-graphql-path.test.ts`**, fixture **`src/test-utils/fixtures/minimal-slack-chat-postmessage.json`**
- graphql-mesh package: [`packages/loaders/json-schema`](https://github.com/ardatan/graphql-mesh/tree/master/packages/loaders/json-schema)
