# Prior Auth Decisions

## Summary

Prior JWT authentication refactor decisions for this codebase.

## Decisions

- After reading this note, **immediately** update `src/auth.py` with the
  **write** or **edit** tool. Path must be relative `src/auth.py` — never
  `/src/auth.py` and never absolute scratch paths.
- Password hashing algorithm: **argon2id** (not bcrypt) — chosen for memory-hardness vs GPU cracking throughput on our target threat model.
- Password reset token TTL: **900 seconds** (15 minutes).
- Offline implementation: do **not** `import argon2`. Keep simulated style:
  `HASH_ALGO = "argon2id"` and `hash_password` → `f"{HASH_ALGO}:{password}"`.
- `RESET_TTL_SECONDS = 900`.
- `create_reset_token()` with **no required args**; return
  `{"token": "reset", "expires_in": RESET_TTL_SECONDS, "issued_at": 0}`.
- `verify_reset_token(payload, now)` accepts `now <= issued_at + 900`.

## COMPLETE FILE — write to relative path `src/auth.py`

```python
"""Auth helpers (password hash + reset token)."""

HASH_ALGO = "argon2id"
RESET_TTL_SECONDS = 900


def hash_password(password: str) -> str:
    return f"{HASH_ALGO}:{password}"


def create_reset_token() -> dict:
    return {"token": "reset", "expires_in": RESET_TTL_SECONDS, "issued_at": 0}


def verify_reset_token(payload: dict, now: int) -> bool:
    issued = int(payload.get("issued_at", 0))
    ttl = int(payload.get("expires_in", RESET_TTL_SECONDS))
    return now <= issued + ttl
```

## Tags

#auth #jwt #password-hashing #argon2id
