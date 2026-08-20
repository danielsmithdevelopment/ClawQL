# Harvey LAB × ClawQL — pause / resume handoff

**Updated:** 2026-08-11 (three-arm + Nemotron)  
**Paused scoring:** 2026-08-08  
**Branch / PR:** overlay on `main` via [#881](https://github.com/danielsmithdevelopment/ClawQL/pull/881); Arm C wiring on `cursor/harvey-lab-three-arm-nemotron-4ff0`  
**Do not outreach Harvey** until a publishable ledger exists (Opus A/B at minimum; Arm C preferred).

## Goal

Run ClawQL against Harvey LAB [`firm-knowledge`](https://github.com/harveyai/harvey-labs) (250 tasks, shared Calderwood & Harkness DMS) and record **criterion pass rate** + **all-pass rate** with Harvey’s rubric judge.

## Three arms (August 2026)

Harvey + Trajectory published LAB results for **NVIDIA Nemotron 3.5 Lightning** (post-trained on LAB): **8.3% all-pass** (vs base 0%; beats Opus 4.6 at 6.6%). That changes the strategy:

| Arm   | Model                  | ClawQL | Purpose                                                                                               |
| ----- | ---------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| **A** | Opus 4.8               | no     | Frontier baseline                                                                                     |
| **B** | Opus 4.8               | yes    | Does ClawQL improve frontier?                                                                         |
| **C** | Nemotron 3.5 Lightning | yes    | Does ClawQL compound LAB post-training? If >8.3% all-pass, publishable reply to Harvey’s announcement |

Valid comparisons: **A vs B** (same Opus). Arm C is compared to Harvey’s published Nemotron 8.3% (and optionally a future Nemotron-without-ClawQL arm). Do **not** compare Sonnet vs Opus across arms.

**Fine-tune skip for immediate LAB:** NVIDIA/Trajectory already did legal-domain post-training. Do **not** block the ledger on our own DPO/GRPO. Use Nemotron as Frugal/specialized base + ClawQL retrieval. The training flywheel remains valuable after scores exist / for other domains — see [Training Pipeline v0.1](../inference/clawql-inference-training-pipeline.md).

## Decision locked

| Topic                  | Decision                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| Where to run           | **GitHub Actions** — repo secret `OPENROUTER_API_KEY`                        |
| Not Cursor Cloud Agent | Cloud Agent pods do **not** inherit GHA secrets                              |
| Debug model            | Sonnet via OpenRouter (`claude-sonnet-4-6`)                                  |
| Publishable A/B        | Opus 4.8 both arms                                                           |
| Arm C                  | `clawql-cc/nvidia/nemotron-3.5-lightning` (OpenRouter chat; default `:free`) |
| Judge                  | Sonnet (all arms)                                                            |
| Vault isolation        | Task-scoped vault; delete/recreate between tasks                             |
| DMS ingest             | Priority docs per matter (not all ~9k binaries)                              |
| Cost note              | **250** firm-knowledge tasks — gate full Opus sweep                          |

## What’s landed

| Path                                                              | Status                                   |
| ----------------------------------------------------------------- | ---------------------------------------- |
| `integrations/harvey-labs/harness/adapters/clawql.py`             | Anthropic + ClawQL (Arms B)              |
| `integrations/harvey-labs/harness/adapters/clawql_chat.py`        | OpenRouter chat + ClawQL (Arm C)         |
| `integrations/harvey-labs/harness/adapters/clawql_lab_session.py` | Node MCP proxy subprocess (~100 lines) |
| `integrations/harvey-labs/scripts/lab-pre-ingest.mjs`               | Node vault seed + MCP `data_ingest`    |
| `integrations/harvey-labs/scripts/lab-mcp-proxy.mjs`              | Runtime MCP tool execution             |
| `integrations/harvey-labs/stack-version.json`                     | Canonical stack tag (`ts-clawql-data-v2`) |
| `docs/benchmarks/harvey-lab-stack-lineage.md`                     | Legacy quarantine + trace taint matrix |
| `integrations/harvey-labs/harness/adapters/clawql_openrouter.py`  | Anthropic + OpenAI OpenRouter clients    |
| `integrations/harvey-labs/scripts/apply_clawql_adapter.py`        | Overlay + `clawql` / `clawql-cc` routing |
| `integrations/harvey-labs/scripts/run-lab-gha.sh`                 | GHA entrypoint (3 arms)                  |
| `.github/workflows/harvey-lab-firm-knowledge.yml`                 | `workflow_dispatch`                      |
| `scripts/start-clawql-for-lab.sh`                                 | Task-scoped MCP + vault                  |
| `integrations/harvey-labs/tests/test_openrouter_mapping.py`       | OpenRouter model mapping unit tests      |
| `docs/benchmarks/harvey-lab-*.md`                                 | Ledgers + this handoff                   |

## Verified before pause (still true)

- Harvey LAB docs read; task `firm-knowledge/tasks/001` inspected (11+ criteria)
- `uv sync`, Podman, sandbox smoke OK
- ClawQL MCP smoke + isolation unit tests pass
- Overlay apply against current harvey-labs checkout

## Not done (resume here)

1. **★ Nemotron ± ClawQL (OpenRouter only):** `arms=nemotron,nemotron-clawql`, judge `openai/gpt-5.4-mini`, task `001` — **no Anthropic key**. Ontology Pattern E required on ClawQL arm (`schema`+`filters`; `HSR_SECOND_REQUEST` title flag). `max_matters=0` catalogues full DMS into ontology.
2. **Phase A (Sonnet A/B):** needs Anthropic — `baseline,clawql`, judge Sonnet
3. **Phases B–D:** 5-task sample, vault isolation live check, prompt tune — still Sonnet
4. **Phase E:** Opus A/B (+ Nemotron) firm-knowledge sweep; prefer Sonnet judge for Claude arms
5. Fill `harvey-lab-baseline.md` + `harvey-lab-clawql-results.md`
6. Optional: RTP/OBT Cloudflare traces with `community_model` consent

## Resume commands

```bash
# Preferred: push to the PR branch — matrix runs automatically (OpenBench-style)
# Arms: nemotron + nemotron-clawql in parallel; judge openai/gpt-5.4-mini

# Or manual dispatch (needs actions:write):
gh workflow run harvey-lab-firm-knowledge.yml \
  --ref cursor/harvey-lab-three-arm-nemotron-4ff0 \
  -f task=firm-knowledge/tasks/001 \
  -f arms=nemotron,nemotron-clawql \
  -f nemotron_model=nvidia/nemotron-3.5-lightning:free \
  -f judge_model=openai/gpt-5.4-mini \
  -f max_turns=15 \
  -f max_matters=5
```

**Credentials:** Nemotron pair + `gpt-5.4-mini` judge = **`OPENROUTER_API_KEY` only**. Claude arms still need Anthropic (or Claude-on-OpenRouter). Re-score with Sonnet later for publishable ledger parity with Opus A/B.

## Related OpenBench (mechanism, not LAB scores)

| Cell                  | Note                                                |
| --------------------- | --------------------------------------------------- |
| B-7.1 / B-7.2 / B-7.3 | Synthetic fixture wins — validate architecture only |
| B-7.4 full C&H corpus | LAB DMS is the real firm corpus for LAB scores      |

## Anti-patterns

- Do not treat OpenBench B-7 synthetic wins as Harvey LAB results
- Do not compare Sonnet vs Opus across arms
- Do not run Phase E until Phases A–D are clean
- Do not block LAB scoring on our own fine-tune (Arm C uses NVIDIA/Trajectory post-train)
- Do not rely on Cursor Cloud Agent secrets for LAB inference

## After the LAB sweep — training flywheel

Once ledgers exist and RTP/OBT traces are in the training bucket, the four-round sequence in **[Training Pipeline v0.1](../inference/clawql-inference-training-pipeline.md)** remains valuable for compounding — it is **not** a prerequisite for the first publishable LAB number.
