from __future__ import annotations

import hashlib
import io
import json
import tarfile
from pathlib import Path

import pytest

from cotton.plugins.assets import AssetError, LichtblickAssets


def make_archive(path: Path, files: dict[str, str]) -> str:
    with tarfile.open(path, "w:gz") as tar:
        for name, text in files.items():
            payload = text.encode()
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            tar.addfile(info, io.BytesIO(payload))
    return hashlib.sha256(path.read_bytes()).hexdigest()


async def test_ensure_verifies_extracts_and_marks_the_cache(tmp_path: Path) -> None:
    archive = tmp_path / "lichtblick-web.tar.gz"
    digest = make_archive(archive, {"index.html": "viewer", "assets/app.js": "code"})
    cache = tmp_path / "cache"
    assets = LichtblickAssets(cache, url=archive.as_uri(), sha256=digest)

    root = await assets.ensure()

    assert root == cache
    assert (root / "index.html").read_text(encoding="utf-8") == "viewer"
    assert (root / "assets" / "app.js").is_file()
    assert (root / ".complete").is_file()
    assert assets.is_ready()


async def test_invalid_checksum_raises_and_leaves_no_marker(tmp_path: Path) -> None:
    archive = tmp_path / "lichtblick-web.tar.gz"
    make_archive(archive, {"index.html": "viewer"})
    cache = tmp_path / "cache"
    assets = LichtblickAssets(cache, url=archive.as_uri(), sha256="0" * 64)

    with pytest.raises(AssetError, match="sha256"):
        await assets.ensure()

    assert not (cache / ".complete").exists()


async def test_single_top_level_directory_is_stripped(tmp_path: Path) -> None:
    archive = tmp_path / "lichtblick-web.tar.gz"
    digest = make_archive(archive, {"bundle/index.html": "viewer"})
    assets = LichtblickAssets(tmp_path / "cache", url=archive.as_uri(), sha256=digest)

    root = await assets.ensure()

    assert (root / "index.html").is_file()


async def test_ensure_copies_the_default_layout(tmp_path: Path) -> None:
    archive = tmp_path / "lichtblick-web.tar.gz"
    digest = make_archive(archive, {"index.html": "viewer"})
    assets = LichtblickAssets(tmp_path / "cache", url=archive.as_uri(), sha256=digest)

    root = await assets.ensure()

    layout = json.loads((root / "layout.json").read_text(encoding="utf-8"))
    assert layout["configById"]["3D!rosstudio"]["topics"]["/tf"]["visible"] is True
    plot_paths = [path["value"] for path in layout["configById"]["Plot!rosstudio"]["paths"]]
    assert "/turtle1/pose.x" in plot_paths
