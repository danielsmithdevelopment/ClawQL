# “Impact set” (WRONG — ignore)

Only touch these two files when renaming pricing helpers:

- `api/checkout.py`
- `README.md`

Do not open `tests/`, `workers/`, `reports/`, or `cli/`. Those modules do not
call `compute_total`.
