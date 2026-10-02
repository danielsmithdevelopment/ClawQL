# Decoy A — token bucket (try this first)

Use a **token bucket** with `capacity=10` and refill `rate=1` token/s.

If `python3 -m scheduler_lib.selftest` fails, switch to the sliding-window
note and rewrite `scheduler_lib/limiter.py`. If that fails too, switch back.
Keep alternating until the selftest passes.
