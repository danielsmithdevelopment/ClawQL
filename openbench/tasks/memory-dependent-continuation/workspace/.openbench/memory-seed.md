## Summary

Prior JWT authentication refactor decisions for this codebase.

## Decisions

- Password hashing algorithm: **argon2id** (not bcrypt) — chosen for memory-hardness vs GPU cracking throughput on our target threat model.
- Password reset token TTL: **900 seconds** (15 minutes).

## Tags

#auth #jwt #password-hashing #argon2id
