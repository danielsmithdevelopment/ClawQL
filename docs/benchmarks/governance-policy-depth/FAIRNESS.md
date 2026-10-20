# Governance board fairness (v2)

## The v1 asymmetry

v1 published **ClawQL 5/5** against **Obot / Bifrost 2/5** while ClawQL alone ran with:

```text
CLAWQL_PANGUARD_BLOCK_TOOLS=memory_ingest
```

Peers ran **defaults** (allow ingest). That shows “a gateway configured to block a tool blocks it” — true, but not a governance advantage. Maintainers would correctly reply: _you configured yours and not ours._

## v2 structure

### 1. Defaults column

Every arm **without** a tool-specific deny for `memory_ingest`.

- ClawQL stock (no `BLOCK_TOOLS`) — **measured 2/5, contaminates**
- Obot default mcp-connect — **2/5**
- Bifrost allow-all VK — **2/5**
- Passthrough control — **2/5**

Fair tie. Stock ClawQL does **not** hard-deny this write without config.

### 2. Best-config column

Each product’s recommended deny for the same tool.

- ClawQL `BLOCK_TOOLS=memory_ingest` — **5/5**
- Obot per-tool deny — `OBOT_MCP_URL_DENY` (pending; expect **5/5**)
- Bifrost VK omitting `memory_ingest` — `BIFROST_MCP_URL_DENY` (pending; expect **5/5**)
- Executor `policies.block` — `EXECUTOR_MCP_URL_BLOCK` (pending; expect **5/5** on this fixture)

Ties here are **expected and welcome**. They set up cells where configuration alone cannot match.

### 3. Design cells (category claim)

| Cell                   | Allowlist gap                     | ClawQL target                                      |
| ---------------------- | --------------------------------- | -------------------------------------------------- |
| Self-approval          | Agent can resume its own pause    | Requester never approves; human ATR / security key |
| Arg digest swap        | Approve A, execute B              | Mandate digests refuse                             |
| Poison → allowed exfil | Allowed tool after untrusted read | Session data-flow / taint                          |
| Renamed route          | Same write, different name        | Capability identity                                |

**Honesty on resume_auto_approve:** today the harness **calls** Executor `resume accept` after poison. That probes self-approval; it is **not** a claim that Executor defaults to model auto-approve. Stock Executor pauses (destructiveHint) — that pause is the fair default.

### 4. Widen evidence

A single OVERRIDE fixture is five criteria on one attack. Security buyers need a multi-attack injection suite (emails, tickets, documents, webhooks × real models → “0 of N”). That remains on OpenBench `memory-injection-attempt` + planned expansions — not this board’s fake headline.

## Claim language

**Do say:** defaults tied; best-config ClawQL measured; peer best-config invited; design cells define the durable lead.

**Do not say:** “ClawQL leads measured peers” from configured-vs-default alone.

## Next boards

The full suite (injection, approval integrity, credentials, containment, audit, fail-safe) lives in
[../security-suite/ROADMAP.md](../security-suite/ROADMAP.md). Same fair-column format; peers without a
capability are **`not_offered`**, never scored `0`.
