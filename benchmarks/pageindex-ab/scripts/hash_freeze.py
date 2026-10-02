#!/usr/bin/env python3
"""Hash files for the pageindex-ab freeze manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("paths", nargs="+", type=Path)
    p.add_argument("--json", action="store_true", help="Emit JSON object path->sha256")
    args = p.parse_args()
    out = {str(path): sha256_file(path) for path in args.paths}
    if args.json:
        print(json.dumps(out, indent=2, sort_keys=True))
    else:
        for path, digest in out.items():
            print(f"{digest}  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
