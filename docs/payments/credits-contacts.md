# Contacts & phone addressing

Venmo-style addressing beyond email / `@username`:

1. **Phone alias** on the payments directory (E.164 → tenant / email)
2. **Per-tenant contacts book** — save frequent payees

ClawQL is **not** a full IdP. Phone verification stays with the customer IdP (or an operator `--verified` assertion after out-of-band proof). Emails and phones never go into payment WORM.

## Phone → directory

```bash
export CLAWQL_CREDITS_ENABLED=1

# Attach phone to an existing (or new) profile
clawql payments credits directory claim \
  --email bob@acme.com --tenant-id bob --phone +15559876543 --verified

# Pay by phone
clawql payments credits pay --from-tenant alice --to +15559876543 --amount 5 --note lunch
```

| CLI                                        | Role                             |
| ------------------------------------------ | -------------------------------- |
| `directory claim --phone +1… [--verified]` | Claim / update phone alias       |
| `directory show --phone +1…`               | Lookup                           |
| `directory release --phone +1…`            | Drop phone, keep email/@username |
| `pay --to +1…`                             | Resolve via directory            |

### Verification gate

| Variable                                | Default | Meaning                                         |
| --------------------------------------- | ------- | ----------------------------------------------- |
| `CLAWQL_CREDITS_PHONE_REQUIRE_VERIFIED` | off     | When `1`, `--phone` claims require `--verified` |
| `CLAWQL_CREDITS_PHONE_DEFAULT_CC`       | `1`     | Country code for 10-digit national numbers      |

`--verified` records `phoneVerifiedAt` — a soft claim that IdP/SMS proof happened elsewhere.

## Contacts book

Stored at `$CLAWQL_HOME/Payments/contacts.json` (mode `0600`), keyed by owner tenant.

```bash
clawql payments credits contacts add --to bob@acme.com --label Bob --tenant-id alice
clawql payments credits contacts add --to @bob --label Bobby
clawql payments credits contacts add --to +15559876543 --label "Bob mobile"
clawql payments credits contacts list --tenant-id alice
clawql payments credits contacts show --contact-id UUID
clawql payments credits contacts remove --contact-id UUID
```

List masks email/phone unless `--show-secrets`. Resolving a contact still goes through the directory (unknown payees fail at pay time).

## MCP (`CLAWQL_PAYMENTS_MCP_TOOLS=1`)

| Tool                                 | Role                                       |
| ------------------------------------ | ------------------------------------------ |
| `payments_credits_directory_claim`   | email / handle / phone (+ `phoneVerified`) |
| `payments_credits_directory_resolve` | email / handle / phone / payee             |
| `payments_credits_contacts_add`      | Save payee                                 |
| `payments_credits_contacts_list`     | List                                       |
| `payments_credits_contacts_remove`   | Remove                                     |
| `payments_credits_contacts_resolve`  | Contact id or payee → tenant               |

## Non-goals

- SMS OTP / carrier lookup inside ClawQL
- Syncing the device address book
- Public people search

See also: [consumer roadmap](./p2p-consumer-roadmap.md), [deep links / mini UI](./credits-deeplinks.md), [credits ACH / P2P](./credits-ach.md).
