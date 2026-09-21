#!/usr/bin/env python3
"""Inspect an Agent Skill without executing any of its contents."""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import TypeAlias


JSONScalar: TypeAlias = str | int | float | bool | None
JSONValue: TypeAlias = JSONScalar | list["JSONValue"] | dict[str, "JSONValue"]

SKILL_FILE = "SKILL.md"
MAX_TEXT_BYTES = 2 * 1024 * 1024
TEXT_SUFFIXES = {
    ".md",
    ".py",
    ".sh",
    ".ps1",
    ".js",
    ".ts",
    ".yaml",
    ".yml",
    ".json",
    ".toml",
    ".txt",
}
IGNORED_DIRS = {".git", ".hg", ".svn", "__pycache__", "node_modules", ".venv", "venv"}
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MARKDOWN_LINK_PATTERN = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")

SEVERITY_ORDER = {"NONE": 0, "INFO": 1, "LOW": 2, "MEDIUM": 3, "HIGH": 4, "CRITICAL": 5}

SECRET_PATTERNS: tuple[tuple[str, str, re.Pattern[str], str], ...] = (
    (
        "SEC-PRIVATE-KEY",
        "CRITICAL",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
        "发现私钥头；不要在 Skill 中存放真实私钥。",
    ),
    (
        "SEC-AWS-KEY",
        "HIGH",
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "发现疑似 AWS Access Key ID。",
    ),
    (
        "SEC-GITHUB-TOKEN",
        "HIGH",
        re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
        "发现疑似 GitHub Token。",
    ),
    (
        "SEC-OPENAI-KEY",
        "HIGH",
        re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
        "发现疑似 API Key。",
    ),
)

DANGEROUS_PATTERNS: tuple[tuple[str, str, re.Pattern[str], str, frozenset[str]], ...] = (
    (
        "CODE-DOWNLOAD-EXEC",
        "HIGH",
        re.compile(r"(?:curl|wget|irm\b|Invoke-WebRequest).*\|\s*(?:bash|sh|iex\b|Invoke-Expression)", re.IGNORECASE),
        "发现下载后直接执行模式。",
        frozenset({".sh", ".ps1"}),
    ),
    (
        "CODE-INVOKE-EXPRESSION",
        "HIGH",
        re.compile(r"\b(?:Invoke-Expression|iex)\b", re.IGNORECASE),
        "发现动态 PowerShell 执行。",
        frozenset({".ps1"}),
    ),
    (
        "CODE-DYNAMIC-EXEC",
        "MEDIUM",
        re.compile(r"\b(?:eval|exec)\s*\("),
        "发现动态代码执行调用；结合输入来源复核。",
        frozenset({".js", ".ts"}),
    ),
)

HIDDEN_CHARACTERS: dict[str, str] = {
    "\u202a": "LEFT-TO-RIGHT EMBEDDING",
    "\u202b": "RIGHT-TO-LEFT EMBEDDING",
    "\u202d": "LEFT-TO-RIGHT OVERRIDE",
    "\u202e": "RIGHT-TO-LEFT OVERRIDE",
    "\u2066": "LEFT-TO-RIGHT ISOLATE",
    "\u2067": "RIGHT-TO-LEFT ISOLATE",
    "\u2068": "FIRST STRONG ISOLATE",
    "\u2069": "POP DIRECTIONAL ISOLATE",
    "\u200b": "ZERO WIDTH SPACE",
    "\u200c": "ZERO WIDTH NON-JOINER",
    "\u200d": "ZERO WIDTH JOINER",
    "\ufeff": "ZERO WIDTH NO-BREAK SPACE",
}


@dataclass(frozen=True)
class Finding:
    """Represent one deterministic inspection result."""

    id: str
    severity: str
    category: str
    message: str
    path: str
    line: int | None
    evidence: str


@dataclass(frozen=True)
class InspectionResult:
    """Represent the complete read-only inspection result."""

    schema_version: str
    target: str
    skill_root: str
    skill_name: str | None
    status: str
    highest_severity: str
    files_scanned: int
    skipped_files: list[str]
    findings: list[Finding]
    disclaimer: str


class InspectionError(Exception):
    """Report an invalid or unreadable inspection target."""


def parse_args(argv: list[str]) -> argparse.Namespace:
    """Parse command-line arguments without executing target content."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", help="Skill directory or SKILL.md path")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    return parser.parse_args(argv)


def resolve_skill_root(target: Path) -> Path:
    """Resolve a directory or SKILL.md target to an existing Skill root."""
    resolved = target.resolve(strict=True)
    if resolved.is_dir():
        return resolved
    if resolved.is_file() and resolved.name == SKILL_FILE:
        return resolved.parent
    raise InspectionError("目标必须是 Skill 目录或名为 SKILL.md 的文件。")


def is_within(path: Path, root: Path) -> bool:
    """Return whether a resolved path remains inside the authorized root."""
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def read_text_file(path: Path) -> str:
    """Read one UTF-8 text file and expose decoding failures explicitly."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        raise InspectionError(f"文件不是有效 UTF-8：{path}") from error
    except OSError as error:
        raise InspectionError(f"文件无法读取：{path}：{error}") from error


def parse_frontmatter(text: str) -> tuple[dict[str, str], int | None]:
    """Parse the simple scalar subset needed for Skill name and description."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, None

    closing_line: int | None = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            closing_line = index
            break
    if closing_line is None:
        return {}, None

    metadata: dict[str, str] = {}
    current_key: str | None = None
    block_values: list[str] = []
    for raw_line in lines[1:closing_line]:
        if current_key is not None and (raw_line.startswith(" ") or not raw_line.strip()):
            if raw_line.strip():
                block_values.append(raw_line.strip())
            continue
        if current_key is not None:
            metadata[current_key] = " ".join(block_values).strip()
            current_key = None
            block_values = []
        if ":" not in raw_line or raw_line.lstrip().startswith("#"):
            continue
        key, value = raw_line.split(":", 1)
        normalized_key = key.strip()
        normalized_value = value.strip().strip('"\'')
        if normalized_value in {">", ">-", "|", "|-"}:
            current_key = normalized_key
        else:
            metadata[normalized_key] = normalized_value
    if current_key is not None:
        metadata[current_key] = " ".join(block_values).strip()
    return metadata, closing_line + 1


def make_finding(
    finding_id: str,
    severity: str,
    category: str,
    message: str,
    path: Path,
    root: Path,
    line: int | None,
    evidence: str,
) -> Finding:
    """Create a finding with a root-relative and non-secret evidence excerpt."""
    relative_path = str(path.relative_to(root)).replace("\\", "/")
    compact_evidence = re.sub(r"\s+", " ", evidence).strip()
    if len(compact_evidence) > 160:
        compact_evidence = compact_evidence[:157] + "..."
    return Finding(finding_id, severity, category, message, relative_path, line, compact_evidence)


def inspect_frontmatter(skill_file: Path, root: Path, text: str) -> tuple[str | None, list[Finding]]:
    """Validate required frontmatter and naming constraints."""
    findings: list[Finding] = []
    metadata, closing_line = parse_frontmatter(text)
    if closing_line is None:
        findings.append(
            make_finding(
                "FMT-001",
                "HIGH",
                "frontmatter",
                "SKILL.md 缺少完整 YAML frontmatter。",
                skill_file,
                root,
                1,
                "Expected opening and closing --- delimiters",
            )
        )
        return None, findings

    name = metadata.get("name")
    description = metadata.get("description")
    if not name:
        findings.append(make_finding("FMT-002", "HIGH", "frontmatter", "缺少 name 字段。", skill_file, root, 2, "name missing"))
    elif len(name) > 64 or NAME_PATTERN.fullmatch(name) is None:
        findings.append(
            make_finding(
                "FMT-003",
                "HIGH",
                "frontmatter",
                "name 必须为 1–64 位小写字母、数字和单连字符。",
                skill_file,
                root,
                2,
                f"name={name}",
            )
        )
    elif name != root.name:
        findings.append(
            make_finding(
                "FMT-004",
                "HIGH",
                "frontmatter",
                "name 必须与父目录名一致。",
                skill_file,
                root,
                2,
                f"name={name}; directory={root.name}",
            )
        )

    if not description:
        findings.append(make_finding("FMT-005", "HIGH", "frontmatter", "缺少 description 字段。", skill_file, root, 3, "description missing"))
    elif len(description) > 1024:
        findings.append(
            make_finding(
                "FMT-006",
                "HIGH",
                "frontmatter",
                "description 超过 1024 字符。",
                skill_file,
                root,
                3,
                f"length={len(description)}",
            )
        )
    return name, findings


def extract_local_links(text: str) -> list[str]:
    """Extract local Markdown targets while ignoring URLs and anchors."""
    links: list[str] = []
    for raw_target in MARKDOWN_LINK_PATTERN.findall(text):
        target = raw_target.strip().strip("<>").split("#", 1)[0]
        if not target or re.match(r"^[a-z][a-z0-9+.-]*:", target, re.IGNORECASE):
            continue
        links.append(target.replace("%20", " "))
    return links


def inspect_links(source: Path, root: Path, text: str, start_index: int) -> tuple[list[Finding], int]:
    """Validate that local Markdown references exist and stay inside the Skill root."""
    findings: list[Finding] = []
    links = extract_local_links(text)
    for offset, target in enumerate(links, start=start_index):
        candidate = (source.parent / target).resolve(strict=False)
        if not is_within(candidate, root):
            findings.append(
                make_finding(
                    f"XREF-{offset:03d}",
                    "HIGH",
                    "cross_reference",
                    "本地引用越出 Skill 根目录。",
                    source,
                    root,
                    find_line(text, target),
                    target,
                )
            )
        elif not candidate.exists():
            findings.append(
                make_finding(
                    f"XREF-{offset:03d}",
                    "HIGH",
                    "cross_reference",
                    "本地引用目标不存在。",
                    source,
                    root,
                    find_line(text, target),
                    target,
                )
            )
    return findings, start_index + len(links)


def find_line(text: str, needle: str) -> int | None:
    """Return the first one-based line containing a literal substring."""
    for line_number, line in enumerate(text.splitlines(), start=1):
        if needle in line:
            return line_number
    return None


def iter_text_files(root: Path) -> tuple[list[Path], list[str]]:
    """List eligible regular text files without following directory symlinks."""
    files: list[Path] = []
    skipped: list[str] = []
    for path in sorted(root.rglob("*")):
        relative_parts = path.relative_to(root).parts
        if any(part in IGNORED_DIRS for part in relative_parts):
            continue
        if path.is_symlink():
            skipped.append(f"{path.relative_to(root)}: symlink")
            continue
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            size = path.stat().st_size
        except OSError as error:
            skipped.append(f"{path.relative_to(root)}: stat error: {error}")
            continue
        if size > MAX_TEXT_BYTES:
            skipped.append(f"{path.relative_to(root)}: exceeds {MAX_TEXT_BYTES} bytes")
            continue
        files.append(path)
    return files, skipped


def inspect_hidden_characters(path: Path, root: Path, text: str, start_index: int) -> list[Finding]:
    """Detect Unicode controls that can conceal or reorder instructions."""
    findings: list[Finding] = []
    index = start_index
    for character, name in HIDDEN_CHARACTERS.items():
        if character not in text:
            continue
        severity = "HIGH" if "OVERRIDE" in name or "EMBEDDING" in name else "MEDIUM"
        findings.append(
            make_finding(
                f"UNICODE-{index:03d}",
                severity,
                "hidden_unicode",
                f"发现不可见或双向控制字符：{name}。",
                path,
                root,
                find_line(text, character),
                f"Unicode {ord(character):04X} {name}",
            )
        )
        index += 1
    return findings


def inspect_patterns(path: Path, root: Path, text: str, start_index: int) -> list[Finding]:
    """Detect high-signal secret and dangerous-execution patterns as review leads."""
    findings: list[Finding] = []
    index = start_index
    for rule_id, severity, pattern, message in SECRET_PATTERNS:
        for match in pattern.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            evidence = redact_match(match.group(0))
            findings.append(make_finding(f"{rule_id}-{index:03d}", severity, "static_pattern", message, path, root, line, evidence))
            index += 1
    for rule_id, severity, pattern, message, suffixes in DANGEROUS_PATTERNS:
        if path.suffix.lower() not in suffixes:
            continue
        for match in pattern.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            findings.append(make_finding(f"{rule_id}-{index:03d}", severity, "static_pattern", message, path, root, line, match.group(0)))
            index += 1
    if path.suffix.lower() == ".py":
        findings.extend(inspect_python_ast(path, root, text, index))
    return findings


def dotted_name(node: ast.AST) -> str:
    """Return a dotted name for a simple Python call target."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = dotted_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    return ""


def inspect_python_ast(path: Path, root: Path, text: str, start_index: int) -> list[Finding]:
    """Inspect Python syntax for dangerous calls without importing the module."""
    findings: list[Finding] = []
    try:
        tree = ast.parse(text, filename=str(path))
    except SyntaxError as error:
        findings.append(
            make_finding(
                f"PY-SYNTAX-{start_index:03d}",
                "MEDIUM",
                "python_ast",
                "Python 文件无法解析，AST 安全检查未完成。",
                path,
                root,
                error.lineno,
                error.msg,
            )
        )
        return findings

    index = start_index
    reads_environment = False
    network_writes: list[tuple[int | None, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and dotted_name(node).startswith("os.environ"):
            reads_environment = True
        if not isinstance(node, ast.Call):
            continue
        call_name = dotted_name(node.func)
        severity: str | None = None
        message: str | None = None
        rule_id: str | None = None
        if call_name in {"eval", "exec"}:
            rule_id, severity, message = "PY-DYNAMIC-EXEC", "MEDIUM", "发现 Python 动态代码执行调用。"
        elif call_name == "__import__":
            rule_id, severity, message = "PY-DYNAMIC-IMPORT", "HIGH", "发现 Python 动态导入调用。"
        elif call_name == "os.system":
            rule_id, severity, message = "PY-OS-SYSTEM", "MEDIUM", "发现 os.system 调用。"
        elif call_name.startswith("subprocess."):
            shell_true = any(
                keyword.arg == "shell" and isinstance(keyword.value, ast.Constant) and keyword.value.value is True
                for keyword in node.keywords
            )
            if shell_true:
                rule_id, severity, message = "PY-SHELL-TRUE", "HIGH", "发现 subprocess shell=True。"
        if call_name in {"requests.post", "requests.put", "httpx.post", "httpx.put", "urllib.request.urlopen"}:
            network_writes.append((getattr(node, "lineno", None), call_name))
        if rule_id is not None and severity is not None and message is not None:
            findings.append(
                make_finding(
                    f"{rule_id}-{index:03d}",
                    severity,
                    "python_ast",
                    message,
                    path,
                    root,
                    getattr(node, "lineno", None),
                    call_name,
                )
            )
            index += 1
    if reads_environment and network_writes:
        line, sink = network_writes[0]
        findings.append(
            make_finding(
                f"FLOW-ENV-NET-{index:03d}",
                "HIGH",
                "data_flow",
                "同一文件读取环境变量并调用网络写入；需要人工确认是否存在凭证外传链路。",
                path,
                root,
                line,
                f"os.environ + {sink}",
            )
        )
    return findings


def redact_match(value: str) -> str:
    """Redact secret-like matches while preserving a useful rule clue."""
    compact = re.sub(r"\s+", " ", value).strip()
    if compact.startswith(("sk-", "ghp_", "gho_", "ghu_", "ghs_", "ghr_", "AKIA")):
        return compact[:4] + "****" + compact[-4:]
    if "PRIVATE KEY" in compact:
        return "-----BEGIN [REDACTED] PRIVATE KEY-----"
    return compact


def highest_severity(findings: list[Finding]) -> str:
    """Return the highest finding severity or NONE."""
    if not findings:
        return "NONE"
    return max((finding.severity for finding in findings), key=lambda value: SEVERITY_ORDER[value])


def inspect_skill(target: Path) -> InspectionResult:
    """Perform a read-only inspection of one Skill directory."""
    root = resolve_skill_root(target)
    skill_file = root / SKILL_FILE
    if not skill_file.is_file():
        raise InspectionError(f"Skill 根目录缺少 {SKILL_FILE}。")

    skill_text = read_text_file(skill_file)
    skill_name, findings = inspect_frontmatter(skill_file, root, skill_text)
    link_findings, reference_index = inspect_links(skill_file, root, skill_text, 1)
    findings.extend(link_findings)

    line_count = len(skill_text.splitlines())
    if line_count > 500:
        findings.append(
            make_finding("SIZE-001", "MEDIUM", "progressive_disclosure", "SKILL.md 超过 500 行。", skill_file, root, 1, f"lines={line_count}")
        )
    elif line_count >= 200:
        findings.append(
            make_finding("SIZE-001", "INFO", "progressive_disclosure", "SKILL.md 已达到 200 行，不满足精简加分条件。", skill_file, root, 1, f"lines={line_count}")
        )

    text_files, skipped_files = iter_text_files(root)
    for file_index, path in enumerate(text_files, start=1):
        text = skill_text if path == skill_file else read_text_file(path)
        findings.extend(inspect_hidden_characters(path, root, text, file_index * 1000))
        findings.extend(inspect_patterns(path, root, text, file_index * 1000))
        if path != skill_file and path.suffix.lower() == ".md":
            new_link_findings, reference_index = inspect_links(path, root, text, reference_index)
            findings.extend(new_link_findings)

    severity = highest_severity(findings)
    invalid_frontmatter = any(finding.category == "frontmatter" and SEVERITY_ORDER[finding.severity] >= SEVERITY_ORDER["HIGH"] for finding in findings)
    if invalid_frontmatter:
        status = "INVALID"
    else:
        status = "FAIL" if SEVERITY_ORDER[severity] >= SEVERITY_ORDER["HIGH"] else "PASS"
    return InspectionResult(
        schema_version="1.0",
        target=str(target),
        skill_root=str(root),
        skill_name=skill_name,
        status=status,
        highest_severity=severity,
        files_scanned=len(text_files),
        skipped_files=skipped_files,
        findings=sorted(findings, key=lambda item: (-SEVERITY_ORDER[item.severity], item.path, item.line or 0, item.id)),
        disclaimer="静态检查无发现不等于 Skill 已被证明安全；本工具从不执行被审计内容。",
    )


def result_to_json_value(result: InspectionResult) -> dict[str, JSONValue]:
    """Convert a typed result into a JSON-serializable mapping."""
    raw = asdict(result)
    return {
        "schema_version": str(raw["schema_version"]),
        "target": str(raw["target"]),
        "skill_root": str(raw["skill_root"]),
        "skill_name": raw["skill_name"] if isinstance(raw["skill_name"], str) else None,
        "status": str(raw["status"]),
        "highest_severity": str(raw["highest_severity"]),
        "files_scanned": int(raw["files_scanned"]),
        "skipped_files": [str(value) for value in raw["skipped_files"]],
        "findings": [
            {
                "id": str(item["id"]),
                "severity": str(item["severity"]),
                "category": str(item["category"]),
                "message": str(item["message"]),
                "path": str(item["path"]),
                "line": int(item["line"]) if isinstance(item["line"], int) else None,
                "evidence": str(item["evidence"]),
            }
            for item in raw["findings"]
        ],
        "disclaimer": str(raw["disclaimer"]),
    }


def render_text(result: InspectionResult) -> str:
    """Render a compact human-readable inspection report."""
    lines = [
        "Skill Mentor deterministic inspection",
        f"Target: {result.skill_root}",
        f"Skill: {result.skill_name or 'UNKNOWN'}",
        f"Status: {result.status}",
        f"Highest severity: {result.highest_severity}",
        f"Files scanned: {result.files_scanned}",
    ]
    if result.skipped_files:
        lines.append("Skipped files:")
        lines.extend(f"  - {item}" for item in result.skipped_files)
    if result.findings:
        lines.append("Findings:")
        for finding in result.findings:
            location = f"{finding.path}:{finding.line}" if finding.line is not None else finding.path
            lines.append(f"  [{finding.severity}] {finding.id} {location} — {finding.message}")
    else:
        lines.append("Findings: none detected")
    lines.append(result.disclaimer)
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Run the inspector and return a stable process exit code."""
    arguments = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        result = inspect_skill(Path(arguments.target))
    except (InspectionError, FileNotFoundError, OSError) as error:
        if arguments.format == "json":
            print(json.dumps({"status": "INVALID", "error": str(error)}, ensure_ascii=False, indent=2))
        else:
            print(f"INVALID: {error}", file=sys.stderr)
        return 2

    if arguments.format == "json":
        print(json.dumps(result_to_json_value(result), ensure_ascii=False, indent=2))
    else:
        print(render_text(result))
    if result.status == "INVALID":
        return 2
    return 1 if result.status == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
