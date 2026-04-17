# Jira workflow token comparison (2026-03-19)

**Original:** full note was `docs/JIRA_WORKFLOW_TOKEN_RESULTS_2026-03-19.md` (moved here, trimmed); use **git history** on that path for the complete document.

**Goal:** compare **Method A** — targeted ClawQL-style `search` steps for create / assign / priority / due date / edit — vs **Method B** — loading the **full** Jira OpenAPI into context first.

**Environment (summary):** Jira Cloud REST **336** operations indexed; token heuristic **`~4` chars/token**.

**Outcome (from original run):**

- **Method A** (five targeted lookups): **~4,209** tokens total for search-style planning context.
- **Method B** (full spec): **~266,575** tokens.
- **Rough ratio:** **~63×** fewer tokens for the targeted workflow vs full-spec-in-context (spec-only; excludes tool envelopes and chat).

**Related:** multi-provider benchmark assets under [`../multi-provider-complex-workflow/`](../multi-provider-complex-workflow/); Jira bundle under [`providers/atlassian/jira/`](../../../providers/atlassian/jira/).
