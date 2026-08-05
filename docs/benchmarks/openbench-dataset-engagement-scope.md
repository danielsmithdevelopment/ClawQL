# OpenBench managed engagement — scope template

**Engagement id:** `OBE-____`  
**Customer:**  
**Date:**  
**Suite version / git SHA:**  
**ClawQL / OpenBenchTrace schema:** `1.0`

Use this letter so scored results are unambiguous. You are responsible for the report; pin the contract up front.

---

## In scope

| Item                     | Value                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- |
| Tier                     | ☐ Report · ☐ Report + dataset · ☐ Full loop (FT + model escalation register) |
| Tasks (IDs)              |                                                                              |
| Arms                     | e.g. clawql-on / clawql-off                                                  |
| Model(s)                 |                                                                              |
| Trials per arm           |                                                                              |
| Time / turn / token caps |                                                                              |
| Grader criteria          | per-task `checker.sh` as of suite SHA above                                  |
| Durable sink             | R2/S3 bucket prefix (customer or ClawQL-operated)                            |

## Out of scope (unless listed)

- Live third-party SaaS not stubbed in the suite (e.g. production Slack / Onyx connectors)
- Statistical claims beyond reported n (Wilson CIs only if n≥3 agreed)
- PorTAL port to a new base (separate SOW after first FT)
- Public HF publication of customer traces (default: private; opt-in only)

## Deliverables

| Tier      | Artifacts                                                         |
| --------- | ----------------------------------------------------------------- |
| Report    | Scoreboard, run IDs, per-task summary, failure notes              |
| + Dataset | OpenBenchTrace JSONL, WORM manifests, scrub policy hash           |
| Full loop | Above + fine-tune job record + `tier-map.json` registration notes |

## Acceptance

- Suite SHA and schema version frozen at kickoff
- “Pass” means grader `score` / success criteria as documented for each task ID
- Customer review window: __ business days after delivery

## Sign-off

Customer: ________________ Date: ______  
ClawQL: ________________ Date: ______
