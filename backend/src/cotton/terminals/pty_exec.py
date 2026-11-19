from __future__ import annotations

import fcntl
import os
import sys
import termios


def main(argv: list[str] | None = None) -> int:
    command = sys.argv[1:] if argv is None else argv
    if not command or not command[0]:
        print("pty_exec: executable is required", file=sys.stderr)
        return 2

    try:
        fcntl.ioctl(0, termios.TIOCSCTTY, 0)
        os.execvpe(command[0], command, os.environ)
    except OSError as exc:
        print(f"pty_exec: failed to execute {command[0]}: {exc}", file=sys.stderr)
        return 127


if __name__ == "__main__":
    raise SystemExit(main())
