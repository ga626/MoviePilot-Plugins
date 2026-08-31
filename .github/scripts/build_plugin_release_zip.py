#!/usr/bin/env python3
"""Build a reproducible MoviePilot plugin ZIP for Release distribution.

The package is deliberately stored (rather than compressed) so that a package
verified before release has the same SHA-256 when GitHub Actions publishes it.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import stat
import zipfile


ARCHIVE_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def _included(path: Path, root: Path) -> bool:
    relative = path.relative_to(root)
    return "__pycache__" not in relative.parts and path.suffix != ".pyc"


def build(plugin_dir: Path, output: Path) -> None:
    root = plugin_dir.resolve()
    if not root.is_dir():
        raise SystemExit(f"Plugin directory does not exist: {plugin_dir}")

    files = sorted(path for path in root.rglob("*") if path.is_file() and _included(path, root))
    if not files:
        raise SystemExit(f"Plugin directory has no distributable files: {plugin_dir}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as archive:
        for path in files:
            arcname = Path(root.name, path.relative_to(root)).as_posix()
            info = zipfile.ZipInfo(arcname, date_time=ARCHIVE_TIMESTAMP)
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = (stat.S_IMODE(path.stat().st_mode) & 0xFFFF) << 16
            archive.writestr(info, path.read_bytes())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plugin_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.plugin_dir, args.output)


if __name__ == "__main__":
    main()
