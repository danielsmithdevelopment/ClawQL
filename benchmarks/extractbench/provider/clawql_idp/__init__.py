"""ClawQL IDP extract provider package (ExtractBench registration side-effect)."""

try:
    from .provider import ClawQLIDPProvider

    __all__ = ["ClawQLIDPProvider"]
except ImportError:
    # Offline unit tests import ``mcp_client`` / ``schema_map`` without ExtractBench.
    __all__: list[str] = []
