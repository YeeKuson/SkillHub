# -*- coding: utf-8 -*-
"""Bundle one validated modular deck into a portable single HTML file."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


LINK_PATTERN = re.compile(
    r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])(?=[^>]*\bhref=["\']([^"\']+)["\'])[^>]*>',
    re.IGNORECASE,
)
SCRIPT_PATTERN = re.compile(
    r'<script\b(?=[^>]*\bsrc=["\']([^"\']+)["\'])[^>]*>\s*</script>',
    re.IGNORECASE,
)


def local_path(entry: Path, reference: str) -> Path:
    """Resolve one local asset and reject external or escaping references."""
    if reference.startswith(("http://", "https://", "//", "data:")):
        raise ValueError(f"external asset cannot be bundled: {reference}")
    clean = reference.split("#", 1)[0].split("?", 1)[0]
    target = (entry.parent / clean).resolve()
    try:
        target.relative_to(entry.parent.resolve())
    except ValueError as error:
        raise ValueError(f"asset escapes the deck directory: {reference}") from error
    if not target.is_file():
        raise FileNotFoundError(target)
    return target


def bundle(entry: Path, output: Path) -> None:
    """Inline local linked CSS and script sources into a new HTML document."""
    source = entry.read_text(encoding="utf-8")

    def replace_link(match: re.Match[str]) -> str:
        path = local_path(entry, match.group(1))
        return f'<style data-source="{match.group(1)}">\n{path.read_text(encoding="utf-8")}\n</style>'

    def replace_script(match: re.Match[str]) -> str:
        path = local_path(entry, match.group(1))
        code = path.read_text(encoding="utf-8").replace("</script>", "<\\/script>")
        return f'<script data-source="{match.group(1)}">\n{code}\n</script>'

    bundled = LINK_PATTERN.sub(replace_link, source)
    bundled = SCRIPT_PATTERN.sub(replace_script, bundled)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(bundled, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entry", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    bundle(args.entry.resolve(), args.output.resolve())
    print(args.output.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
