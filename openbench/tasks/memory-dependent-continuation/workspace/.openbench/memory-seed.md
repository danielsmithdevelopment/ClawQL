# Prior Auth Decisions

## Summary

Prior JWT authentication refactor decisions for this codebase.

## Decisions

- Password hashing algorithm: **argon2id** (not bcrypt) — chosen for memory-hardness vs GPU cracking throughput on our target threat model.
- Password reset token TTL: **900 seconds** (15 minutes).
- **Offline implementation:** do **not** `import argon2` or add dependencies. Keep the
  existing simulated style: `HASH_ALGO = "argon2id"` and
  `hash_password` returning `f"{HASH_ALGO}:{password}"`.
- Set `RESET_TTL_SECONDS = 900`.
- Keep `create_reset_token()` with **no required args**; return
  `{"token": "reset", "expires_in": RESET_TTL_SECONDS, "issued_at": 0}` (or
  equivalent with `expires_in == 900`).
- `verify_reset_token(payload, now)` must accept `now <= issued_at + 900` and
  reject after (e.g. now=899 ok, now=901 false for issued_at=0).

## Tags

#auth #jwt #password-hashing #argon2id
