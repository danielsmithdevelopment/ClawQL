# executor-cmp-001: GitHub PR filter (Executor comparison)

Find all **open** pull requests authored by **`alice-dev`** in repo **`acme/platform`**
with **more than 3** review comments. Return **title** and **review comment count**
for each matching PR.

## Rules

1. This task is used for **token measurement**, not live API calls in OpenBench CI.
2. Run the benchmark harness locally:

   ```bash
   npm run benchmark:executor-comparison
   ```

3. Write harness output to `results/executor-cmp-001.json` relative to the task
   workspace (or rely on repo-root
   `docs/benchmarks/executor-comparison/executor-cmp-001.json`).

## Measurement arms

| Arm | Tool interface | What enters context after `execute` |
| --- | --- | --- |
| executor | search → describe → call (codemode) | Raw GitHub REST JSON (no projection) |
| clawql | search → execute + `fields` | Projected title + reviewCommentCount |

Report **tool_defs** and **tool_result** separately. Default `focus=input`.

## Matched conditions

- Tokenizer: `cl100k_base`
- `num_predict`: 256 (when model step is added)
- `temperature`: 0
- Fixed system prompt across arms

Do not publish dry-run placeholder numbers.
