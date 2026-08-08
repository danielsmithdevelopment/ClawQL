# Mini Calderwood & Harkness fixture (B-7.1)

Vault seed under `.openbench/memory-seed/` holds **120** synthetic PE/software
matter notes nested under opaque `clients/*/matters/` paths. Enumerate every
matter with escrow ≥ 10% **and** non-compete > 18 months.

Ground-truth match count is fixed at **5** (many near-misses). Search
exhaustively — do not stop after the first hits. Filenames do not encode IDs or
criteria; fields live only in note bodies.

Regenerate with `python3 generate_fixture.py` in the task directory.
