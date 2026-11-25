# Outbound payment approve — human-approved vs operator-approved

**Status:** Y1–Y4 shipped (#1547); Z1–Z4 shipped (#1548).  
**Routes:** `POST /payments/outbound/approve`, `GET /payments/outbound/quote/:digest`, CLI `clawql payments approve`.

## Claim wording

| Path                             | Wording               | When it holds                                                                                                                      |
| -------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Console / OIDC with step-up (Z1) | **human-approved**    | JWT has dedicated approve audience (recommended) **or** recent `auth_time`; role `operator`\|`admin` (or scope `payments:approve`) |
| Dedicated operator key (hashed)  | **operator-approved** | Server stores `CLAWQL_OPERATOR_APPROVE_KEY_HASH` only; operator pastes key from a password manager                                 |

Do **not** call the key path “human-approved.” Do **not** claim either path until the matching row above is true in the deployment.

Passes 2–6 and their follow-ups (including Y/Z payment approve) are closed for the audit doc under this wording.

## Y1–Y4 (shipped)

- **Y1:** Approve refuses `noAuth`, MCP API keys, virtual keys, and MCP OAuth.
- **Y2:** Tenant from OIDC claims or `CLAWQL_TENANT_ID` — never the request body.
- **Y3:** HITL parks the quote; approve shows and binds to it.
- **Y4:** Harness shells get `CLAWQL_IN_HARNESS=1`; CLI approve refuses; harness strips `CLAWQL_*KEY` env vars.

## Z1–Z4

### Z1 — MCP session tokens cannot approve

Long-lived OIDC tokens used for MCP (same admin signed the agent client in) must not approve payments.

**Primary (recommended):** dedicated approve audience. Configure the IdP to issue short-lived tokens for this audience only for the console approve flow — the gateway’s MCP token (`aud=clawql-mcp`) cannot approve.

```bash
export CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE=clawql-payments-approve
```

**Fallback only:** recent interactive sign-in via OIDC `auth_time` (default ≤ 300s). This leaves a short window after a fresh sign-in during which an MCP token that also carries a fresh `auth_time` can still approve. Prefer the dedicated audience above; keep the fallback for IdPs that cannot mint a separate approve audience yet.

```bash
# Used only when CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE is unset
export CLAWQL_OPERATOR_APPROVE_AUTH_TIME_MAX_SEC=300
```

`AtrClaims.authTime` is mapped from OIDC `auth_time`.

### Z2 — Hash the operator key; keep plaintext off disk

SHA-256 without salt is fine for a **high-entropy random** key. Do not hash a human-chosen password — generate the key with the CLI:

```bash
clawql payments operator-key generate
# → prints key (password manager) + CLAWQL_OPERATOR_APPROVE_KEY_HASH=…
```

```bash
# Server (clawql.env or secret store) — hash only:
export CLAWQL_OPERATOR_APPROVE_KEY_HASH=<hex from generate>

# Operator presents plaintext via header at approve time (password manager):
#   X-ClawQL-Operator-Key: <plaintext>
```

Migration escape hatch: `CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT=1` (temporary).  
`clawql doctor` warns if `CLAWQL_OPERATOR_APPROVE_KEY=` still appears in `clawql.env`.

### Z3 — Attribution from config, not headers

On the key path, principal is `CLAWQL_OPERATOR_ID` only. `x-clawql-operator-id` is ignored.

### Z4 — Harness marker is advisory

`CLAWQL_IN_HARNESS` can be unset by an agent. On a single-user machine, an unsandboxed agent shell that can read what the gateway can read is outside the marker’s protection.

**Structural mitigations:**

1. Approve from a **separate session or device** (console OIDC on a phone / locked browser profile).
2. Run agent shells in a sandbox that **cannot see** `$CLAWQL_HOME` / `clawql.env`.

## Related

- [`clawql-auth-oidc-stepup.md`](./clawql-auth-oidc-stepup.md)
- [`claim-holds-mandate-resume-and-payments.md`](./claim-holds-mandate-resume-and-payments.md)
