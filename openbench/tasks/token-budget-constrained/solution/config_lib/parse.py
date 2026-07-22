"""Config parsing helpers with minimal YAML support (golden)."""

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
    """Tiny YAML subset: 2-space indent maps + `- ` lists of scalars."""
    lines = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        lines.append((indent, raw.strip()))

    def parse_block(index: int, min_indent: int):
        """Return (value, next_index). value is dict or list."""
        # Peek: list or map?
        if index < len(lines) and lines[index][0] >= min_indent and lines[index][1].startswith("- "):
            items = []
            while index < len(lines):
                indent, content = lines[index]
                if indent < min_indent:
                    break
                if not content.startswith("- "):
                    break
                items.append(_parse_scalar(content[2:]))
                index += 1
            return items, index

        mapping: dict = {}
        while index < len(lines):
            indent, content = lines[index]
            if indent < min_indent:
                break
            if content.startswith("- "):
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
            # Nested value at greater indent
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
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    suffix = p.suffix.lower()
    if suffix in (".yaml", ".yml"):
        data = _parse_minimal_yaml(text)
    else:
        data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("config root must be a mapping")
    return data
