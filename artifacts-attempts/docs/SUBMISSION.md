# Competition submission checklist

Deadline: **October 14, 2026**. Artifacts billing starts October 15 (Workers Paid).

## Required by Cloudflare

- [ ] 5–10 minute demo video (scenes in [`VIDEO_SCRIPT.md`](./VIDEO_SCRIPT.md))
- [ ] Source under Apache-2.0 (this repo / `artifacts-attempts/`)
- [ ] Run instructions judges can follow ([`JUDGE_RUNBOOK.md`](./JUDGE_RUNBOOK.md))
- [ ] Submitted by Oct 14

## Before recording

```bash
cd artifacts-attempts
npm ci
npm test
npm run demo:judge-smoke   # optional fast check
npm run demo:record-prep   # 3 consecutive verified local demos
```

Only start recording after `demo:record-prep` / `demo:gate` prints `GATE PASS`.

## Video must show

1. Task → three forks / attempts  
2. Evaluation + git notes  
3. One attempt **blocked** by policy  
4. Decision (calibrated auto-merge and/or approval page)  
5. Merge of winner  
6. **Release verify** (dry-run Arweave path is honest; say live Turbo is the swap)  
7. **Canary** dry-run status (10% + rollback trigger; say Workers gradual deploy is the swap)  
8. Board live update  

## Optional if credentials arrive before Oct 14

- [ ] Public standalone GitHub repo `artifacts-attempts` for judges  
- [ ] Live Artifacts forks (`ATTEMPTS_E2E=1`)  
- [ ] Live Turbo Arweave upload  
- [ ] Workers gradual deploy at `policy.canaryPercent`  

If those stay blocked, submit the local-witness path — it is real git/vitest/Merkle, not stubs.
