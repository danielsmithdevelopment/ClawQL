# Case study: GitHub provider on `danielsmithdevelopment/ClawQL`

This document records a **real** workflow against a private GitHub repository using ClawQL’s bundled **`CLAWQL_PROVIDER=github`** spec (`providers/github/openapi.yaml`), the MCP tools **`search`** and **`execute`**, and **`gh auth token`** as the bearer credential. It also covers a small **platform fix** in ClawQL that was required so GitHub’s **`repos/update`** operation could be executed over REST.

## Goals

1. **Read:** List the **latest commits on `main`** (via GitHub’s “List commits” API).
2. **Write:** **Update the repository description** to a clearer summary derived from the project README.

Both were driven through the MCP server (`dist/server.js`)—not through ad-hoc `gh` REST calls for the mutation (though `gh` was used only to obtain a token compatible with `CLAWQL_BEARER_TOKEN`).

## Repository & authentication

- **Owner / repo:** `danielsmithdevelopment` / `ClawQL`
- **Auth:** `export CLAWQL_BEARER_TOKEN="$(gh auth token)"`  
  ClawQL forwards this as `Authorization: Bearer …` on outbound HTTP.
- **Bundled spec (offline):** `CLAWQL_PROVIDER=github`, `CLAWQL_BUNDLED_OFFLINE=1` (typical for local runs).

## What we ran (reproducible)

| Action | Mechanism | Script / notes |
|--------|-----------|----------------|
| List commits on `main` | `execute` → `repos/list-commits` | [`scripts/smoke-github-commits.mjs`](../../scripts/smoke-github-commits.mjs) — `npm run smoke:github-commits` |
| Patch description | `execute` → `repos/update` | [`scripts/clawql-github-patch-repo-description.mjs`](../../scripts/clawql-github-patch-repo-description.mjs) — `npm run clawql:github-repo-description` |

Example environment:

```bash
export CLAWQL_BEARER_TOKEN="$(gh auth token)"
export GITHUB_OWNER=danielsmithdevelopment
export GITHUB_REPO=ClawQL
export GITHUB_COMMIT_LIMIT=5
npm run smoke:github-commits
```

```bash
export CLAWQL_BEARER_TOKEN="$(gh auth token)"
export GITHUB_OWNER=danielsmithdevelopment
export GITHUB_REPO=ClawQL
# Optional override (GitHub max 350 characters):
# REPO_DESCRIPTION="…"
npm run clawql:github-repo-description
```

### `execute` calls (conceptual)

**List commits**

```json
{
  "name": "execute",
  "arguments": {
    "operationId": "repos/list-commits",
    "args": {
      "owner": "danielsmithdevelopment",
      "repo": "ClawQL",
      "sha": "main",
      "per_page": 5
    }
  }
}
```

**Update repository metadata**

```json
{
  "name": "execute",
  "arguments": {
    "operationId": "repos/update",
    "args": {
      "owner": "danielsmithdevelopment",
      "repo": "ClawQL",
      "description": "MCP server: search + execute over OpenAPI 3, Swagger 2, or Google Discovery, …"
    }
  }
}
```

### Discovery (`search`)

For human-driven discovery, natural-language **`search`** queries surface the right `operationId` among **~1,099** indexed GitHub REST operations—without loading the raw OpenAPI file into the model. Example intents used in development:

- List commits: *“GitHub REST list commits for repository GET repos owner repo commits”* → `repos/list-commits` ranked highly (e.g. **#2** in top 10).
- Update repo: *“PATCH update a repository repos owner”* → `repos/update` within the top hits (e.g. **#5** in top 15).

## Platform note: inline `requestBody` and `repos/update`

GitHub’s OpenAPI defines **`PATCH /repos/{owner}/{repo}`** with an **inline** JSON `requestBody` (no `components/schemas` `$ref`). ClawQL previously treated only **named** request-body schemas as “has a body,” so REST **`execute`** sent **no JSON body** and the update could not work.

The fix:

- Marks inline JSON bodies with a sentinel (`INLINE_OPENAPI_REQUEST_BODY`) when building `Operation` objects from OpenAPI.
- Builds the JSON body from `args` while **stripping path placeholders** (`owner`, `repo`, …) so they appear **only** in the URL—important because `$ref` parameters are not always reified in the indexer.

Relevant code: [`operation-types.ts`](../../src/operation-types.ts), [`openapi-operations.ts`](../../src/openapi-operations.ts), [`rest-operation.ts`](../../src/rest-operation.ts), [`tools.ts`](../../src/tools.ts), [`graphql-execute-helpers.ts`](../../src/graphql-execute-helpers.ts).

## Token usage: before vs after (planning context)

This comparison answers: *“If the model had to ‘know’ the GitHub REST surface, how big is that text vs what ClawQL returns for **`search`?*”*

It is **not** a guarantee of your invoice line item: real billing depends on the full prompt, history, tool envelopes, and model pricing (see [README.md — *Planning-context numbers vs your API bill*](../README.md#planning-context-numbers-vs-your-api-bill)).

### Measured inputs (March 2025, local workspace)

| Artifact | Bytes | ≈ Tokens (`÷ 4`) |
|-----------|------:|-----------------:|
| Bundled GitHub OpenAPI (`providers/github/openapi.yaml`) | 9,128,768 | **2,282,192** |
| `search` result JSON (top 10) for *list commits* intent | 6,285 | **1,572** |
| `search` result JSON (top 15) for *update repository* intent | 7,241 | **1,811** |

### Baseline (“before”) — naive full spec in context

Assume the assistant must have the **entire** GitHub v3 bundle in the conversational context **once** to pick operations by hand (equivalent to pasting `openapi.yaml`).

| Scenario | Spec-related tokens |
|----------|--------------------:|
| **Full OpenAPI pasted once** | **2,282,192** |
| **Full OpenAPI pasted on *two* separate planning turns** (e.g. commit task, then description task) | **4,564,384** |

### With ClawQL (“after”) — `search` only for planning

| Scenario | Planning output tokens (tool text only) |
|----------|----------------------------------------:|
| **Two `search` calls** (intents above) | **1,572 + 1,811 = 3,383** |

### Savings (planning surface only)

| Comparison | Savings |
|------------|---------|
| One full spec **vs** two searches | **2,282,192 − 3,383 ≈ 2,278,809** tokens (**~99.85%** smaller planning blob, **~674×** reduction) |
| Two pasted specs **vs** two searches | **4,564,384 − 3,383 ≈ 4,561,001** tokens (**~99.93%** smaller) |

**Important nuance:** In normal ClawQL use, the **spec never enters the model at all**—it stays in the MCP server. The table above compares against a **failure mode** (pasting or otherwise materializing the full OpenAPI). The **`execute`** step still returns **GitHub’s JSON** (often large for `repos/update`); savings on execution payloads depend on using the internal GraphQL path when available—REST fallback returns the same bodies as calling the HTTP API directly.

## Outcomes

- **Commits:** Confirmed last commits on `main` for `danielsmithdevelopment/ClawQL` via `repos/list-commits`.
- **Description:** Repository description updated via `repos/update` to a README-aligned summary (under GitHub’s **350-character** limit for descriptions).

## Takeaways

1. **Operation IDs are precise** — GitHub’s spec has many `/repos/{owner}/{repo}/…` routes; scripts pin `repos/list-commits` and `repos/update` to avoid ambiguous search matches.
2. **Auth is standard OAuth/PAT shape** — `gh auth token` is convenient; any `CLAWQL_BEARER_TOKEN` works the same for `execute`.
3. **Largest win is planning context** — indexed `search` over **~1,099** operations vs **~2.28M tokens** for the raw bundle is the headline comparison; execution payload size is dominated by GitHub’s response schemas.
