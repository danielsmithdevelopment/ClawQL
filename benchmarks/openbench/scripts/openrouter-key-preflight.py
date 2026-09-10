#!/usr/bin/env python3
"""Parse OpenRouter GET /api/v1/key JSON from stdin; emit shell-safe KEY=value lines.

Never prints the API key. Distinguishes per-key spend caps (limit / limit_remaining)
from account balance — see https://openrouter.ai/docs/api/reference/limits
"""
from __future__ import annotations

import json
import sys


def esc(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("$", "\\$")
        .replace("`", "\\`")
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"OR_PARSE_ERROR=\"{esc(str(exc))}\"", file=sys.stderr)
        return 2
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        print('OR_PARSE_ERROR="missing data object"', file=sys.stderr)
        return 2

    label = str(data.get("label") or "")
    limit = data.get("limit")
    remaining = data.get("limit_remaining")
    usage = data.get("usage")
    reset = data.get("limit_reset")

    print(f'OR_LABEL="{esc(label)}"')
    print(f'OR_LIMIT="{limit if limit is not None else "unlimited"}"')
    print(f'OR_REMAINING="{remaining if remaining is not None else "unlimited"}"')
    print(f'OR_USAGE="{usage if usage is not None else "n/a"}"')
    print(f'OR_RESET="{reset if reset is not None else "n/a"}"')
    # Exhausted only when a numeric remaining is present and <= 0.
    # null remaining means unlimited (no per-key cap).
    exhausted = isinstance(remaining, (int, float)) and float(remaining) <= 0
    print(f"OR_EXHAUSTED={'1' if exhausted else '0'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
