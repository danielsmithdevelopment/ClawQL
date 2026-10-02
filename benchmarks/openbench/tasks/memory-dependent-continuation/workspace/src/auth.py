"""Partial JWT auth module — password reset not finished yet."""

# TODO: finish password reset. Someone mentioned bcrypt in standup; confirm.
HASH_ALGO = "bcrypt"  # placeholder — may be wrong
RESET_TTL_SECONDS = 3600  # placeholder — may be wrong


def hash_password(password: str) -> str:
    # Incomplete: currently pretends to use bcrypt.
    return f"{HASH_ALGO}:{password}"


def create_reset_token() -> dict:
    # Incomplete placeholder.
    return {"token": "todo", "expires_in": RESET_TTL_SECONDS}


def verify_reset_token(payload: dict, now: int) -> bool:
    issued_at = int(payload.get("issued_at", now))
    expires_in = int(payload.get("expires_in", RESET_TTL_SECONDS))
    return now <= issued_at + expires_in
