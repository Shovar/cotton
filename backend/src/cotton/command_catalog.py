from __future__ import annotations

import os


def executable_names(path: str | None = None) -> list[str]:
    """Return the executable file names reachable through PATH."""
    raw = os.environ.get("PATH", "") if path is None else path
    found: set[str] = set()
    for directory in raw.split(os.pathsep):
        if not directory:
            continue
        try:
            with os.scandir(directory) as entries:
                for entry in entries:
                    try:
                        if entry.is_file() and os.access(entry.path, os.X_OK):
                            found.add(entry.name)
                    except OSError:
                        continue
        except OSError:
            continue
    return sorted(found)
