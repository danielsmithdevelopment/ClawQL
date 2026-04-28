# Case study: GitHub provider on `danielsmithdevelopment/ClawQL`

This document records a **real** workflow against a GitHub repository using ClawQL’s bundled **`CLAWQL_PROVIDER=github`** spec (`providers/github/openapi.yaml`), the MCP tools **`search`** and **`execute`**, and a **bearer token** (typically from **`gh auth token`**) as **`CLAWQL_BEARER_TOKEN`**. It also covers a **platform fix** in ClawQL that was required so GitHub’s **`repos/update`** operation could be executed over REST when the OpenAPI used an **inline** `requestBody` (no `$ref`).

**Who this is for:** anyone proving **“ClawQL can drive GitHub REST without pasting the whole OpenAPI into the model”** — and anyone debugging **why `execute` sent an empty body** for a PATCH.

---

## 1. Problem statement

GitHub’s REST surface is **huge**: the bundled **`providers/github/openapi.yaml`** is on the order of **~9 MB** of YAML. A naive assistant workflow might try to **paste** or **summarize** the entire spec to pick **`operationId`s** — that burns **planning context** and still misses **parameter wiring** (path vs body).

ClawQL’s approach:

1. **`search`** — natural-language (or keyword) query over **indexed operations** → ranked **`operationId`** candidates + parameter hints.
2. **`execute`** — call **`operationId`** with **`args`** shaped to the OpenAPI — **after** the spec stayed **inside the MCP server**, not in the chat transcript.

This case study’s **measured** “before vs after” focuses on **planning-token** savings (see §9). Execution still returns **GitHub’s JSON** bodies — those are dominated by GitHub’s response schemas, not ClawQL’s indexer.

---

## 2. Goals

1. **Read:** List the **latest commits on `main`** (GitHub “List commits” API).
2. **Write:** **Update the repository description** to a clearer summary derived from the project README (within GitHub’s **350-character** limit).

Both were driven through the MCP server (`dist/server.js`) — not through ad-hoc `gh api` for the mutation (though **`gh auth token`** was used to obtain a compatible bearer).

---

## 3. Repository and authentication

- **Owner / repo:** `danielsmithdevelopment` / `ClawQL`
- **Auth:** `export CLAWQL_BEARER_TOKEN="$(gh auth token)"`  
  ClawQL forwards this as **`Authorization: Bearer …`** on outbound HTTP to **`api.github.com`** (per provider base URL in the spec).
- **Bundled spec (offline):** `CLAWQL_PROVIDER=github`, `CLAWQL_BUNDLED_OFFLINE=1` (typical for local runs without fetching specs).

**Security notes:**

- Treat **`CLAWQL_BEARER_TOKEN`** like any **PAT**: **least privilege**, **no** embedding in vault ingests, rotate if leaked.
- CI should use **scoped** tokens or **GITHUB_TOKEN** with explicit permissions — don’t reuse a **full-admin** PAT “because it worked locally.”

---

## 4. What we ran (reproducible)

| Action                 | Mechanism                        | Script / notes                                                                                                                                                  |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List commits on `main` | `execute` → `repos/list-commits` | [`scripts/workflows/smoke-github-commits.mjs`](../../scripts/workflows/smoke-github-commits.mjs) — `npm run smoke:github-commits`                               |
| Patch description      | `execute` → `repos/update`       | [`scripts/dev/clawql-github-patch-repo-description.mjs`](../../scripts/dev/clawql-github-patch-repo-description.mjs) — `npm run clawql:github-repo-description` |

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

---

## 5. `execute` calls (conceptual)

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

**Why pin `operationId` in scripts:** GitHub’s spec has many **`/repos/{owner}/{repo}/…`** routes; ambiguous **`search`** matches are possible. Production automation should **prefer explicit** `operationId` once validated.

---

## 6. Discovery (`search`)

For human-driven discovery, natural-language **`search`** queries surface the right **`operationId`** among **~1,099** indexed GitHub REST operations — without loading the raw OpenAPI file into the model. Example intents used in development:

- List commits: _“GitHub REST list commits for repository GET repos owner repo commits”_ → `repos/list-commits` ranked highly (e.g. **#2** in top 10).
- Update repo: _“PATCH update a repository repos owner”_ → `repos/update` within the top hits (e.g. **#5** in top 15).

**Tip:** add **HTTP method** or **path fragment** when results are noisy — **`search`** is ranked, not oracular.

---

## 7. Platform note: inline `requestBody` and `repos/update`

GitHub’s OpenAPI defines **`PATCH /repos/{owner}/{repo}`** with an **inline** JSON `requestBody` (no `components/schemas` `$ref`). ClawQL previously treated only **named** request-body schemas as “has a body,” so REST **`execute`** sent **no JSON body** and **`repos/update`** could not work.

The fix:

- Marks inline JSON bodies with a sentinel (`INLINE_OPENAPI_REQUEST_BODY`) when building `Operation` objects from OpenAPI.
- Builds the JSON body from `args` while **stripping path placeholders** (`owner`, `repo`, …) so they appear **only** in the URL — important because `$ref` parameters are not always reified in the indexer.

Relevant code: [`operation-types.ts`](../../src/operation-types.ts), [`openapi-operations.ts`](../../src/openapi-operations.ts), [`rest-operation.ts`](../../src/rest-operation.ts), [`tools.ts`](../../src/tools.ts), [`graphql-execute-helpers.ts`](../../src/graphql-execute-helpers.ts).

**Lesson:** **OpenAPI diversity** (inline bodies, discriminators, weird `$ref`s) is why **`execute`** must be **spec-driven** — not a handful of hard-coded routes.

---

## 8. Troubleshooting

| Symptom                                   | Likely cause                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **401 / 403** from GitHub                 | Expired token, missing **`repo`** scope for writes, or **SSO**-enabled org requiring token authorization. |
| **`execute` succeeds but repo unchanged** | Wrong **`operationId`**, or **body** omitted (historical inline-body bug — see §7).                       |
| **`search` returns unrelated ops**        | Query too vague — add **method**, **path**, or **`operationId`** fragment.                                |

---

## 9. Token usage: before vs after (planning context)

This comparison answers: _“If the model had to ‘know’ the GitHub REST surface, how big is that text vs what ClawQL returns for \*\*`search`?”_

It is **not** a guarantee of your invoice line item: real billing depends on the full prompt, history, tool envelopes, and model pricing (see [README.md — _Planning-context numbers vs your API bill_](../README.md#planning-context-numbers-vs-your-api-bill)).

### Measured inputs (March 2025, local workspace)

| Artifact                                                     | Bytes     | ≈ Tokens (`÷ 4`) |
| ------------------------------------------------------------ | --------- | ---------------: |
| Bundled GitHub OpenAPI (`providers/github/openapi.yaml`)     | 9,128,768 |    **2,282,192** |
| `search` result JSON (top 10) for _list commits_ intent      | 6,285     |        **1,572** |
| `search` result JSON (top 15) for _update repository_ intent | 7,241     |        **1,811** |

### Baseline (“before”) — naive full spec in context

Assume the assistant must have the **entire** GitHub v3 bundle in the conversational context **once** to pick operations by hand (equivalent to pasting `openapi.yaml`).

| Scenario                                                 | Spec-related tokens |
| -------------------------------------------------------- | ------------------: |
| **Full OpenAPI pasted once**                             |       **2,282,192** |
| **Full OpenAPI pasted on _two_ separate planning turns** |       **4,564,384** |

### With ClawQL (“after”) — `search` only for planning

| Scenario                               | Planning output tokens (tool text only) |
| -------------------------------------- | --------------------------------------: |
| **Two `search` calls** (intents above) |               **1,572 + 1,811 = 3,383** |

### Savings (planning surface only)

| Comparison                           | Savings                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| One full spec **vs** two searches    | **2,282,192 − 3,383 ≈ 2,278,809** tokens (**~99.85%** smaller planning blob, **~674×** reduction) |
| Two pasted specs **vs** two searches | **4,564,384 − 3,383 ≈ 4,561,001** tokens (**~99.93%** smaller)                                    |

**Important nuance:** In normal ClawQL use, the **spec never enters the model at all** — it stays in the MCP server. The table above compares against a **failure mode** (pasting or otherwise materializing the full OpenAPI). The **`execute`** step still returns **GitHub’s JSON** (often large for `repos/update`); savings on execution payloads depend on using the internal GraphQL path when available — REST fallback returns the same bodies as calling the HTTP API directly.

---

## 10. Outcomes

- **Commits:** Confirmed last commits on `main` for `danielsmithdevelopment/ClawQL` via `repos/list-commits`.
- **Description:** Repository description updated via `repos/update` to a README-aligned summary (under GitHub’s **350-character** limit for descriptions).

---

## 11. Takeaways

1. **Operation IDs are precise** — GitHub’s spec has many `/repos/{owner}/{repo}/…` routes; scripts pin `repos/list-commits` and `repos/update` to avoid ambiguous search matches.
2. **Auth is standard OAuth/PAT shape** — `gh auth token` is convenient; any `CLAWQL_BEARER_TOKEN` works the same for `execute`.
3. **Largest win is planning context** — indexed `search` over **~1,099** operations vs **~2.28M tokens** for the raw bundle is the headline comparison; execution payload size is dominated by GitHub’s response schemas.
4. **Spec edge cases matter** — inline request bodies required a **platform** fix; similar issues can appear for other vendors — prefer **tests** against **`execute`** for critical operations.

---

## 12. References

- [`docs/mcp-tools.md`](../mcp-tools.md) — **`search`**, **`execute`**, provider selection.
- [`README.md`](../../README.md) — planning-context token discussion.
- Bundled spec: [`providers/github/openapi.yaml`](../../providers/github/openapi.yaml)
