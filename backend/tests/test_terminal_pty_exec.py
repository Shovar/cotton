from __future__ import annotations

import asyncio
import os
import signal
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
        "import fcntl, struct, termios\n"
        "print('TTY:' + ','.join(str(int(os.isatty(fd))) for fd in (0, 1, 2)), flush=True)\n"
        "print(f'FG:{os.tcgetpgrp(0)}:{os.getpgrp()}', flush=True)\n"
        "sys.stdin.readline()\n"
        "size = struct.unpack('HHHH', fcntl.ioctl(0, termios.TIOCGWINSZ, b'\\0' * 8))\n"
        "print(f'SIZE:{size[1]},{size[0]}', flush=True)\n"
        "print('INPUT:hello', flush=True)\n"
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

        await session.resize(81, 25)
        await session.write(b"hello\r")
        while b"INPUT:hello" not in output or b"SIZE:81,25" not in output:
            chunk = await asyncio.wait_for(session.read(), timeout=3)
            assert chunk is not None
            output.extend(chunk)
    finally:
        await session.close()

    assert b"INPUT:hello" in output
    assert b"SIZE:81,25" in output


@pytest.mark.integration
@pytest.mark.skipif(
    os.name != "posix" or not hasattr(termios, "TIOCSCTTY"),
    reason="POSIX controlling PTYs are unavailable",
)
async def test_close_terminates_the_entire_process_group(tmp_path: Path) -> None:
    child_script = (
        "import signal, time\n"
        "signal.signal(signal.SIGHUP, signal.SIG_IGN)\n"
        "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
        "time.sleep(60)\n"
    )
    parent_script = (
        "import os, signal, subprocess, sys, time\n"
        f"child = subprocess.Popen([sys.executable, '-c', {child_script!r}])\n"
        "signal.signal(signal.SIGHUP, signal.SIG_IGN)\n"
        "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
        "print(f'CHILD:{child.pid}', flush=True)\n"
        "while True: time.sleep(1)\n"
    )
    session = await PosixPtySpawner().spawn(
        [sys.executable, "-c", parent_script],
        tmp_path,
        dict(os.environ),
    )
    pgid = session.pid
    try:
        output = bytearray()
        while b"CHILD:" not in output:
            chunk = await asyncio.wait_for(session.read(), timeout=3)
            assert chunk is not None
            output.extend(chunk)

        await session.close()
        assert not _process_group_alive(pgid)
    finally:
        try:
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        await session.close()


def test_pty_exec_rejects_missing_executable(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([]) == 2
    assert "executable" in capsys.readouterr().err


def _process_group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True
