# -*- coding: utf-8 -*-
"""Validate html-exhibition structure without executing audited resources."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


REQUIRED_PATHS = (
    "SKILL.md",
    "agents/openai.yaml",
    "assets/runtime/deck-runtime.js",
    "assets/runtime/base.css",
    "assets/scaffolds/scroll/project-showcase.html",
    "assets/scaffolds/stage/project-showcase.html",
    "scripts/assemble_deck.py",
    "scripts/bundle_deck.py",
    "scripts/checkpoint.py",
    "scripts/write_manifest.py",
    "scripts/validate_deck.py",
    "evals/evals.json",
    "references/routing.md",
    "references/workflow.md",
    "references/content-contract.md",
    "references/interaction-contract.md",
    "references/validation.md",
    "references/template-pack/selection-index.json",
)


def read_utf8(path: Path) -> str:
    """Read one UTF-8 text file and fail with a path-specific error."""
    return path.read_text(encoding="utf-8")


def frontmatter_name(skill_text: str) -> str | None:
    """Return the frontmatter name or None when it is absent."""
    match = re.search(r"\A---\s*\n(?P<body>.*?)\n---", skill_text, re.DOTALL)
    if not match:
        return None
    name = re.search(r"^name:\s*([a-z0-9-]+)\s*$", match.group("body"), re.MULTILINE)
    return name.group(1) if name else None


def local_markdown_links(skill_text: str) -> list[str]:
    """Extract relative Markdown link targets from SKILL.md."""
    links = re.findall(r"\[[^\]]+\]\(([^)]+)\)", skill_text)
    return [link.split("#", 1)[0] for link in links if link and not re.match(r"^[a-z]+://", link)]


def validate(root: Path) -> tuple[list[str], list[str]]:
    """Return deterministic structural errors and non-blocking warnings."""
    errors: list[str] = []
    warnings: list[str] = []
    skill_path = root / "SKILL.md"
    if not skill_path.is_file():
        return ["missing SKILL.md"], warnings

    skill_text = read_utf8(skill_path)
    name = frontmatter_name(skill_text)
    if name != root.name:
        errors.append(f"frontmatter name={name!r} must match directory={root.name!r}")

    for relative in REQUIRED_PATHS:
        if not (root / relative).exists():
            errors.append(f"missing required path: {relative}")

    for relative in local_markdown_links(skill_text):
        if not (root / relative).exists():
            errors.append(f"broken SKILL.md link: {relative}")

    catalog_path = root / "references/template-pack/selection-index.json"
    if catalog_path.is_file():
        catalog = json.loads(read_utf8(catalog_path))
        templates = catalog.get("templates")
        if not isinstance(templates, list) or len(templates) != 34:
            errors.append("template catalog must contain exactly 34 external templates")
        else:
            slugs: set[str] = set()
            for item in templates:
                if not isinstance(item, dict):
                    errors.append("template catalog item must be an object")
                    continue
                slug = item.get("slug")
                if not isinstance(slug, str) or slug in slugs:
                    errors.append(f"invalid or duplicate template slug: {slug!r}")
                    continue
                slugs.add(slug)
                for field in ("preview_md", "design_md"):
                    target = item.get(field)
                    if not isinstance(target, str) or not (root / target).is_file():
                        errors.append(f"template {slug} has broken {field}: {target!r}")

    runtime = root / "assets/runtime/deck-runtime.js"
    for scaffold in ("scroll", "stage"):
        copy = root / f"assets/scaffolds/{scaffold}/scripts/deck-runtime.js"
        if runtime.is_file() and copy.is_file() and runtime.read_bytes() != copy.read_bytes():
            errors.append(f"{scaffold} scaffold runtime copy is stale")

    scan_roots = [root / "SKILL.md", root / "references", root / "assets/runtime"]
    for scan_root in scan_roots:
        paths = [scan_root] if scan_root.is_file() else scan_root.rglob("*")
        for path in paths:
            if not path.is_file() or path.suffix.lower() not in {".md", ".js", ".css", ".json"}:
                continue
            text = read_utf8(path)
            if re.search(r"https://[^\s\"']+@latest", text):
                errors.append(f"unpinned @latest dependency: {path.relative_to(root)}")

    return errors, warnings


def main(argv: list[str]) -> int:
    """Validate the provided Skill root and print a concise result."""
    root = Path(argv[1] if len(argv) > 1 else ".").resolve()
    errors, warnings = validate(root)
    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    print(f"RESULT: {'PASS' if not errors else 'FAIL'} ({len(errors)} errors, {len(warnings)} warnings)")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
