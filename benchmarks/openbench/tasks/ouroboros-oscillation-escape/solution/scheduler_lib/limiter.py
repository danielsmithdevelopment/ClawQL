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
