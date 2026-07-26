# YAML ParseConfig Notes

## Summary

Prior session notes for adding minimal YAML support to `parse_config` under a
tight token budget.

## Decisions

- Edit **only** `config_lib/parse.py`. Ignore the `decoy/` tree — it is noise.
- Do **not** add PyYAML or any third-party dependency.
- Implement a tiny indent-aware parser:
  - Track indentation (2-space style).
  - `key: value` → scalar on the same line.
  - `key:` with no value → nested block at greater indent (map **or** list).
  - Nested lists look like:

```yaml
features:
  - a
  - b
```

  which must become `{"features": ["a", "b"]}` (not a flat string / ignored).
- Keep JSON via stdlib `json.loads` for `.json`.
- Verify with `python3 -m config_lib.selftest` after the edit. Do not re-read
  the same file in a loop — read once, edit/write, run the selftest.

## Tags

#yaml #parse_config #token-budget
