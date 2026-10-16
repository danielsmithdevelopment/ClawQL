# Support impersonation (managed console)

**Status:** Shipped (fixture + durable JSONL audit) — 2026-10-15  
**Surface:** `apps/dashboard` managed Cloud console

## What it is

Owner / Admin can **View as** another org person for support. This is not a passwordless secret login: it is an explicit support session bound to the admin’s own auth, with a required reason string.

## Rules

- Only roles matching Owner / Admin (see `canImpersonate` in `live/impersonation.ts`).
- Reason ≥ 8 characters — stored on the audit line.
- Cannot impersonate yourself.
- Banner on every page while active; **End support view** stops it.
- Mobile apps never start impersonation (console-only). PhoneApprove Profile / Settings / Team / Audit surfaces say so explicitly; lost-device response on mobile is **Sign out everywhere else** (`session.end_others`), not view-as. If a support view is active on the web console, Audit still records web starts/stops (visible on mobile Audit when live).

## Audit trail

1. **Managed Audit page** — runtime entries prepended via `listManagedAuditEffect` (`support.impersonation.start|stop`).
2. **Durable JSONL** — append-only `.data/support-impersonation-audit.jsonl` on the dashboard host (content-hashed lines).

## API

- `GET /api/managed/support/impersonation` — active session for the caller
- `POST /api/managed/support/impersonation` — `{ action: "start"|"stop", targetUserId, targetEmail, targetDisplayName, reason }`

Cookie `clawql-support-impersonation` binds the browser to the active record (httpOnly, 8h).

## Follow-ups

- Dual-write to process WORM when dashboard shares a host with `CLAWQL_WORM_ENABLED=1`.
- Live IdP role claims instead of fixture role strings.
- Time-boxed auto-expiry (e.g. 30 minutes) with audit on expiry.
