---
title: "Authentication and Session Management: Per-Request Scoped Tokens, OAuth/OIDC, Rotation, and Replay Prevention"
series: "Agentic AI Security Curriculum"
level: intermediate
tags:
  - authentication
  - oauth
  - jwt
  - nonce
  - session
part: 9
total_parts: 32
date: "May 2026"
slug: "authentication-session-management-scoped-tokens"
canonical_path: "/security/best-practices/authentication-session-management-scoped-tokens"
description: "Tool-scoped tokens, OAuth for external APIs, nonce replay prevention, and device pairing."
prev: "secrets-at-rest-vault-hsm-audit"
next: "agent-identity-lifecycle-provisioning"
---

# Authentication and Session Management: Per-Request Scoped Tokens, OAuth/OIDC, Rotation, and Replay Prevention

Per-Request Scoped Tokens, OAuth/OIDC, Rotation, and Replay Prevention

Hello and welcome to Module 9!

Modules 1–8 have given us trusted images, admission control, vetted skills, zero-trust networking, a hardened gateway, strict egress, scoped identities, and dynamic secrets from Vault. Now we secure the very first step every agent takes: authentication and session management.

Agent sessions are not like traditional web sessions. They can run for minutes or hours, make hundreds of tool calls per minute, and carry powerful ATR claims. A long-lived session token that survives the entire session becomes a high-value credential an attacker can use for its full remaining lifetime.

In this module we replace long-lived tokens with per-request scoped tokens, nonce-based replay protection, short TTLs, and proper second-factor patterns. By the end you will have an authentication system where stealing a token is irrelevant — because the token expires before the attacker can use it.

---

Why Long-Lived Tokens Are an Agentic Risk

Traditional web apps assume human users who interact every few seconds. Agentic platforms are different:

- A single session can span minutes to hours.

- Agents make hundreds of tool calls per minute.

- A stolen token grants the attacker the full capability of that session for its entire remaining lifetime.

The correct mental model is this: every tool call is a separate authentication decision, not a continuation of a prior one. Long-lived session tokens create exactly the kind of static credential we eliminated with Vault in Module 8. We must treat authentication the same way.

---

JWT + ATR Token Exchange at the Gateway

We issue a Session JWT at the very start of every session. This JWT contains:

- ATR claims

- Agent ID

- Tenant ID

- Session ID

Important: The Session JWT is never used directly for tool calls. It is exchanged at the gateway for a much narrower token.

The exchange flow:

1. Agent presents the Session JWT.

2. Gateway validates it and exchanges it for a tool-scoped token.

3. The tool-scoped token carries only the exact ATR claims required for that specific tool invocation.

4. TTL of the tool-scoped token is maximum 5 minutes — it cannot be renewed and cannot be reused for any other tool.

Sequence:  
 Session JWT → Gateway → Vault token exchange → Tool handler

Every exchange creates a signed audit log entry with the tool name, claims used, and exact timestamp. This pattern turns credential theft from catastrophic to irrelevant — the stolen token expires before it can be operationalized.

---

OAuth2/OIDC for External Tool Calls

Never embed static API keys in agent context or memory.

For every external API call we use proper OAuth2/OIDC flows:

- Client credentials or authorization code flow — never static keys.

- Tokens are fetched on demand, used for that single call, then discarded.

- Each external token is scoped to the absolute minimum permissions required (e.g., repo:read instead of repo:\*).

- TTL for external tokens is 5–10 minutes (shorter than internal tokens because external tokens cannot be revoked as quickly).

For user-delegated authorization we use the OIDC device flow. The HITL approval gate (Module 12) handles the user experience so the agent never sees the full authorization code.

This eliminates static service-account credentials from the agent’s context entirely.

---

Nonce-Based Replay Prevention

Even short-lived tokens need protection against replay attacks.

Every MCP request includes a unique nonce in the JWT payload. The gateway:

- Records the nonce in a Redis TTL store (keyed by nonce value).

- The nonce expires automatically when the token expires — no indefinite storage is required.

- Any duplicate nonce is immediately rejected with 403 regardless of token validity.

This reduces the replay window to zero even inside the 5-minute token TTL. In multi-tenant deployments the Redis store is partitioned per tenant.

---

Automatic Rotation and Revocation

Rotation and revocation are fully automated:

- Tool-scoped tokens expire automatically — no manual rotation is needed.

- Session JWTs are rotated at configurable intervals inside the session (default: every 60 minutes).

- On any anomaly (Panguard block, Falco alert, or user-initiated revocation) the gateway immediately calls Vault revocation.

- Revocation invalidates all in-flight calls using the revoked token synchronously.

- Every revocation event is written to the WORM audit trail with cause, timestamp, and the revoking principal.

---

Multi-Factor and Device Pairing for Local Access

Local gateway access requires a true second factor:

- Device pairing using a hardware-backed key (YubiKey or platform authenticator).

- The device must be physically present at session initiation — a stolen JWT alone cannot start a new session from an unpaired device.

For CI runners we use OIDC workload identity federation instead of device pairing:

- GitHub Actions or GitLab CI presents its OIDC token.

- The gateway exchanges it for a session JWT scoped to the exact workflow.

- Workflow-scoped sessions receive only the minimum ATR claims required for CI operations.

These two patterns (device pairing for humans + OIDC for CI) cover every access scenario without any static credentials.

---

Audit Logging of Every Authenticated Action

Every step of the token lifecycle is logged to the WORM audit trail:

- Token issuance

- Token exchange

- External call

- Rotation

- Revocation

Each event is a structured record containing:

- Agent ID, session ID, tool name

- Token accessor (never the token itself)

- Issued-at / expires-at timestamps

- ATR claims presented

- Panguard decision

The full token lifecycle for any session can be reconstructed from the audit trail. Because only the accessor is logged, the audit trail itself cannot be used to replay calls.

---

## Addendum: Nonce Store Availability

### The nonce store as a dependency, not an implementation detail

Module 9 specifies a Redis TTL store for nonce-based replay prevention: every request includes a unique nonce, the gateway checks it against the store, and a duplicate nonce is rejected regardless of token validity. This closes the replay window within a token's TTL.

This makes the nonce store a security-critical dependency on the request path. What happens when it's unavailable needs to be a deliberate decision, not a default.

### The two options, and why one of them is wrong

_Fail open (skip nonce checking if the store is unreachable):_ every request proceeds as if no replay protection exists. An attacker who has captured a valid tool-scoped token (5-minute TTL per Module 9) can replay it freely for the remainder of its validity window, for as long as the nonce store remains unreachable. Given that tool-scoped tokens already carry real capability, this converts a transient infrastructure failure into a window of unprotected replay — and an attacker who can induce the failure (a targeted denial-of-service against the nonce store specifically) can create that window on demand.

_Fail closed (reject all requests if the store is unreachable):_ the gateway becomes unavailable until the nonce store recovers. This is a real availability cost — the nonce store's uptime now directly bounds the gateway's uptime.

Fail closed is correct. The replay protection exists specifically to bound the damage from a captured token, and a captured token during a nonce-store outage is exactly the scenario the control exists for. An availability cost that is visible, alerted, and bounded by the nonce store's own recovery time is preferable to a silent security degradation that may not be noticed until it's been exploited.

### Making fail-closed operationally acceptable

A fail-closed dependency is only acceptable if its availability is engineered to match the availability target of the system depending on it. This means:

- The nonce store runs in HA configuration (Redis Sentinel or Redis Cluster, minimum 3 nodes), not as a single instance — a single-instance nonce store makes the entire gateway's availability bound to that one instance, which is disproportionate to the rest of the architecture's HA posture
- Nonce store health is a first-class readiness signal for the gateway — a gateway replica that cannot reach the nonce store should report not-ready and be removed from the load balancer, rather than accepting requests it will then reject
- Nonce store outage is paged at the same severity as gateway outage, because operationally it is gateway outage — there is no meaningful distinction from the perspective of someone trying to use the system
- Nonce store recovery time is included in the gateway's documented RTO (Module 28) — if the nonce store's failover takes 90 seconds, the gateway's effective RTO cannot be shorter than that, and capacity planning and SLA commitments should reflect this

### What does not change during a nonce store outage

ATR claim validation, Panguard enforcement, and token expiry checking all continue to operate independently of the nonce store — replay prevention is one layer among several (Module 12), and its unavailability does not disable the others. A replayed request during a nonce-store outage still must carry a valid, unexpired, correctly-scoped token; the nonce store's job is specifically to catch the case where that token is being _reused_ rather than used once. Losing that one layer is serious, but it is not the same as losing all authentication enforcement, and fail-closed on the nonce check specifically — rather than fail-closed on the entire authentication pipeline — is the precise scope of what needs to halt.

### Addendum key takeaways

- The nonce store's failure mode must be fail-closed — a replay-protection mechanism that silently disables itself under failure provides no protection during exactly the conditions an attacker might induce
- Fail-closed is only operationally acceptable if the nonce store's own availability is engineered to HA standards matching the gateway's availability target, not left as a single point of failure
- Nonce store outages must be paged and tracked against the gateway's RTO — they are gateway outages from the user's perspective
- Fail-closed scope should be limited to the nonce check itself — other authentication layers (ATR validation, token expiry, Panguard) continue operating independently and should not be taken down by the same dependency

---

Key Takeaways (Memorize These!)

- Per-request token scoping is the control that turns credential theft from catastrophic to irrelevant — the token is expired before it can be operationalized.

- Nonce-based replay prevention closes the remaining window that token expiry alone leaves open.

- OAuth2/OIDC for external tools eliminates static service account credentials from the agent’s context entirely.

- Device pairing for local access and OIDC workload identity for CI are the two second-factor patterns that cover all access scenarios without requiring static credentials.

You now have an authentication and session management system designed specifically for autonomous agents. Long-lived tokens are gone. Every action is individually authenticated, scoped, replay-protected, and permanently audited. Credential theft is no longer a meaningful attack.
