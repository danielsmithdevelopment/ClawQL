---
title: "Disaster Recovery and Business Continuity: RTO/RPO, Session Recovery, and Cross-Region Failover"
series: "Agentic AI Security Curriculum"
level: advanced
tags:
  - dr
  - bcp
  - rto
  - rpo
  - merkle
part: 28
total_parts: 32
date: "May 2026"
slug: "disaster-recovery-business-continuity"
canonical_path: "/security/best-practices/disaster-recovery-business-continuity"
description: "Per-tier RTO/RPO, agent checkpoints, active/passive failover, and session recovery decision tree."
prev: "secure-multi-tenancy-isolation"
next: "compliance-regulatory-mapping"
---

# Disaster Recovery and Business Continuity: RTO/RPO, Session Recovery, and Cross-Region Failover

RTO/RPO, Session Recovery, and Cross-Region Failover

Hello and welcome to Module 28!

Modules 1–27 have built a resilient, zero-trust, multi-tenant platform that prevents, detects, and contains threats. Now we prepare for the day the entire infrastructure itself fails — not because of an attacker, but because of a region outage, a cloud provider incident, or a natural disaster.

Incident response (Module 20) assumes the infrastructure is intact and the question is “how do we contain and eradicate the threat?” Disaster recovery assumes the infrastructure itself is gone and the question is “how do we restore service from a different location as fast as our business can tolerate?” In this module we define per-tier RTO/RPO targets, agent state serialization, a 3-2-1+ backup architecture, active/passive cross-region failover with a Merkle continuity gate, and a clear session recovery decision tree. By the end you will have a tested, measurable DR plan that keeps agents operational even when entire regions disappear.

---

DR vs Incident Response

These are two separate plans with different owners, different triggers, and different goals.

- Incident Response (IR): Infrastructure is intact. The threat is adversarial. Focus = contain, eradicate, recover evidence.

- Disaster Recovery (DR): Infrastructure itself has failed (region outage, cloud incident, etc.). Focus = restore service from backups in a different location.

Both plans must exist independently. When ransomware hits (both an attack _and_ infrastructure loss), the two plans integrate. Each has a named owner, a tested runbook, and its own testing cadence.

---

Data Tier Classification and RTO/RPO Targets

Not all data is equally critical. We classify data into four tiers with explicit Recovery Time Objective (RTO) and Recovery Point Objective (RPO) targets.

- Tier 1: Audit trail + WORM  
  RPO = 0 (no audit events may be lost)  
  RTO = 4 hours  
  (Forensic integrity is non-negotiable.)

- Tier 2: Memory store + Merkle roots  
  RPO = 15 minutes  
  RTO = 1 hour  
  (Agents can operate in degraded mode without memory, but not forever.)

- Tier 3: Active session state  
  RPO = best effort (checkpoint interval)  
  RTO = 30 minutes  
  (Uncheckpointed sessions restart cleanly.)

- Tier 4: Observability data  
  RPO = 24 hours  
  RTO = 4 hours  
  (Useful for post-incident analysis but not required for service restoration.)

Untested RTO/RPO targets are aspirations. Only tested targets are commitments.

---

Agent State Serialization

You cannot recover what you cannot describe as data. We serialize agent state into a checkpoint format:

- Checkpoint contents: agent ID, session ID, pipeline position, ATR claims snapshot, memory store read pointer, pending HITL approvals, last completed tool call.

- Each checkpoint is signed by the agent’s private key and its hash is appended to the Merkle tree.

- Checkpoint interval: 5 minutes default (configurable per agent role). This directly determines Tier 3 RPO.

Invalid checkpoint signature = clean restart (no recovery from corrupted state).

---

Backup Architecture: 3-2-1+ per Tier

We follow the 3-2-1+ rule with tier-specific implementation:

- Tier 1 (WORM): Primary bucket + synchronous cross-region replication + weekly cold storage export. Merkle root recorded externally in SIEM.

- Tier 2 (Memory store): Primary bucket + asynchronous cross-region replication (≤15 min lag) + daily cold storage.

- Vault: Raft standby in secondary region + hourly encrypted snapshot to cold storage. Backup encryption key lives in HSM (never in Vault itself — avoids circular dependency).

All backups are encrypted at rest and in transit.

---

Active/Passive Cross-Region Failover

We use active/passive failover to avoid split-brain Merkle chain conflicts.

- Passive region runs the full stack in warm-standby with continuous replication.

- Failover trigger: primary health checks fail for 5 consecutive checks over 5 minutes, followed by human confirmation before DNS cutover.

Failover sequence (fully scripted):

1. Promote Vault standby to primary.

2. Verify Merkle root continuity (hard gate — failover aborts if roots diverge).

3. Promote memory store.

4. Cut DNS to passive region.

5. Run full smoke test suite before accepting traffic.

Failback treats the original primary as a fresh deployment — never re-promote without full validation.

---

Session Recovery Decision Tree

When a region fails mid-session, we follow this automated decision tree:

- Resume: Valid, verified checkpoint exists + failure was infrastructure (not security) → load checkpoint, re-issue JWT, continue from last state.

- Restart: Checkpoint unverifiable or absent → fresh session, reads memory from the start of the context window.

- Discard: Failure was a security event → preserve checkpoint as forensic evidence, start clean session only after incident is contained. Notify the owning user before discarding.

The decision is logged to WORM with the reason and checkpoint status.

---

DR Testing Programme

We test at increasing levels of realism:

- Quarterly: Memory store restore + Vault snapshot restore to isolated test environment. Verify Merkle continuity. Document timing.

- Semi-annual: Full failover drill with canary tenant traffic. All steps including DNS cutover. Measure actual RTO per tier.

- Annual: Chaos engineering exercise. Simulate primary region failure. Execute full failover + failback. Document deviations and lessons learned.

Every test produces a signed report stored in WORM.

---

Key Takeaways (Memorize These!)

- DR and IR are different plans with different owners — conflating them produces a plan that does neither well.

- Per-tier RTO/RPO differentiation is the most important DR design decision — uniform targets produce either over-engineering or under-protection.

- Merkle root continuity verification is the gate that prevents promoting a diverged secondary — skip it and you may restore from a corrupted store.

- The session recovery decision tree must be documented and automated; human judgement under disaster conditions is inconsistent.

You now have a tested, measurable disaster recovery plan that keeps agents operational even when entire regions disappear. The platform can survive infrastructure failure with minimal data loss and minimal downtime. This completes the business continuity layer that makes the entire security stack production-ready for the real world.
