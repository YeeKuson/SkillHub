# -*- coding: utf-8 -*-
"""Validate a generated HTML exhibition without rendering it."""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path


BANNED_ENTRY_NAMES = {"index.html", "home.html", "main.html", "default.html"}
SECRET_PATTERN = re.compile(r"(?i)(?:api[_-]?key|token|password|secret)\s*[:=]\s*[\"'][^\"']{8,}")
WINDOWS_PATH_PATTERN = re.compile(r"[A-Za-z]:\\(?:Users|Documents and Settings)\\")
PLACEHOLDER_PATTERN = re.compile(r"(?i)\b(?:lorem ipsum|xxxx|todo: replace|placeholder text)\b")


class DeckParser(HTMLParser):
    """Collect references and structural attributes from one HTML entry."""

    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []
        self.ids: list[str] = []
        self.slide_ids: list[str] = []
        self.deck_modes: list[str] = []
        self.has_deck = False
        self.runtime_loaded = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        """Record relevant attributes from a start tag."""
        values = {key: value for key, value in attrs}
        element_id = values.get("id")
        if element_id:
            self.ids.append(element_id)
        for attribute in ("src", "href"):
            reference = values.get(attribute)
            if reference:
                self.references.append(reference)
                if reference.endswith("deck-runtime.js"):
                    self.runtime_loaded = True
        bundled_source = values.get("data-source")
        if bundled_source and bundled_source.endswith("deck-runtime.js"):
            self.runtime_loaded = True
        if "data-deck" in values:
            self.has_deck = True
        mode = values.get("data-deck-mode")
        if mode:
            self.deck_modes.append(mode)
        if "data-slide" in values:
            self.slide_ids.append(element_id or "")


def resolve_entry(target: Path) -> tuple[Path | None, list[str]]:
    """Resolve a deck entry and return discovery errors."""
    if target.is_file():
        return target, []
    if not target.is_dir():
        return None, [f"target does not exist: {target}"]
    candidates = [path for path in target.glob("*.html") if path.name.lower() not in BANNED_ENTRY_NAMES]
    if len(candidates) != 1:
        return None, [f"expected exactly one semantic root HTML entry, found {len(candidates)}"]
    return candidates[0], []


def validate(target: Path) -> tuple[list[str], list[str]]:
    """Return blocking errors and non-blocking warnings for one deck."""
    entry, errors = resolve_entry(target)
    warnings: list[str] = []
    if entry is None:
        return errors, warnings
    if entry.name.lower() in BANNED_ENTRY_NAMES:
        errors.append(f"banned entry name: {entry.name}")
    text = entry.read_text(encoding="utf-8")
    parser = DeckParser()
    parser.feed(text)
    if not parser.has_deck:
        errors.append("entry is missing [data-deck]")
    if not parser.runtime_loaded:
        errors.append("entry does not load deck-runtime.js")
    if not parser.slide_ids:
        errors.append("entry has no [data-slide]")
    if any(not slide_id for slide_id in parser.slide_ids):
        errors.append("every [data-slide] requires a stable id")
    duplicates = sorted({value for value in parser.ids if parser.ids.count(value) > 1})
    if duplicates:
        errors.append(f"duplicate HTML ids: {', '.join(duplicates)}")
    modes = set(parser.deck_modes)
    declared_modes = modes.intersection({"scroll", "stage"})
    if len(declared_modes) != 1:
        errors.append("entry must declare exactly one data-deck-mode: scroll or stage")

    for reference in parser.references:
        if reference.startswith(("http://", "https://", "data:", "#", "mailto:")):
            if reference.startswith(("http://", "https://")):
                warnings.append(f"external resource requires network: {reference}")
            continue
        clean = reference.split("?", 1)[0].split("#", 1)[0]
        if clean:
            resolved = (entry.parent / clean).resolve()
            try:
                resolved.relative_to(entry.parent.resolve())
            except ValueError:
                errors.append(f"local reference escapes deck directory: {reference}")
                continue
            if not resolved.exists():
                errors.append(f"broken local reference: {reference}")

    text_files = [path for path in entry.parent.rglob("*") if path.is_file() and path.suffix.lower() in {".html", ".css", ".js", ".json", ".md"}]
    for path in text_files:
        content = path.read_text(encoding="utf-8")
        relative = path.relative_to(entry.parent)
        if SECRET_PATTERN.search(content):
            errors.append(f"possible hardcoded secret: {relative}")
        if WINDOWS_PATH_PATTERN.search(content):
            errors.append(f"absolute user path leaked: {relative}")
        if PLACEHOLDER_PATTERN.search(content):
            errors.append(f"placeholder content remains: {relative}")
        if path.suffix.lower() == ".js" and "@latest" in content:
            errors.append(f"unpinned JavaScript dependency: {relative}")
    return errors, sorted(set(warnings))


def main(argv: list[str]) -> int:
    """Validate one deck path and print a deterministic result."""
    if len(argv) != 2:
        print("Usage: python scripts/validate_deck.py <deck-dir-or-entry-html>")
        return 2
    errors, warnings = validate(Path(argv[1]).resolve())
    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    print(f"RESULT: {'PASS' if not errors else 'FAIL'} ({len(errors)} errors, {len(warnings)} warnings)")
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
