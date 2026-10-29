#!/usr/bin/env python3
"""Create an immutable JSON manifest for large research data stored outside Git."""
import argparse, hashlib, json
from datetime import datetime, timezone
from pathlib import Path

def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""): value.update(chunk)
    return value.hexdigest()

parser = argparse.ArgumentParser(); parser.add_argument("paths", nargs="+", type=Path); parser.add_argument("--project", required=True); parser.add_argument("--git-commit", default=None); parser.add_argument("--output", type=Path, default=Path("data/manifest.json")); args = parser.parse_args()
entries = [{"path": str(path), "bytes": path.stat().st_size, "sha256": digest(path)} for path in args.paths if path.is_file()]
version_hash = hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest()[:8]
manifest = {"schemaVersion": 1, "project": args.project, "version": f"{datetime.now(timezone.utc):%Y.%m.%d}-{version_hash}", "gitCommit": args.git_commit, "createdAt": datetime.now(timezone.utc).isoformat(), "entries": entries}
args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"); print(args.output)
