from core.pricing import compute_total


def invoice_line(description: str, unit_price: float, qty: int) -> dict:
    return {
        "description": description,
        "amount": compute_total(unit_price, qty, 0.0),
    }
