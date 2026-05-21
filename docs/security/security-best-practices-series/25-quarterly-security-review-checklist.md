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



## **MODULE 26**

### **Vulnerability Management, Patch Cadence, and Cryptographic Agility**

Pinning dependencies for supply chain integrity and patching them when CVEs appear are not contradictory requirements — they are two halves of a discipline that only works if both halves run on a defined process. Severity-based SLOs with component-specific triage criteria, session-drain rolling updates that patch without disrupting live agents, and cryptographic algorithm migration playbooks for when standards change beneath the platform together make vulnerability management a repeatable operational process rather than a reactive scramble. This module closes the loop that Module 1 opens.

**The pinning/patching tension**

- Module 1 says pin everything for supply chain integrity  

- Vulnerability management requires moving those pins forward when CVEs are disclosed  

- These are not contradictory — they require a disciplined process to reconcile  

- The failure modes in each direction: unpinned = supply chain risk; never updated = known-vulnerable stack  


**CVE triage criteria for MCP components**

- CVSS score alone is insufficient: reachability in the tool-call dispatch path is the primary triage factor  

- Four triage questions: Is the vulnerable component in the tool-call path? Is the vulnerable code path reachable from agent input? Does the exploit require network access from outside the cluster? Is a public proof-of-concept exploit available?  

- Component priority ordering: gateway and Panguard > Vault integration > memory store > observability stack  

- ClawHub skill dependencies: different triage path because skills run in Kata sandboxes; the blast radius assumption is sandbox-constrained  


**Patch SLOs by severity**

- Critical (CVSS ≥9.0 or public PoC against Tier 1 component): patch in staging within 8 hours, production within 24 hours; emergency CAB  

- High (CVSS 7.0–8.9, reachable with chaining): staging within 48 hours, production within 7 days; standard CAB  

- Medium (CVSS 4.0–6.9, limited reachability): within 30 days; normal sprint cycle  

- Low (CVSS <4.0): within 90 days; bundled with quarterly dependency update  

- Exceptions: documented with CVE, reason, compensating control, expiry date (max 30 days beyond SLO), security owner approval  


**Session-drain rolling update**

- preStop lifecycle hook: gateway calls /admin/drain to stop accepting new sessions before terminating  

- maxSurge: 1, maxUnavailable: 0: new pod starts (running patched version) before old pod terminates  

- Existing sessions complete on the old pod; new sessions route to the patched pod  

- terminationGracePeriodSeconds: 330: 5-minute drain window before forced termination  

- Pre-patch smoke test: 10 critical tool calls against the patched gateway in staging before production promotion  

- Rollback criteria: >20% Panguard block rate increase, any unhandled 500, memory Merkle check fails post-deploy  


**Dependency automation compatible with pinning**

- Renovate configured to update digest pins, not remove them  

- Lockfile-based updates: package-lock.json, Pipfile.lock, Helm Chart.lock  

- Patch-level auto-merge when: all CI gates pass including security test suite, supply chain verification, and skill lint  

- Major and minor updates: always require human review, never auto-merge  

- Harbor allowlist update required before any image digest change can merge — Renovate PR triggers a required check  

- Weekly batched updates for minor/patch; unbatched PRs for CVE-triggered updates with appropriate SLO label  


**Cryptographic agility: JWT algorithm migration**

- Migration from RS256 to ES256: transition period where both algorithms are accepted for verification  

- issuanceAlgorithm: ES256 from day one of transition — all new tokens use the new algorithm  

- acceptedAlgorithms: [RS256, ES256] during transition window  

- Hard end date: after this date, RS256 rejected — set in config before transition begins  

- No session disruption: all active tokens were issued after the algorithm switch  


**mTLS CA algorithm migration**

- Dual-signing: issue a new ECDSA intermediate CA alongside the existing RSA CA  

- Both CAs trusted during the transition window  

- New leaf certificates issued from the ECDSA CA from day one of transition  

- RSA CA removed from trusted roots after all RSA leaf certificates have expired naturally  

- Cert-manager clusterissuer update triggers new certificate issuance across the mesh  


**Memory Merkle hash function migration**

- clawql memory reroot --from sha256 --to sha3-256: recomputes all hashes with new algorithm  

- Stores both old and new root; transition record written to WORM  

- Historical entries verifiable with old algorithm; new entries use new algorithm  

- Transition record becomes part of the immutable audit trail  


**Certificate lifecycle management**

- Certificate inventory: name, issuer, algorithm, expiry, cert-manager renewal config, owner  

- renewBefore: 720h (30 days): cert-manager renews before expiry  

- Alert at <14 days remaining: catches cert-manager failures before they cause outages  

- Annual forced rotation drill in staging: manually expire a certificate and verify cert-manager renews without interruption  


**Key takeaways to cover**

- Pinning and patching are complementary disciplines; the process that reconciles them is the vulnerability management program  

- Triage based on reachability in the tool-call path, not just CVSS score — a critical CVSS in an observability component is less urgent than a medium CVSS in the gateway  

- Session drain via rolling update means patches can be applied without service interruption  

- Cryptographic agility must be planned before the algorithm is deprecated — a migration under pressure produces outages  




---
