from core.pricing import compute_grand_total


def checkout_total(cart: list[tuple[float, int]], tax_rate: float = 0.08) -> float:
    total = 0.0
    for unit_price, qty in cart:
        total += compute_grand_total(unit_price, qty, tax_rate)
    return total
