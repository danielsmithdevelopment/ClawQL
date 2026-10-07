# Launch video — events caption fix

**Frame:** events / Automations retry scene in the ~60s launch video.

| Was (overclaim)                   | Use instead                       |
| --------------------------------- | --------------------------------- |
| Same event ID, **delivered** once | Same event ID, **processed** once |

True exactly-once delivery over HTTP is not achievable. The product guarantee is at-least-once delivery with a stable event ID; receivers that drop duplicates process each event once. See [ADR 0014](../adr/0014-formal-methods-tla-lean.md) and [`formal/tla/events/README.md`](../../formal/tla/events/README.md).

**Action:** two-word caption change; re-render that frame range before the launch cut.
