# Fix stale cache after resource update

This workspace simulates a tiny resource store with a **semantic read cache**.
The current client populates the cache on read but **does not invalidate** it
after writes — a classic silent-staleness bug.

## Your job

1. Update `src/client.py` so that `update_resource(...)` invalidates (or
   refreshes) the cache entry for that resource id.
2. Keep `get_resource(id)` returning the **current** store value after an
   update (not the pre-update cached value).
3. Do not change the on-disk schema of `state/store.json` except via the
   client APIs.

## Done when

`python3 -m src.selftest` exits 0.
