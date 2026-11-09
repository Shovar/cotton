from __future__ import annotations

import asyncio
import hashlib
import logging
import shutil
import tarfile
import urllib.error
import urllib.request
from pathlib import Path, PurePosixPath

LICHTBLICK_VERSION = "v1.30.0"
LICHTBLICK_URL = (
    "https://github.com/lichtblick-suite/lichtblick/releases/download/v1.30.0/lichtblick-web.tar.gz"
)
LICHTBLICK_SHA256 = "f73b6bd0b4d2857b7311eb780279494334690e203de43440b54bc75994fd16c6"
ARCHIVE_NAME = "lichtblick-web.tar.gz"

_log = logging.getLogger(__name__)


class AssetError(RuntimeError):
    """A viewer asset could not be downloaded, verified or extracted."""


class LichtblickAssets:
    """Downloads the pinned Lichtblick bundle once, verifies it and marks the cache complete."""

    def __init__(
        self,
        cache_dir: Path,
        url: str = LICHTBLICK_URL,
        sha256: str = LICHTBLICK_SHA256,
    ) -> None:
        self.path = Path(cache_dir)
        self._url = url
        self._sha256 = sha256
        self._lock = asyncio.Lock()

    def is_ready(self) -> bool:
        return (self.path / ".complete").is_file() and (self.path / "index.html").is_file()

    async def ensure(self) -> Path:
        async with self._lock:
            if self.is_ready():
                return self.path
            archive = self.path.parent / ARCHIVE_NAME
            if not archive.is_file():
                await self._download(archive)
            await self._verify(archive)
            await asyncio.to_thread(_extract, archive, self.path)
            (self.path / ".complete").write_text(LICHTBLICK_VERSION, encoding="utf-8")
            return self.path

    async def _download(self, archive: Path) -> None:
        _log.info("downloading Lichtblick %s", LICHTBLICK_VERSION)
        try:
            await asyncio.to_thread(_download, self._url, archive)
        except (OSError, urllib.error.URLError) as exc:
            archive.unlink(missing_ok=True)
            raise AssetError(f"failed to download {self._url}: {exc}") from exc

    async def _verify(self, archive: Path) -> None:
        digest = await asyncio.to_thread(_sha256, archive)
        if digest != self._sha256:
            archive.unlink(missing_ok=True)
            raise AssetError(f"sha256 mismatch for {archive}: got {digest}")


def _download(url: str, archive: Path) -> None:
    archive.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response, archive.open("wb") as handle:
        shutil.copyfileobj(response, handle)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _extract(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    with tarfile.open(archive, "r:gz") as tar:
        members = [member for member in tar.getmembers() if member.name not in {"", "."}]
        names = [PurePosixPath(member.name) for member in members]
        tops = {parts.parts[0] for parts in names if parts.parts}
        strip = len(tops) == 1 and all(len(parts.parts) > 1 for parts in names)
        for member, parts in zip(members, names, strict=False):
            relative = Path(*parts.parts[1:]) if strip else Path(*parts.parts)
            if not relative.parts:
                continue
            target = (root / relative).resolve()
            if root != target and root not in target.parents:
                raise AssetError(f"unsafe archive member: {member.name}")
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                # shortcut: symlinks are skipped, the web bundle does not need them.
                target.parent.mkdir(parents=True, exist_ok=True)
                source = tar.extractfile(member)
                if source is None:
                    continue
                with source, target.open("wb") as handle:
                    shutil.copyfileobj(source, handle)
