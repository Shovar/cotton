import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="scripts/install.sh requires bash")


def _fake_wheel(directory: Path) -> Path:
    wheel = directory / "fake_ros_studio-0.1.0-py3-none-any.whl"
    files = {
        "fake_ros_studio.py": (
            "import os\n"
            "import sys\n"
            "\n"
            "def main():\n"
            "    print('fake ros-studio', os.environ.get('FAKE_ROS', 'unset'), *sys.argv[1:])\n"
        ),
        "fake_ros_studio-0.1.0.dist-info/METADATA": (
            "Metadata-Version: 2.1\nName: fake-ros-studio\nVersion: 0.1.0\n"
        ),
        "fake_ros_studio-0.1.0.dist-info/WHEEL": (
            "Wheel-Version: 1.0\nGenerator: test\nRoot-Is-Purelib: true\nTag: py3-none-any\n"
        ),
        "fake_ros_studio-0.1.0.dist-info/entry_points.txt": (
            "[console_scripts]\nros-studio = fake_ros_studio:main\n"
        ),
    }
    files["fake_ros_studio-0.1.0.dist-info/RECORD"] = (
        "".join(f"{name},,\n" for name in files) + "fake_ros_studio-0.1.0.dist-info/RECORD,,\n"
    )
    with zipfile.ZipFile(wheel, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return wheel


def _path_without_ros2(directory: Path) -> str:
    tools = directory / "tools"
    tools.mkdir()
    for name in ("bash", "dirname", "env", "readlink"):
        source = shutil.which(name)
        assert source is not None
        (tools / name).symlink_to(source)
    return str(tools)


def test_installer_links_ros_studio_and_sources_ros_setup(tmp_path: Path) -> None:
    prefix = tmp_path / "prefix"
    bin_dir = tmp_path / "bin"
    setup = tmp_path / "setup.bash"
    setup.write_text("export FAKE_ROS=1\n")

    install = subprocess.run(
        [
            str(REPO_ROOT / "scripts" / "install.sh"),
            "--prefix",
            str(prefix),
            "--bin-dir",
            str(bin_dir),
            str(_fake_wheel(tmp_path)),
        ],
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHON": sys.executable},
        timeout=120,
    )
    assert install.returncode == 0, install.stderr

    link = bin_dir / "ros-studio"
    assert link.is_symlink()
    assert os.readlink(link) == str(prefix / "bin" / "ros-studio")

    tools = Path(_path_without_ros2(tmp_path))
    run = subprocess.run(
        [str(link), "--check"],
        capture_output=True,
        text=True,
        env={"HOME": str(tmp_path), "PATH": str(tools), "ROS_SETUP": str(setup)},
        timeout=30,
    )
    assert run.returncode == 0, run.stderr
    assert run.stdout.strip() == "fake ros-studio 1 --check"

    ros2 = tools / "ros2"
    ros2.write_text("#!/bin/sh\nexit 0\n")
    ros2.chmod(0o755)
    run = subprocess.run(
        [str(link), "--check"],
        capture_output=True,
        text=True,
        env={"HOME": str(tmp_path), "PATH": str(tools), "ROS_SETUP": str(setup)},
        timeout=30,
    )
    assert run.returncode == 0, run.stderr
    assert run.stdout.strip() == "fake ros-studio 1 --check"
