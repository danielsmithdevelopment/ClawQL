---
title: "WebMCP Tool Drafting — Specification"
status: "August 2026"
version: "0.1"
package: "packages/clawql-core/src/providers/webmcp-draft/"
---

# WebMCP Tool Drafting

## A clawql-core Provider for Inferring WebMCP Tools From Existing Structured Interfaces

**August 2026**

---

## 1. What This Is and Is Not

This provider drafts candidate WebMCP tool declarations (`navigator.modelContext.registerTool()` calls) from an interface a site or service **already exposes in structured or semi-structured form** — an OpenAPI spec, a GraphQL schema, or a page's own rendered HTML forms and interactive elements. A human reviews, edits, approves, and publishes each candidate through the same install-lifecycle machinery already specced for every other `clawql-core` provider plugin.

**This is not a static-code-analysis engine.** It does not read arbitrary application source across "almost all tech stacks," does not connect to a GitHub repository, and does not attempt to infer tool candidates from code that has no existing structured interface at all. That is a genuinely different and harder problem — the one commercial WebMCP-tool-drafting products (Sodium being the reference example) actually solve, and the reason a $49/month/repo price point exists: general-purpose static analysis across arbitrary codebases and frameworks is real, ongoing engineering work, not a one-time build.

**The trade this provider makes, stated plainly:** it gives up "works automatically on any codebase, sight unseen" in exchange for "works reliably on anything that already exposes a discoverable interface." This is the correct trade for a self-built version, because `clawql-core`'s ingestion architecture already parses OpenAPI specs, GraphQL schemas, and structured page content for other purposes (turning any API into MCP) — extending that same parsing to also draft WebMCP candidates is additive, not a new capability built from zero.

---

## 2. Why clawql-core, Not a New Package

This is a `ProviderPlugin` (per the plugin architecture spec) like any other — it has tools (draft, review, publish, rollback), it has hooks (a `pre-ingest`-scope hook that gates what an approved draft is allowed to declare), and it participates in the exact same WORM-audited install/uninstall lifecycle as every other provider. There is no reason for this to be a separate package; it belongs alongside `clawql-core`'s other source-ingestion adapters (REST, GraphQL, gRPC, WebMCP-consumption, CLI) because drafting WebMCP tools is the _output_ side of the same ingestion pipeline that already reads OpenAPI and GraphQL schemas for the _input_ side.

```
clawql-core/
  src/providers/
    webmcp-draft/
      index.ts             — the ProviderPlugin itself (WebMcpDraftPlugin)
      inference/
        from-openapi.ts     — draft candidates from an OpenAPI spec
        from-graphql.ts      — draft candidates from a GraphQL schema
        from-forms.ts         — draft candidates from rendered HTML
                                 forms/interactive elements (weakest
                                 signal of the three, see §4)
      lifecycle/
        draft-store.ts        — versioned candidate storage
        approval.ts            — review/edit/approve/reject flow
        publish.ts              — emits document.modelContext
                                   .registerTool() calls once approved
        rollback.ts             — reverts to a prior published version
        pre-ingest-gate.ts      — stub pre-ingest allowlist gate
```

---

## 3. The Drafting Pipeline

### 3.1 Input Sources, Ranked by Reliability

| Source                                     | Reliability | Why                                                                                                                                                                                                                                              |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenAPI spec                               | Highest     | Explicit operation names, typed parameters, often has descriptions already — closest to a WebMCP tool declaration's own shape                                                                                                                    |
| GraphQL schema                             | High        | Typed, self-describing, mutations map naturally to actions worth drafting as tools                                                                                                                                                               |
| Rendered HTML forms / interactive elements | Lowest      | No types, no guaranteed semantic naming (`<input name="q1">` tells you nothing); requires the LLM to infer intent from field labels, surrounding text, and form action URLs, which is meaningfully less reliable than reading an explicit schema |

A site with none of these — no OpenAPI, no GraphQL, no discoverable forms, purely dynamic client-side interaction with no server-visible structure — is out of scope for this provider entirely. That gap is real and is exactly what a full static-code-analysis engine would close; this provider does not attempt to close it.

### 3.2 Draft Generation

```typescript
// packages/clawql-core/providers/webmcp-draft/inference/from-openapi.ts

export interface DraftCandidate {
  candidateId: string;
  sourceType: "openapi" | "graphql" | "forms";
  sourceRef: string; // the spec path, schema field, or form
  // selector this candidate was inferred from
  proposedTool: {
    name: string;
    description: string;
    inputSchema: JSONSchema;
  };
  confidence: "high" | "medium" | "low";
  inferenceNotes: string; // why the drafter believes this is a
  // meaningful user-facing action, not
  // just an available operation — e.g.
  // "POST /cart/items with a productId
  // and quantity parameter matches the
  // add-to-cart pattern"
}

export async function draftFromOpenApi(spec: OpenApiDocument): Promise<DraftCandidate[]> {
  // Not every operation in a spec is worth drafting as a WebMCP tool —
  // a health-check endpoint or an internal admin operation isn't a
  // "user-facing action" in the sense WebMCP tools are meant to expose.
  // The drafter's job is filtering AND shaping, not just enumerating
  // every operation the spec happens to contain.
}
```

**The filtering judgment — which operations are "worth" drafting — is itself an LLM inference step, and it's the part most likely to need human correction.** A spec with 200 operations should not produce 200 candidate drafts; it should produce the handful that look like genuine user-facing actions (checkout, add-to-cart, book-appointment, track-order — the same category Sodium's own marketing names) with everything else left undrafted rather than drafted-and-likely-rejected. This is a deliberate design choice to keep the reviewer's workload proportional to genuinely useful candidates, not proportional to the size of the source spec.

---

## 4. Review, Approval, Versioning, Rollback

This reuses the plugin architecture's existing patterns rather than inventing new ones.

```typescript
// packages/clawql-core/providers/webmcp-draft/lifecycle/approval.ts

export interface DraftReviewAction {
  candidateId: string;
  action: "approve" | "reject" | "edit-and-approve";
  editedTool?: Partial<DraftCandidate["proposedTool"]>; // a reviewer can
  // correct a
  // drafted schema
  // before approval,
  // not just accept
  // or reject wholesale
  reviewedBy: string;
}

export async function reviewDraft(action: DraftReviewAction): Promise<void> {
  await worm.append({
    type: action.action === "reject" ? "WEBMCP_DRAFT_REJECTED" : "WEBMCP_DRAFT_APPROVED",
    candidateId: action.candidateId,
    reviewedBy: action.reviewedBy,
    edited: !!action.editedTool,
    timestamp: new Date().toISOString(),
  });

  if (action.action !== "reject") {
    await publishApprovedTool(action);
  }
}
```

**Versioning and rollback follow the same discipline already established for spend tiers (immutable version history, never silently overwritten) and provider plugins (clean, reversible install/uninstall):**

```typescript
export interface PublishedWebMcpVersion {
  versionId: string;
  publishedTools: DraftCandidate["proposedTool"][];
  publishedAt: string;
  publishedBy: string;
  previousVersionId: string | null; // forms a chain — rollback means
  // re-activating a prior version,
  // not deleting the current one
}
```

Every publish is a new immutable version, never an in-place mutation of the live tool set — this matches Sodium's own "every publish is signed and versioned, roll back anytime" feature, and it's a natural fit for the WORM-audited, reversible-by-design pattern already used everywhere else in `clawql-core`'s plugin system.

---

## 5. The One-Script-Tag Publish Mechanism

Once approved, publishing is nothing more than emitting the standard `navigator.modelContext.registerTool()` calls (or `document.modelContext`, per the deprecation noted in the PixelDrop work) for the site to load via a single script tag — no proprietary mechanism, the same public WebMCP API the PixelDrop demo already calls directly.

```typescript
// packages/clawql-core/providers/webmcp-draft/lifecycle/publish.ts

export function generatePublishScript(version: PublishedWebMcpVersion): string {
  return version.publishedTools
    .map(
      (tool) => `
    document.modelContext.registerTool({
      name: ${JSON.stringify(tool.name)},
      description: ${JSON.stringify(tool.description)},
      inputSchema: ${JSON.stringify(tool.inputSchema)},
      async execute(args) {
        // Bound at publish time to the underlying operation this
        // candidate was drafted from (the OpenAPI operationId,
        // GraphQL mutation, or form action) — see §6.
        return callBoundOperation(${JSON.stringify(tool.name)}, args)
      },
    })
  `
    )
    .join("\n");
}
```

---

## 6. Binding a Published Tool to Its Underlying Operation

A drafted-and-approved tool declaration is only half of what's needed — it also needs to actually _call_ the real operation it was drafted from when an agent invokes it. This binding is established at draft time (§3.2's `sourceRef`) and carried through to publish:

```typescript
export interface BoundOperation {
  toolName: string;
  sourceType: "openapi" | "graphql" | "forms";
  sourceRef: string; // the exact operationId, GraphQL
  // mutation name, or form submission
  // target this tool calls when invoked
}
```

This binding is what makes the published tool genuinely functional rather than a plausible-looking declaration with nothing behind it — an agent calling the published `add_to_cart` tool actually triggers the real `POST /cart/items` operation (or the real GraphQL mutation, or the real form submission) it was drafted from, through `clawql-core`'s normal source-adapter execution path, not a separate mechanism invented for this provider.

---

## 7. What Genuinely Isn't Built Here, and Why That's Fine

**No static analysis of arbitrary source code.** Sites with no OpenAPI spec, no GraphQL schema, and no server-rendered forms — pure client-side SPAs with no discoverable structure — are out of scope. A future, much larger project could extend this to read actual application source the way Sodium does; that's a different, harder engineering investment and not what this specification covers.

**No cross-framework code parsing.** This provider never touches a repository, never analyzes a codebase, and has no concept of "which tech stack is this." It only ever reads a structured interface a site already exposes — the same category of thing `clawql-core` already ingests for unrelated purposes.

**No general product analytics.** Sodium's "which AI engines are sending you traffic" and visit/tool-call/success-rate tracking is a `clawql-analytics`-shaped concern (per the existing provider-wrapper pattern for PostHog/Matomo/Plausible/Umami), not something this drafting provider needs to duplicate. If that visibility is wanted for a site using this provider's published tools, it's a separate, already-specced integration, not new work here.

---

## 8. Package Boundaries — Summary

| Concern                                                       | Package                                                                            | Why                                                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Drafting candidates from OpenAPI/GraphQL/forms                | `clawql-core` (`webmcp-draft` provider)                                            | Same ingestion architecture that already parses these interfaces for unrelated purposes                                              |
| Review, approval, edit, versioning, rollback                  | `clawql-core` (`webmcp-draft` provider), reusing plugin install-lifecycle patterns | No new lifecycle mechanism needed — this is the same reversible, WORM-audited pattern every provider plugin already follows          |
| Publishing the actual `registerTool()` calls                  | `clawql-core` (`webmcp-draft` provider)                                            | Standard public WebMCP API, no proprietary mechanism                                                                                 |
| Binding a published tool to its real underlying operation     | `clawql-core`'s existing source-adapter execution path                             | The tool must actually work, not just declare a plausible shape                                                                      |
| Usage analytics on the published tools (visits, success rate) | `clawql-analytics`                                                                 | Separate, already-specced concern — not duplicated here                                                                              |
| Full static-code-analysis of arbitrary repositories           | Out of scope                                                                       | Genuinely harder, ongoing engineering investment; the Sodium-shaped product this provider deliberately does not attempt to replicate |

---

*WebMCP Tool Drafting Specification · v0.1 · August 2026*  
*Location: packages/clawql-core/src/providers/webmcp-draft/*  
*Contact: daniel@clawql.com*
