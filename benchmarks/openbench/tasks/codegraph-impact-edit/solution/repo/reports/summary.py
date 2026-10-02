from core.pricing import compute_grand_total


def daily_summary(sales: list[tuple[float, int]]) -> str:
    total = sum(compute_grand_total(p, q, 0.05) for p, q in sales)
    return f"daily={total:.2f}"
