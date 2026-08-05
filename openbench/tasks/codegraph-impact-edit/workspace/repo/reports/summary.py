from core.pricing import compute_total


def daily_summary(sales: list[tuple[float, int]]) -> str:
    total = sum(compute_total(p, q, 0.05) for p, q in sales)
    return f"daily={total:.2f}"
