"""Offline selftest for leaky-bucket rate limiter."""

from __future__ import annotations

from .limiter import RateLimiter


def main() -> None:
    # Spec: leaky bucket, rate=5 units/s, capacity=20.
    lim = RateLimiter(rate=5.0, capacity=20.0)
    assert lim.allow(0.0, 10.0) is True, "initial burst within capacity"
    assert lim.allow(0.0, 10.0) is True, "second burst fills capacity"
    assert lim.allow(0.0, 1.0) is False, "over capacity must deny"
    # After 2s, ~10 units leaked → allow 10 again.
    assert lim.allow(2.0, 10.0) is True, "leak over time should refill"
    assert lim.allow(2.0, 1.0) is False, "still full after refill spend"
    print("selftest ok")


if __name__ == "__main__":
    main()
