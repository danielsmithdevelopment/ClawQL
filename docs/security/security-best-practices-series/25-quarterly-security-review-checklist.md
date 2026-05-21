---
title: "Quarterly Security Review Checklist: Metrics, Rotations, and Continuous Posture Verification"
series: "Agentic AI Security Curriculum"
level: advanced
tags:
  - governance
  - audit
  - operations
part: 25
total_parts: 30
date: "May 2026"
slug: "quarterly-security-review-checklist"
canonical_path: "/security/best-practices/quarterly-security-review-checklist"
description: "Evidence-driven quarterly review: rotations, allowlists, restore tests, and signed reports."
prev: "red-teaming-adversarial-testing"
next: "vulnerability-management-patch-cryptography"
---

# Quarterly Security Review Checklist: Metrics, Rotations, and Continuous Posture Verification

Metrics, Rotations, and Continuous Posture Verification

Hello and welcome to Module 25!

Modules 1–24 have given us a full technical security stack, living threat models, adversarial testing, and automated response. But security posture does not stay perfect on its own. Certificates slowly approach expiry, exceptions quietly accumulate past their deadlines, allowlists grow beyond current needs, and baselines drift without anyone noticing.

A quarterly review is the structured forcing function that catches this natural decay before it becomes a real gap. It is not a meeting where people say “everything looks good.” It is a verification exercise that produces a signed, auditable document with evidence for every item. In this module we walk through the exact checklist, the evidence required for each item, and how to turn findings into tracked issues with owners and deadlines. By the end you will have a repeatable process that keeps the entire platform’s security posture healthy, measurable, and continuously improving.

---

Why Quarterly Cadence Matters

Security posture decays continuously and silently:

- Certificates approach expiry

- Temporary exceptions become permanent

- Allowlists grow beyond business need

- Behavioral baselines drift

Without a forcing function, small issues compound into major gaps. The quarterly review creates that forcing function. It must produce a signed, auditable record — not a slide deck or meeting notes, but a verifiable document stored in WORM.

All findings are tracked as issues with named owners and deadlines. Any finding that remains unresolved at the next quarterly review escalates automatically to the security leadership team.

---

Certificate and Credential Rotation Check

We start with the items that have hard expiration dates.

- Inventory every certificate and credential against the central certificate inventory (Module 9).

- Flag any certificate with fewer than 90 days remaining. Verify that cert-manager renewal is configured and working.

- Check Vault lease renewal rates: are any dynamic secrets failing to renew before expiry?

- Verify the last rotation date for every long-lived credential (CA certificate, HSM unsealing key, signing keys) against its declared rotation interval.

Run the built-in command:

clawql security cert-audit --compare-last-quarter

-  and confirm the output matches the previous quarter’s report (or explain any differences).

Any certificate or credential that is not on track becomes a critical finding with a 30-day remediation deadline.

---

Allowlist Review

Allowlists are a common source of creeping risk.

- ServiceEntry allowlist (Module 6): Review every external hostname. Remove any entries for deprecated integrations.

- ClawHub skill allowlist (Module 3): For every approved skill, verify the pinned manifest hash still matches the current published manifest. Remove any skills no longer in active use.

- ATR role registry: Confirm every role has a declared owner and a written justification. Flag any role that has not been used in the last 90 days.

- Admin role assignments (Module 30): Verify no individual holds two mutually exclusive roles. Review any exceptions from the separation-of-duties report.

Each removed or updated entry is documented in the review report.

---

Exception and Residual Risk Review

We explicitly review every accepted deviation from the baseline.

- Enumerate all open exceptions: vulnerability management SLO exceptions (Module 26), Panguard rule exceptions, compliance mapping gaps (Module 29).

- Verify that each exception has not expired beyond its stated deadline. An expired exception without renewal is a critical finding requiring immediate escalation.

- Review the residual risk register from the STRIDE model (Module 22). Any residual risk whose conditions have changed requires an immediate threat-model update.

---

Backup and Restore Verification

We do not just trust that backups work — we test them.

- Execute a full memory-store restore from the most recent snapshot into an isolated test environment.

- Verify Merkle root continuity after the restore.

- Execute a Vault Raft snapshot restore to a test Vault instance.

- Document the exact timing and compare it against the documented RTO targets from Module 28. Any restore that exceeds its RTO is a finding.

These tests are performed live during the review and the results are attached to the signed report.

---

Metrics Review Against Baselines

We compare current metrics to the established baselines from previous quarters.

Key metrics to review:

- Panguard block rate: Is it trending up versus the 90-day baseline? Investigate the top three blocked rules by volume.

- ATR violation rate per rule: Any rule with zero fires in the last 90 days? Schedule it for testing in the next red-team exercise (Module 24).

- Memory integrity check failures: Must be exactly zero. Any non-zero value is a critical finding.

- Egress anomaly detection rate: Is it trending up per tenant?

- Orphaned identity count from the weekly reconciliation reports: Must be zero. Any open orphans require immediate action.

For any metric that is trending in the wrong direction, the review must document the root cause and the corrective action with an owner and deadline.

---

STRIDE Model Update

The living threat model (Module 22) is reviewed as a standing agenda item.

- Review the attack tree against every change made in the quarter (new pipelines, new skills, new external integrations, post-incident findings).

- Add or modify branches for any new threat paths identified.

- Document any new residual risks accepted this quarter with explicit sign-off from the security team lead.

---

Signed Review Output

The review ends with a single signed artifact:

- A quarterly review report containing every checklist item with pass/fail/finding status.

- Open findings listed with owners, deadlines, and severity.

- Summary of all metrics and trends.

The report is signed by the security team lead and stored in WORM alongside the full evidence package (Module 29). It is also shared with the compliance team for SOC 2, HIPAA, GDPR, and EU AI Act evidence collection.

---

Key Takeaways (Memorize These!)

- The quarterly review is a verification exercise, not a confidence-building exercise — every item must produce evidence, not an assertion.

- Expired exceptions without renewal are critical findings; they represent commitments that were made and not kept.

- Backup restore testing is only meaningful if the timing is measured against documented RTO targets — a restore that took 6 hours against a 1-hour target is a finding.

- The metric review is where alert tuning decisions are made — a rule with zero fires in 90 days either isn’t being triggered or isn’t working, and the quarterly review is where that question is asked.

You now have a repeatable, evidence-driven quarterly process that keeps the entire security posture healthy and auditable. This is the governance layer that ensures everything we built in Modules 1–24 continues to work as intended, quarter after quarter, year after year. The platform does not drift into insecurity — it is actively kept secure.
