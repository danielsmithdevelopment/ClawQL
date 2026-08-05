from core.pricing import compute_grand_total


def batch_sum(rows: list[tuple[float, int]]) -> float:
    return sum(compute_grand_total(p, q) for p, q in rows)
