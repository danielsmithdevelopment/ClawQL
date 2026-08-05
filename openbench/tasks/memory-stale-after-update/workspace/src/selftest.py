"""Self-test: update then read must reflect the write."""

from __future__ import annotations

from src.client import get_resource, reset_cache_for_tests, update_resource


def main() -> None:
    reset_cache_for_tests()
    before = get_resource("res-1")
    assert before["value"] == "alpha"
    update_resource("res-1", value="beta")
    after = get_resource("res-1")
    if after.get("value") != "beta":
        raise SystemExit(
            f"stale cache: expected value=beta after update, got {after!r}"
        )
    print("selftest ok")


if __name__ == "__main__":
    main()
