"""OpenRouter helpers for Harvey LAB (GHA-first, same secrets as OpenBench).

When ``CLAWQL_LAB_USE_OPENROUTER=1`` (or Anthropic key is absent and
``OPENROUTER_API_KEY`` is set), Anthropic SDK calls go through
``https://openrouter.ai/api`` with the OpenRouter key.
"""

from __future__ import annotations

import os

import anthropic

# Harvey short ids → OpenRouter Anthropic model ids.
_OPENROUTER_MODEL_MAP = {
    "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
    "claude-sonnet-4.6": "anthropic/claude-sonnet-4.6",
    "claude-opus-4-6": "anthropic/claude-opus-4.6",
    "claude-opus-4.6": "anthropic/claude-opus-4.6",
    "claude-opus-4-7": "anthropic/claude-opus-4.7",
    "claude-opus-4.7": "anthropic/claude-opus-4.7",
    "claude-opus-4-8": "anthropic/claude-opus-4.8",
    "claude-opus-4.8": "anthropic/claude-opus-4.8",
}


def use_openrouter() -> bool:
    if os.environ.get("CLAWQL_LAB_USE_OPENROUTER", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }:
        return bool(os.environ.get("OPENROUTER_API_KEY"))
    # Fall back to OpenRouter when no direct Anthropic key (GHA OpenBench pattern).
    return bool(os.environ.get("OPENROUTER_API_KEY")) and not os.environ.get(
        "ANTHROPIC_API_KEY"
    )


def resolve_openrouter_model(model: str) -> str:
    """Map a Harvey / short Claude id to an OpenRouter model id."""
    if model.startswith("anthropic/"):
        return model
    if model.startswith("openrouter/"):
        return model.removeprefix("openrouter/")
    return _OPENROUTER_MODEL_MAP.get(model, f"anthropic/{model}")


def make_anthropic_client() -> anthropic.Anthropic:
    """Anthropic SDK client — direct or via OpenRouter."""
    if use_openrouter():
        return anthropic.Anthropic(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url=os.environ.get(
                "CLAWQL_LAB_OPENROUTER_BASE_URL", "https://openrouter.ai/api"
            ),
            default_headers={
                "HTTP-Referer": os.environ.get(
                    "CLAWQL_OPENROUTER_HTTP_REFERER", "https://clawql.com"
                ),
                "X-Title": os.environ.get(
                    "CLAWQL_OPENROUTER_APP_TITLE", "ClawQL Harvey LAB"
                ),
            },
            max_retries=1,
        )
    return anthropic.Anthropic(max_retries=1)


def maybe_rewrite_model(model: str) -> str:
    """Rewrite model id for OpenRouter when that path is active."""
    if use_openrouter():
        return resolve_openrouter_model(model)
    return model
