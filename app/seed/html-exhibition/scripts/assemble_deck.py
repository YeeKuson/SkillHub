# -*- coding: utf-8 -*-
"""Assemble validated slide fragments into a copied HTML scaffold."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path


START = "<!-- SLIDES:START -->"
END = "<!-- SLIDES:END -->"
BANNED_NAMES = {"index.html", "home.html", "main.html", "default.html"}
IMPORT_PATTERN = re.compile(r'@import\s+(?:url\()?(["\'])([^"\']+)\1\)?\s*;')


def expand_local_imports(path: Path, stack: tuple[Path, ...] = ()) -> str:
    """Inline local CSS imports so assembled output never depends on the skill directory."""
    resolved = path.resolve()
    if resolved in stack:
        chain = " -> ".join(item.name for item in (*stack, resolved))
        raise ValueError(f"circular CSS import: {chain}")
    source = resolved.read_text(encoding="utf-8")

    def replace(match: re.Match[str]) -> str:
        reference = match.group(2)
        if reference.startswith(("http://", "https://", "//", "data:")):
            raise ValueError(f"external CSS import is not portable: {reference}")
        imported = (resolved.parent / reference).resolve()
        if not imported.is_file():
            raise FileNotFoundError(f"missing CSS import: {imported}")
        return f"/* inlined from {reference} */\n{expand_local_imports(imported, (*stack, resolved))}"

    return IMPORT_PATTERN.sub(replace, source)


def load_fragments(fragment_dir: Path) -> tuple[list[str], list[str], list[str]]:
    """Load ordered fragment HTML, CSS and JS with duplicate-ID protection."""
    html_parts: list[str] = []
    css_parts: list[str] = []
    js_parts: list[str] = []
    slide_ids: set[str] = set()
    for path in sorted(fragment_dir.glob("batch-*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        slides = payload.get("slides")
        if not isinstance(slides, list):
            raise ValueError(f"{path} has no slides array")
        for slide in slides:
            if not isinstance(slide, dict):
                raise ValueError(f"{path} contains a non-object slide")
            slide_id = slide.get("id")
            html = slide.get("html")
            if not isinstance(slide_id, str) or not isinstance(html, str):
                raise ValueError(f"{path} slide requires string id and html")
            if slide_id in slide_ids:
                raise ValueError(f"duplicate slide id: {slide_id}")
            if "<script" in html.lower():
                raise ValueError(f"slide {slide_id} embeds script inside html")
            if f'id="{slide_id}"' not in html and f"id='{slide_id}'" not in html:
                raise ValueError(f"slide {slide_id} html does not contain its id")
            slide_ids.add(slide_id)
            html_parts.append(html.strip())
            css = slide.get("css", "")
            js = slide.get("js", "")
            if not isinstance(css, str) or not isinstance(js, str):
                raise ValueError(f"slide {slide_id} css/js must be strings")
            if css.strip():
                css_parts.append(f"/* {slide_id} */\n{css.strip()}")
            if js.strip():
                js_parts.append(f"/* {slide_id} */\n{js.strip()}")
    if not html_parts:
        raise ValueError("no batch-*.json fragments found")
    return html_parts, css_parts, js_parts


def replace_region(text: str, replacement: str) -> str:
    """Replace the scaffold slide marker region exactly once."""
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
    if len(pattern.findall(text)) != 1:
        raise ValueError("scaffold must contain exactly one slide marker region")
    return pattern.sub(START + "\n" + replacement + "\n    " + END, text)


def assemble(scaffold: Path, fragments: Path, output: Path, entry_name: str) -> Path:
    """Copy a scaffold, inject fragments and return the semantic entry path."""
    if entry_name.lower() in BANNED_NAMES or not entry_name.endswith(".html"):
        raise ValueError("entry name must be a semantic .html filename")
    if output.exists() and any(output.iterdir()):
        raise FileExistsError(f"output directory is not empty: {output}")
    output.mkdir(parents=True, exist_ok=True)
    shutil.copytree(scaffold, output, dirs_exist_ok=True)
    for source_css in (scaffold / "styles").glob("*.css"):
        (output / "styles" / source_css.name).write_text(
            expand_local_imports(source_css), encoding="utf-8"
        )
    source_entry = output / "project-showcase.html"
    if not source_entry.is_file():
        raise FileNotFoundError("scaffold has no project-showcase.html")
    html_parts, css_parts, js_parts = load_fragments(fragments)
    source = source_entry.read_text(encoding="utf-8")
    source_entry.write_text(replace_region(source, "\n".join(html_parts)), encoding="utf-8")
    if css_parts:
        with (output / "styles/page.css").open("a", encoding="utf-8") as stream:
            stream.write("\n\n" + "\n\n".join(css_parts) + "\n")
    if js_parts:
        with (output / "scripts/concept-animation.js").open("a", encoding="utf-8") as stream:
            stream.write("\n\n" + "\n\n".join(js_parts) + "\n")
    entry = output / entry_name
    source_entry.replace(entry)
    return entry


def main() -> int:
    """Parse CLI arguments and assemble a deck."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--scaffold", type=Path, required=True)
    parser.add_argument("--fragments", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--entry", required=True)
    args = parser.parse_args()
    entry = assemble(args.scaffold.resolve(), args.fragments.resolve(), args.output.resolve(), args.entry)
    print(entry)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
