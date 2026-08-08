"""Task-scoped vault path helpers (no Anthropic / harness imports)."""

from __future__ import annotations

import os
from pathlib import Path


def vault_root() -> Path:
    return Path(
        os.environ.get(
            "CLAWQL_OBSIDIAN_VAULT_PATH",
            str(Path.home() / ".ClawQL" / "HarveyLABVault"),
        )
    ).expanduser()


def resolve_task_vault(task_id: str, root: Path | None = None) -> Path:
    """Return a task-scoped vault directory under the LAB vault root."""
    safe = task_id.replace("/", "__")
    base = root if root is not None else vault_root()
    if base.name == safe or base.name == task_id.split("/")[-1]:
        return base
    return base / safe
