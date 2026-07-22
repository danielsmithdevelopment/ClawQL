# Add YAML support to parseConfig under a tight token budget

Refactor `parse_config` in `config_lib/parse.py` so it accepts both JSON and
YAML configuration files.

## Requirements

1. `parse_config(path: str) -> dict` must:
   - Parse `.json` files with the standard library `json` module.
   - Parse `.yaml` / `.yml` files. You may implement a **minimal** YAML subset
     sufficient for the included fixtures (mappings of scalars, nested maps,
     lists of scalars). Do **not** add third-party dependencies.
2. Keep existing JSON behavior unchanged for the provided fixtures.
3. Prefer targeted edits over rewriting the whole tree. The token budget for
   this task is **5000** fresh tokens (input uncached + output). If your
   harness records usage, write it to `.token_usage` as JSON with a numeric
   `tokens` field (ClawQL non-interactive mode does this automatically).

Done when `python3 -m config_lib.selftest` exits 0.
