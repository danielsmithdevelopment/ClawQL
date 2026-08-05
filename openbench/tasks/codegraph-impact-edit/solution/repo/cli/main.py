from core.pricing import compute_grand_total


def main(argv: list[str] | None = None) -> int:
    _ = argv
    print(compute_grand_total(10.0, 2, 0.1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
