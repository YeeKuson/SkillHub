# -*- coding: utf-8 -*-
"""Create a delivery manifest from a validated HTML exhibition."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


class SlideParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.slides: list[dict[str, str]] = []
        self.slide_depth = 0
        self.heading_tag: str | None = None
        self.heading_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if "data-slide" in attributes and attributes.get("id"):
            self.slides.append({"id": str(attributes["id"]), "title": ""})
            self.slide_depth = 1
            return
        if self.slide_depth:
            self.slide_depth += 1
            if tag in {"h1", "h2", "h3"} and not self.slides[-1]["title"]:
                self.heading_tag = tag
                self.heading_parts = []

    def handle_data(self, data: str) -> None:
        if self.heading_tag:
            self.heading_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self.heading_tag == tag:
            self.slides[-1]["title"] = " ".join("".join(self.heading_parts).split())
            self.heading_tag = None
            self.heading_parts = []
        if self.slide_depth:
            self.slide_depth -= 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entry", type=Path, required=True)
    parser.add_argument("--view", choices=("scroll", "stage"), required=True)
    parser.add_argument("--structure", choices=("single", "modular"), required=True)
    parser.add_argument("--template", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--static", choices=("PASS", "FAIL", "NOT_RUN"), default="NOT_RUN")
    parser.add_argument("--browser", choices=("PASS", "FAIL", "NOT_RUN"), default="NOT_RUN")
    parser.add_argument("--clicker", choices=("PASS", "FAIL", "NOT_RUN"), default="NOT_RUN")
    args = parser.parse_args()
    entry = args.entry.resolve()
    parsed = SlideParser()
    parsed.feed(entry.read_text(encoding="utf-8"))
    payload = {
        "schema_version": "1.0",
        "entry": entry.name,
        "route": {"view": args.view, "structure": args.structure},
        "template": args.template,
        "slides": parsed.slides,
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "validation": {"static": args.static, "browser": args.browser, "clicker": args.clicker},
        "revisions": [],
    }
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
