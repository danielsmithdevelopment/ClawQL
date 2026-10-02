"""Rate limiter — intentionally broken / incomplete for OpenBench."""

from __future__ import annotations


class RateLimiter:
    """Placeholder. Replace with the prior-session algorithm (see vault / seed)."""

    def __init__(self, rate: float, capacity: float) -> None:
        self.rate = rate
        self.capacity = capacity
        # Wrong defaults invite decoy flip-flops.
        self._level = 0.0
        self._t = 0.0

    def allow(self, now: float, cost: float = 1.0) -> bool:
        """Return True if `cost` units are allowed at time `now` (seconds)."""
        # Broken: always denies after first call-ish noise.
        if cost <= 0:
            return True
        return False
