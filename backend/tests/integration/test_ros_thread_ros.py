import asyncio
import os
import shutil
import threading

import pytest

pytestmark = pytest.mark.integration
pytest.importorskip("rclpy")


@pytest.mark.skipif(
    not os.environ.get("ROS_DISTRO") or shutil.which("ros2") is None,
    reason="ROS 2 environment is not active",
)
def test_real_ros_thread_roundtrip() -> None:
    from cotton.ros.thread import RosThread

    before = threading.active_count()
    thread = RosThread(poll_interval=0.01)
    thread.start()
    try:
        assert asyncio.run(thread.call(lambda: 2 + 2)) == 4
    finally:
        thread.stop()
    assert threading.active_count() == before
