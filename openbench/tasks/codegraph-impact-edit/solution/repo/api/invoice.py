from core.pricing import compute_grand_total


def invoice_line(description: str, unit_price: float, qty: int) -> dict:
    return {
        "description": description,
        "amount": compute_grand_total(unit_price, qty, 0.0),
    }
