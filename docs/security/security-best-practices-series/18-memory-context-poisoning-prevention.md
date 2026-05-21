---
title: "Memory and Context Poisoning Prevention: Redaction at Source and Immutable Agent Memory"
series: "Agentic AI Security Curriculum"
level: advanced
tags:
  - memory
  - merkle
  - worm
  - poisoning
  - gdpr
part: 18
total_parts: 30
date: "May 2026"
slug: "memory-context-poisoning-prevention"
canonical_path: "/security/best-practices/memory-context-poisoning-prevention"
description: "Merkle integrity, WORM storage, per-subject encryption, and poisoning detection at write time."
prev: "gpu-resource-protection-isolation"
next: "security-monitoring-observability-siem"
---

# Memory and Context Poisoning Prevention: Redaction at Source and Immutable Agent Memory

Redaction at Source and Immutable Agent Memory

Hello and welcome to Module 18!

Modules 1–17 have secured our supply chain, runtime enforcement, data classification, model weights, and GPU isolation. Now we protect the one surface that outlives every session: the agent’s long-term memory.

A poisoned memory entry does not cause immediate harm — it sits quietly until the agent retrieves it days or weeks later and treats it as trusted historical context. By the time the damage appears, tracing the origin is difficult and removal is uncertain. Memory is the most underprotected surface in most agentic platforms, and it grows with every session the agent completes.

In this module we make memory tamper-evident, GDPR-compliant, and poisoning-resistant using redaction at source, Merkle-tree integrity, append-only semantics, WORM storage, and per-subject encryption. By the end you will have a memory system that is as immutable and verifiable as the WORM audit trail itself.

---

Why Long-Term Memory Is the Most Underprotected Surface

Memory is a persistent, cross-session attack surface with four distinct poisoning vectors:

- Direct write injection (malicious tool result or user message)

- Retrieval poisoning via RAG (a poisoned document is recalled later)

- Inter-agent message poisoning (a compromised subagent fabricates a result)

- Temporal drift (post-write modification of an existing entry)

A successful poisoning attack is delayed-action: the entry looks innocent when written but becomes dangerous when retrieved in a future context. Traditional monitoring misses it because the harm happens long after the write. We must make memory tamper-evident from the moment it is created.

---

Classification and Redaction at Write Time

Presidio runs as a Panguard-integrated service and is invoked on every memory write before the data is committed.

What happens:

- All content-bearing fields are scanned for PII, credentials, and other sensitive entities.

- Detected values are replaced with structured placeholders: [REDACTED:PERSON], [REDACTED:EMAIL_ADDRESS], etc.

- For secret-classified content or any credential pattern: the entire write is rejected — partial redaction is never sufficient.

The classification level is stored as metadata alongside every entry. The gateway enforces it at recall time so an agent with max_classification: internal can never retrieve confidential entries. Classification is enforced server-side, never client-side.

---

Per-Subject Encryption for GDPR Compliance

Each data subject’s memory entries are encrypted with a unique per-subject key stored in Vault’s transit engine.

This gives us the perfect solution to the GDPR right-to-erasure vs. WORM conflict:

- Erasure request → vault delete transit/tenant-a/keys/subject-key-${DATA_SUBJECT_ID}

- The ciphertext remains in the store (preserving Merkle integrity and forensic history).

- The data is permanently irrecoverable because the key is gone.

Key deletion is irreversible — always confirm the GDPR request before executing. This satisfies Recital 26: data that cannot be attributed to an identified person is no longer personal data, while keeping the audit trail intact.

---

Merkle-Tree Integrity

Every memory entry is part of a chained Merkle tree:

hash_n = SHA-256(entry_content + entry_metadata + prev_root)

On every write:

- A new Merkle root is computed.

- The root is recorded in the WORM audit trail and exposed in Prometheus.

Any post-write modification to a stored entry changes its hash and invalidates all subsequent roots.

Scheduled integrity checks run every 15 minutes:

- On failure: all memory reads are blocked, an alert fires, and the security team is notified.

- Blocking reads on integrity failure is intentional — a store whose integrity cannot be verified must not serve results.

---

Append-Only Semantics and WORM Storage

Memory entries are never updated in place. “Updates” are implemented as new entries with a supersedes field referencing the prior entry’s hash. The original entry remains in the store forever.

All memory is stored in S3 (or equivalent) with:

- Object Lock in COMPLIANCE mode

- 90-day minimum retention (configurable to match the longest regulatory requirement)

No API call, IAM policy, or even root account action can delete or modify a WORM-protected entry during the retention period. This is the final backstop.

---

Poisoning Detection Rules

Panguard blocks poisoning at write time:

- Rule: block any memory write containing instruction-injection patterns (ignore previous instructions, your new goal is, system prompt:, override:, etc.).

- Rate limiting: >50 memory writes in 60 seconds from one session → throttle + warning.

Weekly memory audit:

- Full Merkle verification replay

- Scan of every entry for blocked patterns

- Signed audit report stored in WORM and referenced in the quarterly review (Module 25)

---

Inter-Agent Message Encryption and Mutual Auth

Memory poisoning can also arrive via inter-agent messages over NATS JetStream.

Protections:

- mTLS (Module 4) + message-level AES-256-GCM encryption

- Each agent has its own mTLS certificate — impersonation is impossible.

- Subject-level ACLs: each agent publishes only to its own namespace and subscribes only to declared inputs.

- Message-level encryption key is fetched from Vault per conversation — even a compromised broker cannot read the content.

---

Key Takeaways (Memorize These!)

- Memory is a persistent attack surface that outlasts the session that created it — poisoning attacks are delayed-action.

- The Merkle tree converts any post-write modification into a detectable event — tamper-evidence is a structural property, not a monitoring layer.

- GDPR cryptographic erasure (key deletion, not data deletion) is the only solution to the erasure/WORM conflict that preserves both regulatory compliance and forensic integrity.

- WORM storage is the final backstop — no administrative action can destroy the memory history during the retention period.

You now have long-term memory that is redacted at source, cryptographically immutable, GDPR-compliant, and poisoning-resistant. A poisoned entry cannot be written, cannot be modified after the fact, and cannot be silently retrieved later. This closes the last major persistent attack surface in the agentic platform.
