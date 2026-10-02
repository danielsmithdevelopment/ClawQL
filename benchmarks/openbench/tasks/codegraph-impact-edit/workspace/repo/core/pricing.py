"""Core pricing helpers — rename target for OpenBench impact edit."""


def compute_total(unit_price: float, qty: int, tax_rate: float = 0.0) -> float:
    """Return line total including tax."""
    base = float(unit_price) * int(qty)
    return base * (1.0 + float(tax_rate))
