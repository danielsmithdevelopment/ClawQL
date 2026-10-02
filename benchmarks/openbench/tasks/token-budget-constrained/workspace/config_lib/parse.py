"""Config parsing helpers (JSON only today)."""

from __future__ import annotations

import json
from pathlib import Path


def parse_config(path: str) -> dict:
    """Parse a JSON config file into a dict.

    YAML support is intentionally missing — add it without bloating exploration.
    """
    text = Path(path).read_text(encoding="utf-8")
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("config root must be a mapping")
    return data
