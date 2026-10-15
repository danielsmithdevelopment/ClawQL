# Flags A/B — HTTP peers interleaved 10k

## Verdict
KEEP Node --max-old-space-size=512 and Bun --smol.
They improve p999 and Node RSS; GC/ELD do not explain slow flows (near-zero overlap).

| Arm | Flags | flow p50 | flow p999 | RSS | GC events | GC max | ELD max | slow∩gc | slow∩eld |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| clawql_http | ON | 37.4 | 222.9 | 384 | 20 | 17.3 | 104.8 | 0 | 1 |
| clawql_http_bun | ON | 28.4 | 396.4 | 316 | 0 | 0 | 110.8 | 0 | 0 |
| clawql_http | OFF | 38.0 | 360.5 | 686 | 52 | 32.9 | 128.5 | 3 | 0 |
| clawql_http_bun | OFF | 30.3 | 539.9 | 316 | 0 | 0 | 102 | 0 | 1 |

Peers (ON): MCPJungle 14.7/88, agentgateway 14.0/167, Executor v2 70.5/126.
