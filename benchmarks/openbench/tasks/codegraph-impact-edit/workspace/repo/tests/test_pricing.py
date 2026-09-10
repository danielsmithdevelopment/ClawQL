from core.pricing import compute_total


def test_compute_total_basic() -> None:
    assert compute_total(5.0, 2) == 10.0
    assert abs(compute_total(5.0, 2, 0.1) - 11.0) < 1e-9
