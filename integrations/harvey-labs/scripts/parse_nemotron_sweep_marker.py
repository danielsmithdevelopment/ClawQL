#!/usr/bin/env python3
"""Parse integrations/harvey-labs/.run-nemotron-sweep into a LAB matrix.

Lines (comments / blanks ignored):

  N                 → both default arms, tasks 001..N
  START-END         → both default arms, tasks START..END inclusive
  ARM START-END     → that arm only over the range (repeatable)

Default arms for unprefixed ranges: nemotron, nemotron-clawql.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_ARMS = ("nemotron", "nemotron-clawql")
KNOWN_ARMS = {
    "nemotron",
    "nemotron-clawql",
    "nemotron-baseline",
    "clawql-nemotron",
    "baseline",
    "clawql",
}
ARM_PREFIX = re.compile(
    r"^(nemotron-clawql|nemotron-baseline|clawql-nemotron|nemotron|clawql|baseline)\s+(.+)$",
    re.IGNORECASE,
)


def _parse_range(spec: str) -> tuple[int, int]:
    spec = spec.strip()
    m = re.match(r"^(\d+)\s*-\s*(\d+)$", spec)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.match(r"^(\d+)\s+(\d+)$", spec)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.match(r"^(\d+)$", spec)
    if m:
        return 1, int(m.group(1))
    raise ValueError(f"invalid sweep range {spec!r} (use N or START-END)")


def _cells(arm: str, start: int, end: int) -> list[dict[str, str]]:
    if start < 1 or end < start or end > 250:
        raise ValueError(f"invalid task range {start}-{end} for arm {arm}")
    out: list[dict[str, str]] = []
    for i in range(start, end + 1):
        tid = f"{i:03d}"
        out.append(
            {
                "arm": arm,
                "task": f"firm-knowledge/tasks/{tid}",
                "task_id": tid,
            }
        )
    return out


def parse_marker(text: str) -> dict[str, object]:
    lines = [
        ln.strip()
        for ln in text.splitlines()
        if ln.strip() and not ln.strip().startswith("#")
    ]
    if not lines:
        return {"empty": True}

    prefixed = [ARM_PREFIX.match(ln) for ln in lines]
    if any(prefixed) and not all(prefixed):
        raise ValueError(
            "mix of arm-prefixed and bare range lines is not allowed "
            "(use ARM START-END on every spec line, or a single N / START-END)"
        )

    include: list[dict[str, str]] = []
    arms: list[str] = []
    if prefixed[0]:
        for ln, m in zip(lines, prefixed):
            assert m is not None
            arm = m.group(1).lower()
            if arm not in KNOWN_ARMS:
                raise ValueError(f"unknown arm {arm!r} in {ln!r}")
            start, end = _parse_range(m.group(2))
            if arm not in arms:
                arms.append(arm)
            include.extend(_cells(arm, start, end))
    else:
        if len(lines) != 1:
            raise ValueError(
                "multiple bare range lines are not allowed; prefix each with an arm"
            )
        start, end = _parse_range(lines[0])
        arms = list(DEFAULT_ARMS)
        for arm in arms:
            include.extend(_cells(arm, start, end))

    ids = [int(c["task_id"]) for c in include]
    return {
        "empty": False,
        "arms": arms,
        "include": include,
        "task_start": min(ids),
        "task_end": max(ids),
        "cell_count": len(include),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--marker",
        type=Path,
        default=Path("integrations/harvey-labs/.run-nemotron-sweep"),
    )
    args = parser.parse_args()
    if not args.marker.is_file():
        print("{}", end="")
        return 0
    try:
        payload = parse_marker(args.marker.read_text(encoding="utf-8"))
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    json.dump(payload, sys.stdout, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
