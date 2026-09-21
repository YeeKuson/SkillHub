# -*- coding: utf-8 -*-
"""Regression tests for the deterministic deck production pipeline."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.assemble_deck import assemble, load_fragments
from scripts.bundle_deck import bundle
from scripts.checkpoint import write_atomic
from scripts.validate_deck import validate


ROOT = Path(__file__).resolve().parents[1]


class PipelineTests(unittest.TestCase):
    def test_scroll_assemble_and_validate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "deck"
            entry = assemble(
                ROOT / "assets/scaffolds/scroll",
                ROOT / "tests/fixtures/scroll-fragments",
                output,
                "scroll-regression.html",
            )
            self.assertNotIn("@import", (output / "styles/theme.css").read_text(encoding="utf-8"))
            self.assertEqual(validate(entry), ([], []))

    def test_stage_assemble_bundle_and_validate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "deck"
            entry = assemble(
                ROOT / "assets/scaffolds/stage",
                ROOT / "tests/fixtures/fragments",
                output,
                "clicker-regression.html",
            )
            self.assertNotIn("@import", (output / "styles/theme.css").read_text(encoding="utf-8"))
            errors, warnings = validate(entry)
            self.assertEqual((errors, warnings), ([], []))

            single = output / "dist/clicker-regression-single.html"
            bundle(entry, single)
            errors, warnings = validate(single)
            self.assertEqual((errors, warnings), ([], []))
            self.assertIn('data-source="./scripts/deck-runtime.js"', single.read_text(encoding="utf-8"))

    def test_duplicate_slide_ids_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fragments = Path(temporary)
            payload = {
                "slides": [
                    {"id": "same", "html": '<section data-slide id="same"></section>'},
                    {"id": "same", "html": '<section data-slide id="same"></section>'},
                ]
            }
            (fragments / "batch-01.json").write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate slide id"):
                load_fragments(fragments)

    def test_checkpoint_write_is_utf8_json(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "checkpoint.json"
            write_atomic(target, {"status": "completed", "message": "已验证"})
            self.assertEqual(json.loads(target.read_text(encoding="utf-8"))["message"], "已验证")


if __name__ == "__main__":
    unittest.main()
