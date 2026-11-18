from __future__ import annotations

import asyncio
import os
import signal
import sys
import termios
from pathlib import Path

import pytest

from cotton.terminals.posix import PosixPtySession, PosixPtySpawner
from cotton.terminals.pty_exec import main


async def test_close_attempts_every_group_after_permission_is_denied(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeProcess:
        pid = 4242

        async def wait(self) -> int:
            return 0

    master_fd, slave_fd = os.openpty()
    os.close(slave_fd)
    session = PosixPtySession(FakeProcess(), master_fd)  # type: ignore[arg-type]
    signalled: list[tuple[int, int]] = []

    def signal_group(pgid: int, sig: int) -> None:
        signalled.append((pgid, sig))
        if pgid == 4243 and sig == signal.SIGKILL:
            raise PermissionError("operation not permitted")

    async def groups_are_gone(_pgids: set[int], *, timeout: float) -> bool:
        return False

    monkeypatch.setattr("cotton.terminals.posix.os.tcgetpgrp", lambda _fd: 4243)
    monkeypatch.setattr("cotton.terminals.posix._signal_group", signal_group)
    monkeypatch.setattr("cotton.terminals.posix._wait_for_groups_exit", groups_are_gone)

    with pytest.raises(PermissionError, match="4243"):
        await session.close()

    assert {(pgid, sig) for pgid, sig in signalled if sig == signal.SIGKILL} == {
        (4242, signal.SIGKILL),
        (4243, signal.SIGKILL),
    }


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


@pytest.mark.integration
@pytest.mark.skipif(
    os.name != "posix" or not hasattr(termios, "TIOCSCTTY"),
    reason="POSIX controlling PTYs are unavailable",
)
async def test_close_terminates_a_separate_foreground_process_group(
    tmp_path: Path,
) -> None:
    child_script = (
        "import os, signal, time\n"
        "os.setpgid(0, 0)\n"
        "signal.signal(signal.SIGHUP, signal.SIG_IGN)\n"
        "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
        "time.sleep(60)\n"
    )
    parent_script = (
        "import os, signal, subprocess, sys, time\n"
        f"child = subprocess.Popen([sys.executable, '-c', {child_script!r}])\n"
        "signal.signal(signal.SIGTTOU, signal.SIG_IGN)\n"
        "signal.signal(signal.SIGHUP, signal.SIG_IGN)\n"
        "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
        "while os.getpgid(child.pid) == os.getpgrp(): time.sleep(0.01)\n"
        "os.tcsetpgrp(0, child.pid)\n"
        "print(f'FG:{os.tcgetpgrp(0)}', flush=True)\n"
        "while True: time.sleep(1)\n"
    )
    session = await PosixPtySpawner().spawn(
        [sys.executable, "-c", parent_script],
        tmp_path,
        dict(os.environ),
    )
    shell_pgid = session.pid
    foreground_pgid: int | None = None
    try:
        output = bytearray()
        while b"FG:" not in output:
            chunk = await asyncio.wait_for(session.read(), timeout=3)
            assert chunk is not None
            output.extend(chunk)
        foreground_pgid = int(
            next(line for line in output.splitlines() if line.startswith(b"FG:"))
            .decode()
            .split(":")[1]
        )

        assert foreground_pgid != shell_pgid
        await session.close()
        assert not _process_group_alive(shell_pgid)
        assert not _process_group_alive(foreground_pgid)
    finally:
        pgids = {shell_pgid}
        if foreground_pgid is not None:
            pgids.add(foreground_pgid)
        for pgid in pgids:
            try:
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        await session.close()


@pytest.mark.integration
@pytest.mark.skipif(
    os.name != "posix" or not hasattr(termios, "TIOCSCTTY"),
    reason="POSIX controlling PTYs are unavailable",
)
async def test_close_does_not_signal_process_group_zero(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    session = await PosixPtySpawner().spawn(
        [sys.executable, "-c", "pass"],
        tmp_path,
        dict(os.environ),
    )
    await session._process.wait()
    signalled_groups: list[int] = []

    def record_signal(pgid: int, sig: int) -> None:
        signalled_groups.append(pgid)

    async def groups_are_gone(_pgids: set[int], *, timeout: float) -> bool:
        return True

    monkeypatch.setattr("cotton.terminals.posix.os.tcgetpgrp", lambda _fd: 0)
    monkeypatch.setattr("cotton.terminals.posix._signal_group", record_signal)
    monkeypatch.setattr(
        "cotton.terminals.posix._wait_for_groups_exit",
        groups_are_gone,
    )

    await session.close()

    assert 0 not in signalled_groups


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
