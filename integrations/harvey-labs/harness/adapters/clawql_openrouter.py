"""OpenRouter helpers for Harvey LAB (GHA-first, same secrets as OpenBench).

When ``CLAWQL_LAB_USE_OPENROUTER=1`` (or Anthropic key is absent and
``OPENROUTER_API_KEY`` is set), Anthropic SDK calls go through
``https://openrouter.ai/api`` with the OpenRouter key.

Chat-completions (Nemotron Arm C) always use the OpenAI SDK against OpenRouter.
"""

from __future__ import annotations

import os
from typing import Any

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

# Short aliases → OpenRouter chat-completions model ids (Arm C).
_OPENROUTER_CHAT_MODEL_MAP = {
    "nemotron-3.5-lightning": "nvidia/nemotron-3.5-lightning:free",
    "nemotron-3.5-lightning:free": "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3.5-lightning": "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3.5-lightning:free": "nvidia/nemotron-3.5-lightning:free",
}


def use_openrouter() -> bool:
    if os.environ.get("CLAWQL_LAB_USE_OPENROUTER", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }:
        return bool(os.environ.get("OPENROUTER_API_KEY"))
    return bool(os.environ.get("OPENROUTER_API_KEY")) and not os.environ.get(
        "ANTHROPIC_API_KEY"
    )


def resolve_openrouter_model(model: str) -> str:
    """Map a Harvey / short Claude id to an OpenRouter Anthropic model id."""
    if model.startswith("anthropic/"):
        return model
    if model.startswith("openrouter/"):
        return model.removeprefix("openrouter/")
    return _OPENROUTER_MODEL_MAP.get(model, f"anthropic/{model}")


def resolve_openrouter_chat_model(model: str) -> str:
    """Map Arm C short ids to OpenRouter chat-completions model ids."""
    if model.startswith("openrouter/"):
        return model.removeprefix("openrouter/")
    mapped = _OPENROUTER_CHAT_MODEL_MAP.get(model)
    if mapped:
        return mapped
    if model in {"nemotron", "nemotron-lightning"}:
        return os.environ.get(
            "CLAWQL_LAB_NEMOTRON_MODEL",
            "nvidia/nemotron-3.5-lightning:free",
        )
    return model


def _openrouter_headers() -> dict[str, str]:
    return {
        "HTTP-Referer": os.environ.get(
            "CLAWQL_OPENROUTER_HTTP_REFERER", "https://clawql.com"
        ),
        "X-Title": os.environ.get(
            "CLAWQL_OPENROUTER_APP_TITLE", "ClawQL Harvey LAB"
        ),
    }


def make_anthropic_client() -> Any:
    """Anthropic SDK client — direct or via OpenRouter."""
    import anthropic

    if use_openrouter():
        return anthropic.Anthropic(
            api_key=os.environ["OPENROUTER_API_KEY"],
            base_url=os.environ.get(
                "CLAWQL_LAB_OPENROUTER_BASE_URL", "https://openrouter.ai/api"
            ),
            default_headers=_openrouter_headers(),
            max_retries=1,
        )
    return anthropic.Anthropic(max_retries=1)


def make_openrouter_openai_client() -> Any:
    """OpenAI SDK client pointed at OpenRouter (Chat Completions / Arm C)."""
    import openai

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise ValueError(
            "OPENROUTER_API_KEY required for clawql-cc / Nemotron Arm C"
        )
    return openai.OpenAI(
        api_key=key,
        base_url=os.environ.get(
            "CLAWQL_LAB_OPENROUTER_OPENAI_BASE_URL",
            "https://openrouter.ai/api/v1",
        ),
        default_headers=_openrouter_headers(),
        max_retries=1,
    )


def maybe_rewrite_model(model: str) -> str:
    """Rewrite Anthropic model id for OpenRouter when that path is active."""
    if use_openrouter():
        return resolve_openrouter_model(model)
    return model


def should_use_openrouter_chat_judge(model: str) -> bool:
    """True when the judge should use OpenRouter Chat Completions (not Anthropic).

    Used for Arm C–first runs that only have ``OPENROUTER_API_KEY`` (no Anthropic).
    Triggers for:
      - explicit ``openrouter/...`` ids
      - provider-prefixed OpenRouter slugs (``nvidia/``, ``openai/``, ``meta/``, …)
      - short Nemotron aliases
      - ``CLAWQL_LAB_JUDGE_VIA_OPENROUTER=1``
    Claude short ids stay on the Anthropic judge path.
    """
    if os.environ.get("CLAWQL_LAB_JUDGE_VIA_OPENROUTER", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }:
        return True
    name = (model or "").strip()
    lower = name.lower()
    if lower.startswith("claude"):
        return False
    if lower.startswith("openrouter/"):
        return True
    if lower in _OPENROUTER_CHAT_MODEL_MAP or lower in {
        "nemotron",
        "nemotron-lightning",
    }:
        return True
    # OpenRouter-style provider/model (nvidia/..., openai/gpt-4o-mini, …)
    if "/" in name and not lower.startswith("anthropic/"):
        return True
    return False


def make_lab_judge(model: str):
    """Factory used by patched ``run_eval`` — OpenRouter chat or stock Judge."""
    if should_use_openrouter_chat_judge(model):
        from evaluation.clawql_openrouter_judge import OpenRouterChatJudge

        return OpenRouterChatJudge(model=model)
    from evaluation.judge import Judge

    return Judge(model=model)
