# Mini Calderwood & Harkness fixture (B-7.1)

Vault seed under `.openbench/memory-seed/` holds **120** synthetic PE/software
matter notes nested under opaque `clients/*/matters/` paths. Enumerate every
matter with escrow ≥ 10% **and** non-compete > 18 months.

Workspace notes are **prose-only** (no `CLAWQL_*` tags). Structured tags are
injected into the ClawQL vault at seed time for the on-arm. Ground-truth match
count is fixed at **5**.

Regenerate with `python3 generate_fixture.py` in the task directory.
