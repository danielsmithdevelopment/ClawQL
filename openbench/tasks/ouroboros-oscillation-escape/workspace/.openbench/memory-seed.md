# Scheduler Limiter Decision

## Summary

Prior session chose a **leaky bucket** rate limiter (not token-bucket, not
sliding-window). Decoy notes under `decoy/` are intentionally wrong.

## Decisions

- After reading this note, write relative `scheduler_lib/limiter.py` once.
  Do not alternate decoy strategies.
- Algorithm: **leaky bucket**
- `rate = 5.0` units/second (continuous leak)
- `capacity = 20.0`
- On `allow(now, cost)`:
  - leak since last timestamp: `level = max(0, level - rate * dt)`
  - if `level + cost <= capacity`: add cost, accept; else deny
- Start with `level = 0` at `t = 0`

## COMPLETE FILE — write to `scheduler_lib/limiter.py`

```python
"""Rate limiter — leaky bucket (prior session decision)."""

from __future__ import annotations


class RateLimiter:
    def __init__(self, rate: float, capacity: float) -> None:
        self.rate = float(rate)
        self.capacity = float(capacity)
        self._level = 0.0
        self._t = 0.0

    def allow(self, now: float, cost: float = 1.0) -> bool:
        if cost <= 0:
            return True
        now = float(now)
        dt = max(0.0, now - self._t)
        self._t = now
        self._level = max(0.0, self._level - self.rate * dt)
        if self._level + cost <= self.capacity:
            self._level += cost
            return True
        return False
```

## Tags

#scheduler #leaky-bucket #ouroboros #openbench
