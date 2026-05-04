#!/usr/bin/env python3
"""
check_integrity.py - sanity-check the pipeline's source files before
running. Catches the recurring trailing-byte corruption pattern (truncated
Python tails, NUL-byte trailing in YAML files) that has bitten the build
multiple times.

Usage:
    python3 visual_engine/check_integrity.py              # exit 0 / non-zero
    python3 visual_engine/check_integrity.py --quiet      # suppress OK output

Designed to be called from render.bat or any pipeline-runner script as
a pre-flight check.
"""
from __future__ import annotations
import argparse
import ast
import sys
from pathlib import Path

import yaml


def _find_root():
    cur = Path(__file__).resolve().parent
    for _ in range(10):
        if (cur / "visual_libraries").exists() and (cur / "visual_engine").exists():
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    return Path.cwd()


ROOT = _find_root()

PY_FILES = [
    "visual_engine/markup/markup_compiler/markup_compiler.py",
    "visual_engine/markup/view_compiler/view_compiler.py",
    "visual_engine/renderer/render.py",
]

YAML_GLOBS = [
    "visual_libraries/*/*.yaml",
    "visual_libraries/*/data-templates/*.yaml",
]


def check_python(path: Path):
    if not path.exists():
        return ("MISSING", "file does not exist")
    data = path.read_bytes()
    if b"\x00" in data:
        n = data.count(b"\x00")
        return ("CORRUPT", f"{n} NUL byte(s)")
    try:
        ast.parse(data)
    except SyntaxError as e:
        return ("CORRUPT", f"syntax error line {e.lineno}: {e.msg}")
    return ("OK", f"{len(data)}b")


def check_yaml(path: Path):
    if not path.exists():
        return ("MISSING", "file does not exist")
    data = path.read_bytes()
    if b"\x00" in data:
        n = data.count(b"\x00")
        return ("CORRUPT", f"{n} NUL byte(s)")
    try:
        yaml.safe_load(data)
    except yaml.YAMLError as e:
        msg = str(e).splitlines()[0]
        return ("CORRUPT", f"YAML error: {msg}")
    return ("OK", f"{len(data)}b")


def main():
    ap = argparse.ArgumentParser(description="Integrity check for pipeline source files.")
    ap.add_argument("--quiet", action="store_true", help="Only print failures")
    args = ap.parse_args()

    failures = []
    checked = 0

    for rel in PY_FILES:
        path = ROOT / rel
        status, info = check_python(path)
        checked += 1
        if status == "OK":
            if not args.quiet:
                print(f"  OK   {rel}  ({info})")
        else:
            failures.append((rel, status, info))
            print(f"  {status}  {rel}  ({info})", file=sys.stderr)

    for glob_pat in YAML_GLOBS:
        for path in sorted(ROOT.glob(glob_pat)):
            rel = path.relative_to(ROOT).as_posix()
            status, info = check_yaml(path)
            checked += 1
            if status == "OK":
                if not args.quiet:
                    print(f"  OK   {rel}  ({info})")
            else:
                failures.append((rel, status, info))
                print(f"  {status}  {rel}  ({info})", file=sys.stderr)

    if failures:
        print(f"\nIntegrity check FAILED: {len(failures)}/{checked} file(s) corrupt.", file=sys.stderr)
        print("\nLikely cause: a sync/indexing process on the host is truncating", file=sys.stderr)
        print("files. Re-save the affected file(s) from your editor and retry.", file=sys.stderr)
        sys.exit(1)

    if not args.quiet:
        print(f"\nAll {checked} file(s) clean.")
    sys.exit(0)


if __name__ == "__main__":
    main()
