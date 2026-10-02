"""Resource client with a naive read-through cache (buggy invalidation)."""

from __future__ import annotations

import json
from pathlib import Path

STORE_PATH = Path("state/store.json")
_cache: dict[str, dict] = {}


def _load_store() -> dict:
    return json.loads(STORE_PATH.read_text(encoding="utf-8"))


def _save_store(data: dict) -> None:
    STORE_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def get_resource(resource_id: str) -> dict:
    if resource_id in _cache:
        return _cache[resource_id]
    store = _load_store()
    row = dict(store[resource_id])
    _cache[resource_id] = row
    return row


def update_resource(resource_id: str, **fields) -> dict:
    store = _load_store()
    if resource_id not in store:
        raise KeyError(resource_id)
    store[resource_id] = {**store[resource_id], **fields}
    _save_store(store)
    # BUG: cache not invalidated — subsequent get_resource returns stale data
    return dict(store[resource_id])


def reset_cache_for_tests() -> None:
    _cache.clear()
