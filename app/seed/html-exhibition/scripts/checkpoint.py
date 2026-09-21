# -*- coding: utf-8 -*-
"""Create and update recoverable html-exhibition checkpoints atomically."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


PHASES = ("understand", "outline", "select", "write", "assemble", "verify", "deliver")
STATUSES = ("ready", "in_progress", "completed", "failed", "blocked")


def timestamp() -> str:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def write_atomic(path: Path, payload: dict[str, object]) -> None:
    """Write one checkpoint atomically in the target directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=path.name, suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    except (OSError, TypeError, ValueError):
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise


def initialize(args: argparse.Namespace) -> dict[str, object]:
    """Create a new checkpoint payload from explicit route inputs."""
    return {
        "schema_version": "1.0",
        "phase": "understand",
        "status": "ready",
        "route": {"view": args.view, "structure": args.structure},
        "template": args.template,
        "slides_total": args.slides_total,
        "slides_done": 0,
        "completed_batches": [],
        "last_error": None,
        "updated_at": timestamp(),
    }


def update(args: argparse.Namespace) -> dict[str, object]:
    """Update an existing checkpoint without discarding unrelated fields."""
    path = args.file.resolve()
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["phase"] = args.phase
    payload["status"] = args.status
    if args.slides_done is not None:
        payload["slides_done"] = args.slides_done
    if args.batch is not None:
        batches = payload.setdefault("completed_batches", [])
        if not isinstance(batches, list):
            raise ValueError("completed_batches must be a list")
        if args.batch not in batches:
            batches.append(args.batch)
            batches.sort()
    payload["last_error"] = args.error
    payload["updated_at"] = timestamp()
    return payload


def main() -> int:
    """Parse checkpoint subcommands and write the resulting state."""
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    init = subparsers.add_parser("init")
    init.add_argument("--file", type=Path, required=True)
    init.add_argument("--view", choices=("scroll", "stage"), required=True)
    init.add_argument("--structure", choices=("single", "modular"), required=True)
    init.add_argument("--template", default="terminal-mint")
    init.add_argument("--slides-total", type=int, default=0)
    change = subparsers.add_parser("update")
    change.add_argument("--file", type=Path, required=True)
    change.add_argument("--phase", choices=PHASES, required=True)
    change.add_argument("--status", choices=STATUSES, required=True)
    change.add_argument("--slides-done", type=int)
    change.add_argument("--batch", type=int)
    change.add_argument("--error")
    args = parser.parse_args()
    payload = initialize(args) if args.command == "init" else update(args)
    write_atomic(args.file.resolve(), payload)
    print(args.file.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
