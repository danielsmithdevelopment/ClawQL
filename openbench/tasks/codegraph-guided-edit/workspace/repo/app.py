"""Entry point — imports ledger helpers."""
from payments.ledger import format_line


def main() -> None:
    print(format_line(1, "noop"))


if __name__ == "__main__":
    main()
