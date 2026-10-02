"""Offline selftest for rate limiter (opaque — no algorithm spoilers)."""

from __future__ import annotations

from .limiter import RateLimiter


def main() -> None:
    lim = RateLimiter(rate=5.0, capacity=20.0)
    assert lim.allow(0.0, 10.0) is True
    assert lim.allow(0.0, 10.0) is True
    assert lim.allow(0.0, 1.0) is False
    assert lim.allow(2.0, 10.0) is True
    assert lim.allow(2.0, 1.0) is False
    print("selftest ok")


if __name__ == "__main__":
    main()
