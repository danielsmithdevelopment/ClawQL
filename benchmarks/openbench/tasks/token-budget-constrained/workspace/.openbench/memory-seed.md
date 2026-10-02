# YAML ParseConfig Notes

## Summary

Prior session notes for adding minimal YAML support to `parse_config` under a
tight token budget.

## Decisions

- Replace **only** `config_lib/parse.py` via the **write** tool (full file). Do
  **not** use piecemeal `edit` for nested helpers — that causes IndentationError.
- Ignore the `decoy/` tree — it is noise.
- Do **not** add PyYAML or any third-party dependency.
- Keep JSON via stdlib `json.loads` for `.json` paths.
- Nested list case that must work: key `features` with indented `- a` / `- b`
  items becomes `{"features": ["a", "b"]}`. Never paste YAML samples into `.py`.
- After write, run `python3 -m config_lib.selftest` once. Stop when green.

## COMPLETE FILE — write this entire content to `config_lib/parse.py`

```python
"""Config parsing helpers (JSON + minimal YAML)."""

from __future__ import annotations

import json
from pathlib import Path


def _parse_scalar(raw: str):
    s = raw.strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1]
    if s in ("true", "True"):
        return True
    if s in ("false", "False"):
        return False
    if s in ("null", "Null", "~"):
        return None
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        return s


def _parse_minimal_yaml(text: str) -> dict:
    lines = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        lines.append((indent, raw.strip()))

    def parse_block(index: int, min_indent: int):
        if index < len(lines) and lines[index][0] >= min_indent and lines[index][1].startswith("- "):
            items = []
            while index < len(lines):
                indent, content = lines[index]
                if indent < min_indent or not content.startswith("- "):
                    break
                items.append(_parse_scalar(content[2:]))
                index += 1
            return items, index

        mapping: dict = {}
        while index < len(lines):
            indent, content = lines[index]
            if indent < min_indent or content.startswith("- "):
                break
            if ":" not in content:
                index += 1
                continue
            key, _, rest = content.partition(":")
            key = key.strip()
            rest = rest.strip()
            index += 1
            if rest:
                mapping[key] = _parse_scalar(rest)
                continue
            if index >= len(lines) or lines[index][0] <= indent:
                mapping[key] = {}
                continue
            child, index = parse_block(index, indent + 1)
            mapping[key] = child
        return mapping, index

    value, _ = parse_block(0, 0)
    if not isinstance(value, dict):
        raise ValueError("yaml root must be a mapping")
    return value


def parse_config(path: str) -> dict:
    """Parse a JSON or YAML config file into a dict."""
    text = Path(path).read_text(encoding="utf-8")
    lower = path.lower()
    if lower.endswith((".yaml", ".yml")):
        data = _parse_minimal_yaml(text)
    else:
        data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("config root must be a mapping")
    return data
```

## Tags

#yaml #parse_config #token-budget
