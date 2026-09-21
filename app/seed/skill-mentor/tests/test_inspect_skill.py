"""Regression tests for the read-only Skill inspector."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.inspect_skill import InspectionError, inspect_skill, resolve_skill_root


def write_skill(root: Path, name: str, body: str = "Follow the workflow.\n") -> Path:
    """Create a minimal valid Skill fixture and return its directory."""
    skill_root = root / name
    skill_root.mkdir()
    content = (
        "---\n"
        f"name: {name}\n"
        "description: Inspect a fixture. Use when running this test. Do not use for unrelated work.\n"
        "---\n\n"
        f"{body}"
    )
    (skill_root / "SKILL.md").write_text(content, encoding="utf-8")
    return skill_root


class InspectSkillTests(unittest.TestCase):
    """Verify structural and safety findings without executing fixture content."""

    def test_valid_skill_with_shell_pipeline_example_passes(self) -> None:
        """Treat a documentation pipeline as data instead of command injection."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            skill_root = write_skill(
                root,
                "valid-skill",
                "See [details](references/details.md).\n\n```text\ngit status | Select-String main\n```\n",
            )
            references = skill_root / "references"
            references.mkdir()
            (references / "details.md").write_text("# Details\n\nNo executable behavior.\n", encoding="utf-8")

            result = inspect_skill(skill_root)

            self.assertEqual("PASS", result.status)
            self.assertEqual("NONE", result.highest_severity)
            self.assertFalse(any(finding.id.startswith("CODE-") for finding in result.findings))

    def test_missing_reference_is_high_failure(self) -> None:
        """Report a missing local reference as an x-ref HIGH failure."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            skill_root = write_skill(Path(temporary_directory), "broken-link", "Read [missing](references/missing.md).\n")

            result = inspect_skill(skill_root)

            self.assertEqual("FAIL", result.status)
            self.assertTrue(any(finding.id.startswith("XREF-") and finding.severity == "HIGH" for finding in result.findings))

    def test_missing_frontmatter_is_invalid(self) -> None:
        """Mark a Skill without frontmatter INVALID instead of inventing a score."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            skill_root = Path(temporary_directory) / "invalid-skill"
            skill_root.mkdir()
            (skill_root / "SKILL.md").write_text("# No frontmatter\n", encoding="utf-8")

            result = inspect_skill(skill_root)

            self.assertEqual("INVALID", result.status)
            self.assertTrue(any(finding.id == "FMT-001" for finding in result.findings))

    def test_secret_is_redacted_and_blocks(self) -> None:
        """Detect a credential-shaped fixture without returning its full value."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            skill_root = write_skill(Path(temporary_directory), "secret-skill")
            credential = "AKIA" + ("A" * 16)
            (skill_root / "config.txt").write_text(f"access_key={credential}\n", encoding="utf-8")

            result = inspect_skill(skill_root)

            self.assertEqual("FAIL", result.status)
            secret_findings = [finding for finding in result.findings if finding.id.startswith("SEC-AWS-KEY")]
            self.assertEqual(1, len(secret_findings))
            self.assertNotIn(credential, secret_findings[0].evidence)

    def test_bidirectional_override_is_high(self) -> None:
        """Detect a hidden right-to-left override in untrusted text."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            skill_root = write_skill(Path(temporary_directory), "unicode-skill")
            hidden = chr(0x202E)
            (skill_root / "note.txt").write_text(f"safe{hidden}hidden\n", encoding="utf-8")

            result = inspect_skill(skill_root)

            self.assertEqual("FAIL", result.status)
            self.assertTrue(any(finding.category == "hidden_unicode" and finding.severity == "HIGH" for finding in result.findings))

    def test_python_shell_true_is_detected_by_ast(self) -> None:
        """Find an actual Python shell=True call while ignoring strings in docs."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            skill_root = write_skill(Path(temporary_directory), "python-risk")
            scripts = skill_root / "scripts"
            scripts.mkdir()
            (scripts / "unsafe.py").write_text(
                "import subprocess\nsubprocess.run('echo unsafe', shell=True, check=True)\n",
                encoding="utf-8",
            )

            result = inspect_skill(skill_root)

            self.assertEqual("FAIL", result.status)
            self.assertTrue(any(finding.id.startswith("PY-SHELL-TRUE") for finding in result.findings))

    def test_non_skill_file_target_is_rejected(self) -> None:
        """Reject a file target that is not named SKILL.md."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            target = Path(temporary_directory) / "README.md"
            target.write_text("not a skill", encoding="utf-8")

            with self.assertRaises(InspectionError):
                resolve_skill_root(target)


if __name__ == "__main__":
    unittest.main()

