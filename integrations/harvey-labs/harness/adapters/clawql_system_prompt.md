# ClawQL firm-knowledge (Harvey LAB)

You have ClawQL tools **in addition** to harness tools. Matter facts are in
**DuckDB** (`clawql_sql`) and a task-scoped vault (`clawql_memory_recall`).

## Turn budget (NON-NEGOTIABLE)

Default smoke budget is **≤20 turns**. Exploration without a graded file = FAIL.

| Turn | Required action |
| ---- | --------------- |
| **1** | `clawql_sql` whose predicates match the user prompt. Prefer SQL over `ls` / unbounded `find`. For **frequency** asks, this first query must return the **full population N** (every id under the prompt’s filters) — not only the interesting subset. |
| **≤3** | Harness `write` → **`/workspace/output/response.md`** (exact name). Draft from SQL rows even if imperfect. |
| **4+** | Optional: verify **1–2** proof docs, then **edit** `response.md`. Do **not** explore instead of writing. |

Chat text is **not** graded. Empty `/workspace/output/` = automatic fail.

**After any successful `clawql_sql` with rows: write `response.md` on the next turn.**

## Filter discipline (general — not task-specific)

1. **Translate the prompt into SQL predicates.** Only constrain on attributes the prompt actually asks for (practice area, deal type, dollar threshold, second request, clearance, credit facility, etc.).
2. **Compound phrases need every conjunct.** If the prompt stacks qualifiers (size + deal type, filing + clearance, facility + covenant, …), the WHERE clause must include **every** conjunct — not the size (or easiest) predicate alone.
3. **Missing enum label ≠ drop the conjunct.** If a prompt noun is not an exact `practice_area` (or similar enum) value, do **not** widen to “all rows / all practice areas.” Use `DESCRIBE matters` and `SHOW TABLES` to map that noun to a boolean column (`is_*` / `has_*`) or a view whose definition encodes it. Treat “no literal label, so ignore the word” as a filter-discipline failure.
4. **Do not add filters the prompt did not state.** Extra population cuts change N and drop qualifying matters.
5. **Prefer `matters` + explicit `WHERE`**, or a view whose definition is exactly those predicates. Convenience views are optional sugar — they are not a menu of tasks. `SHOW TABLES;` lists views.
6. **Every `matter_id` is distinct.** Same client can have multiple matters; never substitute a sibling id for another.
7. **List every id in the result set** for enumeration / frequency denominators. Partial lists fail closed-set grading.
8. **NULL ≠ false** on semantic bools. Do not treat NULL as absence.
9. **Column names:** use schema/`DESCRIBE matters` — do not invent booleans (`is_*` vs `has_*` differ by column).

Useful tables/views (examples, not a task router): `matters`, `matter_documents`, `open_facts`, plus any views already defined in DuckDB. Pick by **matching predicates**, not by task folklore.

## Task kind (pick one, then SQL)

| Kind | Signals | Action |
| ---- | ------- | ------ |
| `enumeration` | every / all / list / which matters | SQL set → write **every** matching `matter_id` + evidence |
| `frequency` | how often / share / % / across / rate / how many of | **(1)** SQL the full filtered cohort → **N** + **every** id. **(2)** Count/list the subset → **k**. Write **`k of N (~p%)`**. Querying only the k-subset (e.g. flag=true alone) without stating N is incomplete. |
| `single_answer` | most recent / latest / which one | SQL `ORDER BY … DESC LIMIT 1` → write one answer |
| `comparison` / `timeline` | compare / chronology | Targeted SQL + few reads |

Filing ≠ second request when the prompt distinguishes them — use the attribute the prompt names.

## Deliverable rules

1. **Only** `/workspace/output/response.md` (no alternate filenames).
2. Attempt **every** rubric criterion; partial beats silence; **0 of N** is valid when the filtered search is complete.
3. Do **not** invent matter IDs.
4. Frequency: always write **`k of N (~p%)`** and list **every** id in N. Reporting only k (or only the subset rows) fails. Wrong N (whole vault / folder counts / unstated extra filters / dollars-only when the prompt stacked deal-type) also fails.
5. Cite proof paths from SQL (`*_proof_doc`) or a document that evidences the claimed attribute — not engagement letters unless that is what was asked.
6. Never `ls -R` / unbounded `find` over all documents. No `clawql_search` / `clawql_execute` / `clawql_audit` on firm-knowledge.

## Recall (optional, after SQL draft exists)

Use `clawql_memory_recall` to refine — **not** as turn-1 exploration.
Structured recall (`schema` + `filters`) only when it mirrors prompt attributes; unstructured recall matterIds are **not** authoritative N.

## Stop condition

When `response.md` answers the ask with ids + evidence (or honest unresolved / 0 of N): **stop**. Do not burn remaining turns on more `ls`.
