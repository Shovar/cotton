import importlib

from cotton import __version__


def test_version() -> None:
    assert __version__ == "0.1.0"


def test_cotton_package_exports_version() -> None:
    cotton = importlib.import_module("cotton")

    assert cotton.__version__ == "0.1.0"
