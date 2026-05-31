#!/usr/bin/env python3
"""
Readability gate for BRAINS repos.

Computes Flesch-Kincaid grade level for each target file and fails CI if any
file exceeds the configured grade ceiling for its category.

Targets:
  - README.md, blog posts, posts/, marketing copy -> public-grade ceiling (default 8)
  - docs/**, technical references                  -> technical-grade ceiling (default 10)

Files can opt out by including the marker `<!-- readability: skip -->` near the top.
"""

from __future__ import annotations

import argparse
import glob
import re
import sys
from pathlib import Path

try:
    import textstat
except ImportError:
    print("textstat not installed. pip install textstat==0.7.4", file=sys.stderr)
    sys.exit(2)


SKIP_MARKER = re.compile(r"<!--\s*readability:\s*skip\s*-->", re.IGNORECASE)
CODE_FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE = re.compile(r"`[^`]+`")
LINKS = re.compile(r"\[([^\]]+)\]\([^)]+\)")
IMAGES = re.compile(r"!\[[^\]]*\]\([^)]+\)")
HTML_TAGS = re.compile(r"<[^>]+>")
HEADERS = re.compile(r"^#+\s+.*$", re.MULTILINE)
TABLES = re.compile(r"^\|.*\|$", re.MULTILINE)
FRONTMATTER = re.compile(r"^---\s*\n.*?\n---\s*\n", re.DOTALL)


def strip_markdown(text: str) -> str:
    text = FRONTMATTER.sub("", text, count=1)
    text = CODE_FENCE.sub("", text)
    text = INLINE_CODE.sub("", text)
    text = IMAGES.sub("", text)
    text = LINKS.sub(r"\1", text)
    text = HTML_TAGS.sub("", text)
    text = HEADERS.sub("", text)
    text = TABLES.sub("", text)
    return text.strip()


def classify(path: Path) -> str:
    """Return 'public' or 'technical' for a given file."""
    parts = {p.lower() for p in path.parts}
    if "docs" in parts or "reference" in parts or "references" in parts:
        return "technical"
    if path.name.lower() in {"contributing.md", "security.md", "code_of_conduct.md"}:
        return "technical"
    return "public"


def expand_paths(patterns: list[str]) -> list[Path]:
    results: set[Path] = set()
    for pattern in patterns:
        for match in glob.glob(pattern, recursive=True):
            p = Path(match)
            if p.is_file() and p.suffix.lower() == ".md":
                results.add(p)
    return sorted(results)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-grade", type=float, default=8.0,
                        help="Max Flesch-Kincaid grade for public copy (default 8)")
    parser.add_argument("--technical-grade", type=float, default=10.0,
                        help="Max Flesch-Kincaid grade for technical docs (default 10)")
    parser.add_argument("--paths", nargs="+", required=True,
                        help="Glob patterns to check")
    parser.add_argument("--min-words", type=int, default=40,
                        help="Skip files shorter than this (default 40)")
    args = parser.parse_args()

    files = expand_paths(args.paths)
    if not files:
        print("No markdown files matched.")
        return 0

    failures: list[tuple[Path, float, float, str]] = []
    passes: list[tuple[Path, float, float, str]] = []
    skips: list[Path] = []

    for path in files:
        raw = path.read_text(encoding="utf-8", errors="replace")
        if SKIP_MARKER.search(raw):
            skips.append(path)
            continue
        clean = strip_markdown(raw)
        words = len(clean.split())
        if words < args.min_words:
            skips.append(path)
            continue
        grade = textstat.flesch_kincaid_grade(clean)
        category = classify(path)
        ceiling = args.public_grade if category == "public" else args.technical_grade
        record = (path, grade, ceiling, category)
        if grade > ceiling:
            failures.append(record)
        else:
            passes.append(record)

    print(f"\nReadability report ({len(passes)} ok, {len(failures)} over, {len(skips)} skipped)\n")
    for path, grade, ceiling, category in passes:
        print(f"  OK   {path}  grade {grade:.1f} (<= {ceiling:.1f}, {category})")
    for path in skips:
        print(f"  SKIP {path}")
    for path, grade, ceiling, category in failures:
        print(f"  FAIL {path}  grade {grade:.1f} > {ceiling:.1f} ({category})")

    if failures:
        print("\nReadability gate failed. Lower the grade level or add `<!-- readability: skip -->` if intentional.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
