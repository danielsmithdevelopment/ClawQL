#!/usr/bin/env python3
"""P2: require remote wire rows ran (not skipped); spawn-only skips only."""
from __future__ import annotations

import sys
import xml.etree.ElementTree as ET

REQUIRED_PREFIXES = (
    "5) MCP auth",
    "6) valid token without execute scope",
    "7) resume approve via MCP refused",
    "7b) resume decline succeeds",
    "9) webhook POST no token",
    "11) SSRF: sources_propose",
    "12) GET /chain/verify",
)

# Spawn-only / process-only / driver-handled — allowed <skipped> inventory in remote.
# (describeBootOnly / it.skipIf(remote) names from regulated-wire.e2e.test.ts)
ALLOWED_SKIP_PREFIXES = (
    "1) CLAWQL_WORM_ENABLED=0",
    "1b) CLAWQL_SOURCES_ALLOW_HTTP=1",
    "2) bucket without Object Lock",
    "3) noAuth with ALLOW_UNAUTHENTICATED",
    "4) CLAWQL_HTTP_GRAPHQL=1",
    "8) operator channel via CLI",
    "10) inference remote model refused",
    "13) x402 concurrent same-proof",
)


def main() -> int:
    path = sys.argv[1]
    root = ET.parse(path).getroot()
    cases = list(root.iter("testcase"))
    entries: list[tuple[str, bool, bool]] = []
    for c in cases:
        name = c.get("name") or ""
        skipped = c.find("skipped") is not None
        failed = c.find("failure") is not None or c.find("error") is not None
        entries.append((name, skipped, failed))

    def match(name: str, prefix: str) -> bool:
        return name.startswith(prefix) or prefix in name

    missing: list[str] = []
    required_skipped: list[str] = []
    for pref in REQUIRED_PREFIXES:
        hits = [(n, sk) for n, sk, _ in entries if match(n, pref)]
        if not hits:
            missing.append(pref)
            continue
        # Any matching non-skipped case counts as run.
        if not any(not sk for _, sk in hits):
            required_skipped.append(pref)

    unexpected_skips: list[str] = []
    for name, skipped, _ in entries:
        if not skipped:
            continue
        if any(match(name, p) for p in REQUIRED_PREFIXES):
            continue
        if any(match(name, p) for p in ALLOWED_SKIP_PREFIXES):
            continue
        unexpected_skips.append(name)

    failed = [n for n, _, f in entries if f]
    errors: list[str] = []
    if missing:
        errors.append(f"missing required rows: {missing}")
    if required_skipped:
        errors.append(f"required rows were skipped: {required_skipped}")
    if unexpected_skips:
        errors.append(f"unexpected skipped tests: {unexpected_skips}")
    if failed:
        errors.append(f"failed testcases: {failed}")
    if errors:
        print("D5 FAIL junit: " + "; ".join(errors), file=sys.stderr)
        return 1
    print(
        f"D5 wire Job OK: {len(REQUIRED_PREFIXES)} required rows ran (not skipped); "
        "spawn-only skips allowed"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
