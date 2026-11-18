from __future__ import annotations

import asyncio
import errno
import fcntl
import os
import struct
import sys
import termios
from collections.abc import Mapping, Sequence
from pathlib import Path

from cotton.terminals.ports import PtySession

_READ_SIZE = 65536


class PosixPtySpawner:
    async def spawn(self, argv: Sequence[str], cwd: Path, env: Mapping[str, str]) -> PtySession:
        if not argv:
            raise ValueError("argv must contain an executable")

        master_fd, slave_fd = os.openpty()
        try:
            _set_window_size(slave_fd, 80, 24)
            os.set_blocking(master_fd, False)
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-m",
                "cotton.terminals.pty_exec",
                *argv,
                cwd=cwd,
                env=dict(env),
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                start_new_session=True,
            )
        except BaseException:
            os.close(master_fd)
            os.close(slave_fd)
            raise

        os.close(slave_fd)
        return PosixPtySession(process, master_fd)


class PosixPtySession:
    def __init__(self, process: asyncio.subprocess.Process, master_fd: int) -> None:
        self._process = process
        self._master_fd = master_fd
        self._closed = False

    @property
    def pid(self) -> int:
        assert self._process.pid is not None
        return self._process.pid

    async def read(self) -> bytes | None:
        await _wait_for_fd(self._master_fd, writable=False)
        try:
            data = os.read(self._master_fd, _READ_SIZE)
        except OSError as exc:
            if exc.errno == errno.EIO:
                return None
            raise
        return data or None

    async def write(self, data: bytes) -> None:
        view = memoryview(data)
        while view:
            try:
                written = os.write(self._master_fd, view)
            except BlockingIOError:
                await _wait_for_fd(self._master_fd, writable=True)
            else:
                view = view[written:]

    async def resize(self, cols: int, rows: int) -> None:
        _set_window_size(self._master_fd, cols, rows)

    def has_foreground_job(self) -> bool:
        return os.tcgetpgrp(self._master_fd) != self.pid

    async def close(self) -> int:
        if self._closed:
            return await self._process.wait()
        self._closed = True
        try:
            try:
                return await asyncio.wait_for(self._process.wait(), timeout=0.5)
            except TimeoutError:
                self._process.terminate()
                try:
                    return await asyncio.wait_for(self._process.wait(), timeout=0.5)
                except TimeoutError:
                    self._process.kill()
                    return await self._process.wait()
        finally:
            os.close(self._master_fd)


async def _wait_for_fd(fd: int, *, writable: bool) -> None:
    loop = asyncio.get_running_loop()
    ready = loop.create_future()
    add_callback = loop.add_writer if writable else loop.add_reader
    remove_callback = loop.remove_writer if writable else loop.remove_reader
    add_callback(fd, ready.set_result, None)
    try:
        await ready
    finally:
        remove_callback(fd)


def _set_window_size(fd: int, cols: int, rows: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
