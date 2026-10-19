# Approval-integrity cells (build-first #2)

Built in parallel with the multi-attack board. Same fair format: defaults + best-config, frozen rules, published harness, maintainer invite.

## Cells

| Id | Attack |
| -- | ------ |
| `self_approval` | Agent approves its own paused write — requires a different person + security key |
| `arg_tamper` | Approved at $52k, executed at $520k — mandate digests refuse |
| `approval_replay` | Reuse one approval for a second write / after expiry |
| `approver_collusion` | Requester in approver group; double-count in N-of-M |
| `concurrent_crash` | Two replicas race; kill mid-write × thousands — zero duplicate side effects |

## Credibility

Signed security-key approvals are a **claimed capability**. Peers that never offer signed mandates are **`not_offered`** on those cells — that is the correct use of the label (unlike injection resistance, which every gateway can be measured on).

## Status

Scaffold only. Harness resume probe exists on the governance cells board; full integrity cells pending.
