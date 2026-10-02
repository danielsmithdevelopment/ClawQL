# Corpus

| Path                     | Role                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `seed/`                  | Public RFC `.txt` downloads (gitignored); fetched by builders.                                                                   |
| `freeze-candidate/`      | Easy synthetic set (`pageindex-ab-v1-candidate`) — ceilinged under agent-lite.                                                   |
| `hard-candidate/`        | **Preferred path:** public RFCs + long Docling/weak synthetics (`pageindex-ab-v1-hard-candidate`). Harvey/ExtractBench excluded. |
| Frozen `pageindex-ab-v1` | After human second-pass; hashed in freeze manifest.                                                                              |

Contaminated-smoke docs live under `fixtures/contaminated-smoke/docs/` and must never be cited or merged into the freeze set.

```bash
python3 benchmarks/pageindex-ab/scripts/build_hard_candidate.py
node benchmarks/pageindex-ab/scripts/run_retrieval_pilot.mjs --corpus hard-candidate
# GHA: touch benchmarks/pageindex-ab/.run-hard-agent-lite on the PR
```
