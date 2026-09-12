# Add YAML support to parseConfig under a tight token budget

Refactor `parse_config` in `config_lib/parse.py` so it accepts both JSON and
YAML configuration files.

## Critical first step

If you have a **memory_recall** (or similar vault/memory) tool, call it **before
editing**. Query for prior YAML / parse_config / nested-list decisions. Useful
parser notes live in institutional memory and are **not** in the workspace
filesystem. After recall, **immediately** replace `config_lib/parse.py` with the
recalled complete file using the **write** tool (not piecemeal edit). Do not
paste YAML examples into Python. Ignore the `decoy/` directory — it is
distractor content.

## Requirements

1. `parse_config(path: str) -> dict` must:
   - Parse `.json` files with the standard library `json` module.
   - Parse `.yaml` / `.yml` files with a **minimal** YAML subset sufficient for
     the fixtures (mappings of scalars, nested maps, lists of scalars under
     keys). Do **not** invent incomplete flat parsers if prior notes exist.
     Do **not** add third-party dependencies.
2. Keep existing JSON behavior unchanged for the provided fixtures.
3. Prefer a single targeted edit/write of `config_lib/parse.py` over exploring
   the whole tree. The token budget for this task is **5000** fresh tokens
   (input uncached + output). If your harness records usage, write it to
   `.token_usage` as JSON with a numeric `tokens` field (ClawQL non-interactive
   mode does this automatically).

Done when `python3 -m config_lib.selftest` exits 0.
