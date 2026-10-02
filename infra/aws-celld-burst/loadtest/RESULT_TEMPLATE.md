# §13.5 Publishable result template

Fill **only** after a same-day three-arm run with Cost Explorer exports. Do not invent numbers.

> Identical 1M/0/2M event stream, same day, run against three configurations: [celld config], [Karpenter scale-to-zero config], [Karpenter warm-pool config]. celld: p99 latency [X]ms flat throughout the test, [N] dropped requests, $[Y] real AWS cost for the test window. Karpenter scale-to-zero: p99 latency [X]ms baseline, spiking to [Z]ms for [S] seconds immediately after the gap, [N'] requests dropped/timed out, $[Y'] real AWS cost (lower than celld because it scaled to zero during the gap — report even if this favors Karpenter on cost). Karpenter warm-pool: p99 latency [X]ms baseline, spiking to [Z'']ms for [S'] seconds (smaller than scale-to-zero's spike, larger than celld's), $[Y''] real AWS cost (between the other two). Full k6 script, Grafana dashboard, and Cost Explorer export: [link].

## Attachments checklist

- [ ] k6 summary JSON for Arms A, B, C
- [ ] Single Grafana dashboard screenshot / export (all three overlays)
- [ ] Cost Explorer CSV/filtered spend for the tagged window per arm
- [ ] Arm A operator WORM correlation notes (`FILLER_WORKLOAD_EVICTED`, etc.)
