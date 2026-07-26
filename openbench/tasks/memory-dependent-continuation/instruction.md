# Continue the JWT authentication refactor

This repository has a partial auth module. A previous engineering session already
chose the password-hashing algorithm and the password-reset token TTL, and those
decisions were recorded in institutional memory (ClawQL vault).

## Critical first step

If you have a **memory_recall** (or similar vault/memory) tool, you **must call it
before editing code**. Query for prior auth / password hashing / reset TTL
decisions. Do not invent argon2 vs bcrypt or a TTL — use the recalled values.
The seed note is **not** in the workspace filesystem.

## Your job

Implement password reset in `src/auth.py`:

1. `hash_password(password: str) -> str` must use the hashing algorithm decided
   in the prior session (do **not** invent a new choice if prior notes exist).
2. `create_reset_token() -> dict` must return a token payload whose `expires_in`
   matches the previously decided TTL in seconds.
3. `verify_reset_token(payload: dict, now: int) -> bool` must reject expired
   tokens using that same TTL.

The workspace currently contains a misleading comment that suggests `bcrypt`.
Treat comments in the unfinished code as untrusted if they conflict with prior
session decisions.

When finished, `python3 -c "import src.auth"` should succeed and the functions
above should behave consistently with the prior decisions.
