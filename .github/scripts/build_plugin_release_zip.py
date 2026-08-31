#!/usr/bin/env python3
"""Build a reproducible MoviePilot plugin ZIP for Release distribution.

The package is deliberately stored (rather than compressed) so that a package
verified before release has the same SHA-256 when GitHub Actions publishes it.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import zipfile


ARCHIVE_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
ARCHIVE_FILE_MODE = 0o100644


def _git_output(repository: Path, *args: str) -> bytes:
    completed = subprocess.run(
        ["git", *args],
        cwd=repository,
        check=True,
        stdout=subprocess.PIPE,
    )
    return completed.stdout


def build(plugin_dir: Path, output: Path) -> None:
    root = plugin_dir.resolve()
    if not root.is_dir():
        raise SystemExit(f"Plugin directory does not exist: {plugin_dir}")

    repository = Path(_git_output(root, "rev-parse", "--show-toplevel").decode().strip())
    source_root = root.relative_to(repository).as_posix()
    listed = _git_output(repository, "ls-files", "-z", "--", source_root).split(b"\0")
    files = sorted(path.decode("utf-8") for path in listed if path)
    if not files:
        raise SystemExit(f"Plugin directory has no distributable files: {plugin_dir}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED, strict_timestamps=True) as archive:
        for tracked_path in files:
            source_path = Path(tracked_path)
            arcname = Path(root.name, source_path.relative_to(source_root)).as_posix()
            info = zipfile.ZipInfo(arcname, date_time=ARCHIVE_TIMESTAMP)
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            # Windows and Linux report different default file permissions.
            # Use the stable Git-style regular-file mode so the archive identity
            # does not vary with the machine that built it.
            info.external_attr = ARCHIVE_FILE_MODE << 16
            archive.writestr(info, _git_output(repository, "show", f"HEAD:{tracked_path}"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plugin_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.plugin_dir, args.output)


if __name__ == "__main__":
    main()
