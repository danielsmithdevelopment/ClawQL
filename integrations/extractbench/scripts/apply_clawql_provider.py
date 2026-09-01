#!/usr/bin/env python3
"""Apply ClawQL IDP provider into an ExtractBench checkout.

Usage:
  python integrations/extractbench/scripts/apply_clawql_provider.py \\
      --extractbench /path/to/ExtractBench
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

MARKER_BEGIN = "    # --- clawql-idp-pipelines begin ---"
MARKER_END = "    # --- clawql-idp-pipelines end ---"

PIPELINE_SNIPPET = '''
{begin}
    # =========================================================================
    # ClawQL IDP (overlay from danielsmithdevelopment/ClawQL integrations/extractbench)
    # =========================================================================
    # Arm A: pdf-inspector + Docling route, then self-hosted Qwen schema map.
    register_fn(
        _pipeline_spec(
            pipeline_name="clawql_idp_qwen_extract",
            provider_name="clawql_idp",
            config={{
                "schema_map_mode": "llm",
                "model": "qwen3.6-35b-a3b-fp8",
                "endpoint_env_var": "QWEN35_SERVER_URL",
                "additional_properties_false": True,
                "structured_output": True,
                "max_tokens": 65536,
                "timeout_s": 3600,
                "chunk_chars": 120000,
                # Override with measured infra $/page when reporting leaderboard cost.
                "cost_per_page_usd": 0.0,
            }},
            per_file_timeout=7200.0,
        )
    )

    # Arm B: structural Docling/table mapping only (no LLM schema map).
    register_fn(
        _pipeline_spec(
            pipeline_name="clawql_idp_docling_extract",
            provider_name="clawql_idp",
            config={{
                "schema_map_mode": "structural",
                "force_docling": True,
                "timeout_s": 3600,
                "cost_per_page_usd": 0.0,
            }},
            per_file_timeout=7200.0,
        )
    )
{end}
'''.format(begin=MARKER_BEGIN, end=MARKER_END)

PIPELINES_MD_ROW_QWEN = (
    "| `clawql_idp_qwen_extract` | ClawQL IDP + Qwen schema map | "
    "`CLAWQL_MCP_URL`, `QWEN35_SERVER_URL` (self-hosted) |\n"
)
PIPELINES_MD_ROW_DOCLING = (
    "| `clawql_idp_docling_extract` | ClawQL IDP structural-only | "
    "`CLAWQL_MCP_URL` + Docling via ClawQL |\n"
)

ENV_SNIPPET = """
# ClawQL IDP ExtractBench overlay
CLAWQL_MCP_URL=http://127.0.0.1:8080/mcp
# OpenAI-compatible base for schema mapping (Arm A). No default host.
QWEN35_SERVER_URL=
# Optional measured infra cost attribution (USD / page)
# CLAWQL_EXTRACTBENCH_COST_PER_PAGE=0.10
# Optional meta-ontology sync after schema map (requires built clawql-ontology)
# CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC=1
# CLAWQL_OBSIDIAN_VAULT_PATH=/tmp/clawql-extractbench-vault
"""


def copy_provider(src_pkg: Path, dest_root: Path) -> Path:
    dest = (
        dest_root
        / "src"
        / "extract_bench"
        / "inference"
        / "providers"
        / "extract"
        / "clawql_idp"
    )
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src_pkg, dest)
    print(f"copied provider package -> {dest}")
    return dest


def patch_provider_init(init_py: Path) -> None:
    text = init_py.read_text(encoding="utf-8")
    if '"clawql_idp"' in text or "'clawql_idp'" in text:
        print("providers/extract/__init__.py already lists clawql_idp")
        return
    # Insert alphabetically: after claude_code_extract, before codex_code_extract
    pattern = re.compile(
        r'(\s*"claude_code_extract",\n)',
    )
    if not pattern.search(text):
        # Fallback: append before closing bracket of _PROVIDER_MODULES
        text2 = text.replace(
            '    "vllm_extract",\n]',
            '    "vllm_extract",\n    "clawql_idp",\n]',
        )
        if text2 == text:
            raise SystemExit("could not patch _PROVIDER_MODULES in extract/__init__.py")
        init_py.write_text(text2, encoding="utf-8")
        print("patched providers/extract/__init__.py (append)")
        return
    text = pattern.sub(r'\1    "clawql_idp",\n', text, count=1)
    init_py.write_text(text, encoding="utf-8")
    print("patched providers/extract/__init__.py")


def _replace_block(text: str, begin: str, end: str, replacement: str) -> str:
    if begin in text and end in text:
        pre, rest = text.split(begin, 1)
        _, post = rest.split(end, 1)
        return pre + replacement.strip() + "\n" + post.lstrip("\n")
    return text


def _strip_legacy_clawql_block(text: str) -> str:
    """Remove older overlays that used column-0 markers outside clean indentation."""
    legacy_begins = (
        "# --- clawql-idp-pipelines begin ---",
        "    # --- clawql-idp-pipelines begin ---",
    )
    legacy_ends = (
        "# --- clawql-idp-pipelines end ---",
        "    # --- clawql-idp-pipelines end ---",
    )
    for begin in legacy_begins:
        for end in legacy_ends:
            if begin in text and end in text:
                pre, rest = text.split(begin, 1)
                _, post = rest.split(end, 1)
                text = pre.rstrip() + "\n" + post.lstrip("\n")
    return text


def patch_extract_pipelines(pipelines_py: Path) -> None:
    text = _strip_legacy_clawql_block(pipelines_py.read_text(encoding="utf-8"))
    # Do not str.strip() the snippet — markers are intentionally indented.
    snippet = PIPELINE_SNIPPET.strip("\n") + "\n"
    if MARKER_BEGIN in text:
        text = _replace_block(text, MARKER_BEGIN, MARKER_END, snippet)
    else:
        # Insert after the nuextract3 registration, still inside register_extract_pipelines().
        anchor = 'pipeline_name="nuextract3_extract"'
        idx = text.find(anchor)
        if idx < 0:
            raise SystemExit("could not find nuextract3_extract anchor in extract.py")
        # End of that register_fn(...)\n block
        close = text.find("\n    )\n", idx)
        if close < 0:
            raise SystemExit("could not find nuextract3 register_fn closing")
        insert_at = close + len("\n    )\n")
        text = text[:insert_at] + "\n" + snippet + text[insert_at:]
    pipelines_py.write_text(text, encoding="utf-8")
    print(f"patched {pipelines_py.name}")


def patch_pipelines_md(md_path: Path) -> None:
    if not md_path.exists():
        print(f"skip missing {md_path}")
        return
    text = md_path.read_text(encoding="utf-8")
    changed = False
    if "clawql_idp_qwen_extract" not in text:
        # Insert after the extract table header block — append near NuExtract row if present.
        needle = "| `nuextract3_extract`"
        if needle in text:
            text = text.replace(
                needle,
                PIPELINES_MD_ROW_QWEN + PIPELINES_MD_ROW_DOCLING + needle,
                1,
            )
        else:
            text += "\n\n## ClawQL IDP (overlay)\n\n" + PIPELINES_MD_ROW_QWEN + PIPELINES_MD_ROW_DOCLING
        changed = True
    if changed:
        md_path.write_text(text, encoding="utf-8")
        print(f"patched {md_path.name}")
    else:
        print(f"{md_path.name} already documents clawql_idp")


def patch_env_example(env_path: Path) -> None:
    if not env_path.exists():
        print(f"skip missing {env_path}")
        return
    text = env_path.read_text(encoding="utf-8")
    if "CLAWQL_MCP_URL" in text:
        print(".env.example already has CLAWQL_MCP_URL")
        return
    env_path.write_text(text.rstrip() + "\n" + ENV_SNIPPET, encoding="utf-8")
    print("patched .env.example")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--extractbench",
        type=Path,
        required=True,
        help="Path to ExtractBench repository checkout",
    )
    parser.add_argument(
        "--provider-src",
        type=Path,
        default=None,
        help="Override path to clawql_idp package (default: ../provider/clawql_idp)",
    )
    args = parser.parse_args()

    root = args.extractbench.resolve()
    if not (root / "src" / "extract_bench").is_dir():
        print(f"ERROR: {root} does not look like ExtractBench", file=sys.stderr)
        return 1

    script_dir = Path(__file__).resolve().parent
    src_pkg = (
        args.provider_src.resolve()
        if args.provider_src
        else (script_dir.parent / "provider" / "clawql_idp").resolve()
    )
    if not src_pkg.is_dir():
        print(f"ERROR: provider package not found: {src_pkg}", file=sys.stderr)
        return 1

    copy_provider(src_pkg, root)
    patch_provider_init(
        root / "src" / "extract_bench" / "inference" / "providers" / "extract" / "__init__.py"
    )
    patch_extract_pipelines(
        root / "src" / "extract_bench" / "inference" / "pipelines" / "extract.py"
    )
    patch_pipelines_md(root / "docs" / "pipelines.md")
    patch_env_example(root / ".env.example")
    print("\nDone. Next:")
    print("  cd", root)
    print("  # start ClawQL MCP with IDP flags (see integrations/extractbench/scripts/)")
    print("  uv run extract-bench pipelines | grep clawql")
    print("  uv run extract-bench run clawql_idp_qwen_extract --test")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
