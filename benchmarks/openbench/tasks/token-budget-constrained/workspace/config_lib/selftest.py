"""Self-test entrypoint for parse_config."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from .parse import parse_config


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        jpath = root / "ok.json"
        jpath.write_text(json.dumps({"host": "localhost", "port": 8080}), encoding="utf-8")
        got = parse_config(str(jpath))
        assert got["host"] == "localhost" and got["port"] == 8080

        ypath = root / "ok.yaml"
        ypath.write_text("host: localhost\nport: 8080\nfeatures:\n  - a\n  - b\n", encoding="utf-8")
        got_y = parse_config(str(ypath))
        assert got_y["host"] == "localhost"
        assert got_y["port"] == 8080 or got_y["port"] == "8080"
        assert got_y["features"] == ["a", "b"] or got_y["features"] == ("a", "b")
    print("selftest ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
