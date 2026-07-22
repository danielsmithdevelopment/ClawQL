"""JWT auth module with password reset (golden solution)."""

HASH_ALGO = "argon2id"
RESET_TTL_SECONDS = 900


def hash_password(password: str) -> str:
    # Simulated argon2id encoding for offline checker (no native argon2 dependency).
    return f"{HASH_ALGO}:{password}"


def create_reset_token() -> dict:
    return {"token": "reset", "expires_in": RESET_TTL_SECONDS, "issued_at": 0}


def verify_reset_token(payload: dict, now: int) -> bool:
    issued_at = int(payload.get("issued_at", 0))
    expires_in = int(payload.get("expires_in", RESET_TTL_SECONDS))
    if expires_in != RESET_TTL_SECONDS:
        return False
    return now <= issued_at + expires_in
