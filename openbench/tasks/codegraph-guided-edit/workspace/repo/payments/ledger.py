"""Ledger helpers — OpenBench marker lives here."""

SECRET_MARKER = "cg-alpha-9"


def format_line(n: int, label: str) -> str:
    return f"{n}:{label}:{SECRET_MARKER}"
