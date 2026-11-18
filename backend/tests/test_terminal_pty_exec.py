from __future__ import annotations

import asyncio
import os
import sys
import termios
from pathlib import Path

import pytest

from cotton.terminals.posix import PosixPtySpawner
from cotton.terminals.pty_exec import main


@pytest.mark.integration
@pytest.mark.skipif(
    os.name != "posix" or not hasattr(termios, "TIOCSCTTY"),
    reason="POSIX controlling PTYs are unavailable",
)
async def test_posix_pty_has_controlling_terminal_and_roundtrips_input(
    tmp_path: Path,
) -> None:
    child_script = (
        "import os, sys\n"
        "print('TTY:' + ','.join(str(int(os.isatty(fd))) for fd in (0, 1, 2)), flush=True)\n"
        "print(f'FG:{os.tcgetpgrp(0)}:{os.getpgrp()}', flush=True)\n"
        "print('INPUT:' + sys.stdin.readline().rstrip(), flush=True)\n"
    )
    session = await PosixPtySpawner().spawn(
        [sys.executable, "-c", child_script],
        tmp_path,
        dict(os.environ),
    )
    output = bytearray()
    try:
        while b"FG:" not in output:
            chunk = await asyncio.wait_for(session.read(), timeout=3)
            assert chunk is not None, output.decode(errors="replace")
            output.extend(chunk)

        assert b"TTY:1,1,1" in output
        fg_line = next(line for line in output.splitlines() if line.startswith(b"FG:"))
        _, foreground_group, process_group = fg_line.decode().split(":")
        assert foreground_group == process_group

        await session.write(b"hello\r")
        while b"INPUT:hello" not in output:
            chunk = await asyncio.wait_for(session.read(), timeout=3)
            assert chunk is not None
            output.extend(chunk)
    finally:
        await session.close()

    assert b"INPUT:hello" in output


def test_pty_exec_rejects_missing_executable(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([]) == 2
    assert "executable" in capsys.readouterr().err
