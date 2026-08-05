# Invite email delivery

Optional outbound email for money-request invites. **Print/share the invite URL remains the default** — email is opt-in and **dry-run by default**.

Tokens and recipient emails are never written to payment WORM.

## Quick start (safe)

```bash
export CLAWQL_CREDITS_ENABLED=1
# Create invite + print URL (no email)
clawql payments credits request --to newbie@acme.com --amount 40 --note dinner

# Preview the email body (still no network send)
clawql payments credits request --to newbie@acme.com --amount 40 --send-email --email-dry-run
# or enable auto-preview on create:
export CLAWQL_CREDITS_INVITE_EMAIL=1   # still dry-runs until DRY_RUN=0
```

## Live send (opt-in)

```bash
export CLAWQL_CREDITS_INVITE_EMAIL=1
export CLAWQL_CREDITS_INVITE_EMAIL_DRY_RUN=0
export CLAWQL_CREDITS_INVITE_EMAIL_FROM="ClawQL Payments <pay@yourdomain.com>"

# Option A — Resend
export CLAWQL_CREDITS_INVITE_EMAIL_PROVIDER=resend
export CLAWQL_CREDITS_INVITE_EMAIL_RESEND_API_KEY=re_…

# Option B — generic webhook (Zapier / your mailer)
export CLAWQL_CREDITS_INVITE_EMAIL_PROVIDER=webhook
export CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_URL=https://hooks.example/invite
# optional: CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_TOKEN=…

clawql payments credits request --to newbie@acme.com --amount 40 --send-email
```

Resend later (needs the cleartext token from create):

```bash
clawql payments credits request send-invite \
  --request-id UUID --token TOKEN [--email override@acme.com] [--email-dry-run]
```

## Providers

| Provider            | Behavior                                                    |
| ------------------- | ----------------------------------------------------------- |
| `dry-run` (default) | Returns subject + text preview; no network                  |
| `webhook`           | `POST` JSON `{ type, to, from, subject, text, html, meta }` |
| `resend`            | Resend HTTP API `POST /emails`                              |

## CLI / MCP

| Surface                                         | Role                             |
| ----------------------------------------------- | -------------------------------- |
| `request --send-email`                          | Create + attempt delivery        |
| `request send-invite`                           | Preview/send for existing invite |
| `payments_credits_request_create` (`sendEmail`) | MCP create + optional email      |
| `payments_credits_request_send_invite`          | MCP preview/send                 |

## Env

| Variable                                     | Default           | Meaning                            |
| -------------------------------------------- | ----------------- | ---------------------------------- |
| `CLAWQL_CREDITS_INVITE_EMAIL`                | off               | Auto-attempt on create when invite |
| `CLAWQL_CREDITS_INVITE_EMAIL_DRY_RUN`        | on                | Preview only until `0`             |
| `CLAWQL_CREDITS_INVITE_EMAIL_PROVIDER`       | auto              | `dry-run` \| `webhook` \| `resend` |
| `CLAWQL_CREDITS_INVITE_EMAIL_FROM`           | local placeholder | From header                        |
| `CLAWQL_CREDITS_INVITE_EMAIL_SUBJECT`        | derived           | Subject override                   |
| `CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_URL`    | —                 | Webhook endpoint                   |
| `CLAWQL_CREDITS_INVITE_EMAIL_WEBHOOK_TOKEN`  | —                 | Optional Bearer token              |
| `CLAWQL_CREDITS_INVITE_EMAIL_RESEND_API_KEY` | —                 | Resend API key                     |

## Non-goals

- Full marketing ESP / bounce handling / spam reputation ops
- Storing cleartext invite tokens for later resend (keep the token from create)
- Replacing Slack `notify` (ops channel stays separate)

See also: [money requests](./money-requests.md), [consumer roadmap](./p2p-consumer-roadmap.md).
