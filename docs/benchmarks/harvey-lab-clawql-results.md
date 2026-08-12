# Harvey LAB × ClawQL Results — firm-knowledge

Date: 2026-08-12  
Models: Nemotron 3.5 Lightning ± ClawQL; Opus 4.8 ± ClawQL (OpenRouter validation)  
Tasks: 250 total; **Opus smoke: task 001**; **Nemotron batch 1: first 25 (Sonnet 4.6 judge)**  
Judges: Harvey-parity — `claude-sonnet-4-6` via OpenRouter; earlier Nemotron smoke used `gpt-5.4-mini`

## Status

**Batch 1 Sonnet-judged sweep** ([31562539617](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31562539617)) — finishing / rate-limited on free Nemotron tier.  
**Batch 2 blocked until fixes below land** (sweep marker removed; `max-parallel` → 2).

### Batch 1 partial ledger (completed ClawQL vs baseline)

| Task | ClawQL CPR | Baseline CPR | ClawQL All-pass | Notes                                  |
| ---- | ---------- | ------------ | --------------- | -------------------------------------- |
| 001  | 100%       | 0%           | yes             | Clean win (Pattern E)                  |
| 004  | 0%         | 50%          | no              | Early write after empty/wrong strategy |
| 007  | 33%        | 0%           | no              | Partial                                |
| 010  | 0%         | 50%          | no              | Invented COVENANT-LITE ontology flag   |
| 011  | 0%         | ~5%          | no              | 19 criteria — model ceiling            |
| 012  | 100%       | 100%         | yes             | Both pass; ClawQL more tokens          |
| 013  | 0%         | 25%          | no              | Long grind without pivot               |
| 014  | 33%        | 33%          | no              | **4.3M token blowup** — see Bug 1      |
| 015  | 0%         | 33%          | no              | Baseline lucky 3-turn read             |

### Root cause — Bug 1 (task 014)

Not vault recall dumping full docs. Transcript shows:

- Turns 1–3: empty structured recall (`COVENANT-LITE` flag does not exist in ontology)
- Turn 4: `bash ls -R $WORKSPACE_DIR` → context jumps **9k → 180k** input tokens
- Turns 5–26: that dump is re-sent every turn → **4.33M** cumulative input tokens

Baseline never did a full-tree dump (~47k peak / turn).

### Fixes shipped for batch 2

1. **Tool-result truncation** in `clawql_agent_loop.py` (`CLAWQL_LAB_MAX_TOOL_RESULT_CHARS`, default 24k)
2. **System prompt**: always write partial deliverable; ≤2 failed recalls then harness fallback; forbid `ls -R` / unbounded find
3. **Empty-recall `labGuidance.fallback`** on enriched MCP payload
4. Workflow **`max-parallel: 2`** (OpenRouter free-tier daily limit)
5. Removed `.run-nemotron-sweep` until batch 2 is intentionally re-armed

### Validity

| Claim                                          | Valid?                           |
| ---------------------------------------------- | -------------------------------- |
| Internal ClawQL lift (same judge both arms)    | **Yes**                          |
| Harvey methodology judge (`claude-sonnet-4-6`) | **Yes** (batch 1)                |
| Direct Anthropic provenance                    | **Not yet** — OpenRouter routing |

### Opus A/B (OpenRouter validation) — [31555668711](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31555668711)

| Arm                          | CPR            | All-pass | Turns | Input tokens | Wall (s) | Notes                                  |
| ---------------------------- | -------------- | -------- | ----- | ------------ | -------- | -------------------------------------- |
| `baseline` (Opus 4.8)        | **100%** (7/7) | **100%** | 35    | 1,869,702    | 437      | Sonnet 4.6 judge; no ClawQL            |
| `clawql` (Opus 4.8 + ClawQL) | **100%** (7/7) | **100%** | 5     | 95,893       | 43       | Ontology Pattern E; preferred evidence |

### Nemotron ± ClawQL (task 001 smoke) — [31552128819](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31552128819)

| Arm               | CPR            | All-pass | Turns | Notes                                 |
| ----------------- | -------------- | -------- | ----- | ------------------------------------- |
| `nemotron`        | **0%** (0/7)   | 0%       | 40    | Empty deliverable; gpt-5.4-mini judge |
| `nemotron-clawql` | **100%** (7/7) | **100%** | 5     | ALL-PASS                              |

## Next

1. Finish downloading batch 1 aggregate when run completes; publish mean CPR / all-pass
2. Re-arm `.run-nemotron-sweep` for batch 2 **after** UTC rate-limit reset (or local MLX Nemotron)
3. Defer full Ouroboros LAB loop; prompt + truncation first
4. Task 011 → Opus, not Nemotron prompt churn

## Notes

Avoid pushing `integrations/harvey-labs/**` or the LAB workflow while a sweep runs (`cancel-in-progress`). Marker is currently absent so PR pushes return to single-task smoke.
