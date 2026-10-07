# Event delivery (TLA+)

Exactly-once **per replica group / subscriber**: publish with stable `eventId`, competing queue-group workers, retries under the same id, stream resume from last cursor.

| File | Role |
| --- | --- |
| `EventDelivery.tla` | Spec |
| `EventDelivery.cfg` | Target — must pass TLC |
| `EventDeliveryWeak.cfg` | Weak claim race — must counterexample |

Maps to `packages/clawql-mcp-events` (`delivery.ts`, `event-stream.ts`, `nats-subjects.ts`).

```bash
# Same dual pattern as mandate (script can be extended):
java -XX:+UseParallelGC -cp "$TLA2TOOLS_JAR" tlc2.TLC \
  -config EventDelivery.cfg EventDelivery
```
