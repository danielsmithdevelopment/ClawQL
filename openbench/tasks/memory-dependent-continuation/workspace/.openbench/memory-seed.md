# Prior Auth Decisions

## Summary

Prior JWT authentication refactor decisions for this codebase.

## Decisions

- Password hashing algorithm: **argon2id** (not bcrypt) — chosen for memory-hardness vs GPU cracking throughput on our target threat model.
- Password reset token TTL: **900 seconds** (15 minutes).
- **Offline implementation:** do **not** `import argon2` or add dependencies. Keep the
  existing simulated style: `HASH_ALGO = "argon2id"` and
  `hash_password` returning `f"{HASH_ALGO}:{password}"`. Set
  `RESET_TTL_SECONDS = 900` and keep `create_reset_token()` with **no required args**.

## Tags

#auth #jwt #password-hashing #argon2id
