# Activity feed

Venmo-style recent activity for a prepaid credits tenant: **transfers**, **money requests/invoices**, and other ledger events — with `@username` / masked-email labels from the [directory](./p2p-consumer-roadmap.md).

## CLI

```bash
export CLAWQL_CREDITS_ENABLED=1
clawql payments credits activity --tenant-id alice
clawql payments credits activity --filter transfers --limit 10
clawql payments credits activity --filter requests --json
```

| `--filter`        | Includes                                         |
| ----------------- | ------------------------------------------------ |
| `money` (default) | P2P transfers + requests (dedupes paid requests) |
| `transfers`       | `transfer_in` / `transfer_out` only              |
| `requests`        | Money requests / invoices only                   |
| `ledger`          | All ledger kinds (top-ups, debits, holds, …)     |
| `all`             | Ledger + requests                                |

## MCP

`payments_credits_activity` when `CLAWQL_PAYMENTS_MCP_TOOLS=1`.

## Notes

- Read model only — no new write path
- Paid requests that already have a ledger transfer are shown once (as the transfer)
- Counterparty labels prefer `@handle`, else masked email, else tenant id

See also: [money requests](./money-requests.md), [credits ACH / P2P](./credits-ach.md).
