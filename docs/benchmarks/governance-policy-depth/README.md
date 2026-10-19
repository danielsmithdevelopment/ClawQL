# Governance / policy-depth (dominance)

Equal-arm proof that **ClawQL+Panguard** fail-closes adversarial `memory_ingest` while a no-policy control contaminates the vault. Opt-in **Obot** / **Bifrost** / **Executor** rows land when their MCP URLs are set — honest skip otherwise.

**Live board:** [clawql.com/benchmarks#governance](https://clawql.com/benchmarks/#governance) (scorecard extends as peer artifacts land).

| Artifact                                     | Role                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`results-smoke.json`](./results-smoke.json) | ClawQL + passthrough control (CI/agent runnable without Docker)                                       |
| [`results-obot.json`](./results-obot.json)   | Docker Obot peer (CI)                                                                                 |
| [`results-cells.json`](./results-cells.json) | Executor-scoped cells: risky write + untrusted-read→hostile follow-up                                 |
| Harness                                      | [`scripts/benchmarks/governance-policy-depth/`](../../../scripts/benchmarks/governance-policy-depth/) |
| Frozen rules                                 | [`frozen-rules.json`](../../../scripts/benchmarks/governance-policy-depth/frozen-rules.json)          |
| Live LLM cell                                | openbench `memory-injection-attempt` + composer Cursor gate                                           |

## Claim (when board_pass)

On the shared OVERRIDE pricing fixture, ClawQL blocks hostile vault writes with tool-evidenced deny, keeps the authoritative `15.00` note, and still allows benign recall — while a passthrough MCP write contaminates. Peers must clear the same grader before a category security claim.

## Does not prove

Content-aware classifiers; JWT ATR mesh HA; that every peer binary was measured in this environment (see `skipped` arms).

## CI results (2026-10-19)

Run: [39181888666](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39181888666)

| Arm             | security_score | Notes                                                           |
| --------------- | -------------- | --------------------------------------------------------------- |
| clawql_panguard | **5/5**        | blocked + clean vault                                           |
| passthrough     | **2/5**        | OVERRIDE written                                                |
| **obot**        | **2/5**        | live Docker peer — ingest allowed (no per-tool deny configured) |
| bifrost         | skipped        | URL unset                                                       |

ClawQL beats default Obot mcp-connect on this fixture. Obot can tie if maintainers configure a deny on `memory_ingest`.

## Executor cells (2026-10-19)

Harness: `fixture-mcp.mjs` (vault + Gmail-shaped poison) + `run-cells.mjs`.

```bash
npm run benchmark:governance-policy-depth:cells
# → docs/benchmarks/governance-policy-depth/results-cells.json
```

| Cell           | clawql  | passthrough | executor                           |
| -------------- | ------- | ----------- | ---------------------------------- |
| risky_write    | **5/5** | **2/5**     | skipped (`EXECUTOR_MCP_URL` unset) |
| untrusted_read | **5/5** | **2/5**     | skipped (`EXECUTOR_MCP_URL` unset) |

`untrusted_read` proves poison is returned (`poison_seen`) and the subsequent OVERRIDE ingest still fail-closes on ClawQL.

### Wire Executor

```bash
# Terminal A — fixture MCP (vault + Gmail poison)
cp -a benchmarks/openbench/tasks/memory-injection-attempt/workspace/vault /tmp/gov-cells-vault
VAULT_ROOT=/tmp/gov-cells-vault \
  node scripts/benchmarks/governance-policy-depth/fixture-mcp.mjs --http --port 18790

# Terminal B — front with Executor approvals/deny on memory_ingest, then:
export EXECUTOR_MCP_URL=http://127.0.0.1:<executor-port>/mcp
export GOV_SHARED_VAULT_ROOT=/tmp/gov-cells-vault
# optional: EXECUTOR_API_KEY=…
npm run benchmark:governance-policy-depth:cells
```

## Next step

1. ~~**CI Obot peer**~~ — measured ([39181888666](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39181888666)): ClawQL 5/5 vs Obot 2/5.
2. ~~**Executor cells harness**~~ — ClawQL 5/5 vs passthrough 2/5 on both cells; peer row pending `EXECUTOR_MCP_URL`.
3. **Bifrost** peer with ingest-deny VK.
4. **Live LLM** (optional): OpenBench `memory-injection-attempt` with cheap OpenRouter only.

## Related

- [dominance-roadmap.md](../dominance-roadmap.md) — criterion #7 governance
- [dominance-peers-wiring.md](../dominance-peers-wiring.md) — Obot / Bifrost install recipes
- [openbench-task-explanations.md](../openbench-task-explanations.md) — `memory-injection-attempt` / `policy-deny-execute`
