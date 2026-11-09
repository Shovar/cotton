#!/usr/bin/env python3
"""Measure the cost of one graph snapshot with many topics.

Creates ``--topics`` string publishers and runs the same queries as
``RclpyGraphSource.snapshot()`` every second for ``--duration`` seconds, then
prints a JSON report with latency percentiles and process CPU usage.

Run inside an active ROS 2 environment:

    python spikes/graph_probe.py --topics 100
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import threading
import time

SNAPSHOT_INTERVAL_S = 1.0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="graph_probe",
        description="Measure ROS 2 graph snapshot latency and CPU cost",
    )
    parser.add_argument("--topics", type=int, default=100, help="number of publishers (default: 100)")
    parser.add_argument(
        "--duration", type=float, default=20.0, help="polling window in seconds (default: 20)"
    )
    return parser.parse_args(argv)


def percentile(values: list[float], fraction: float) -> float:
    """Nearest-rank percentile; keeps the measurement readable for small samples."""
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int(round(fraction * len(ordered))) - 1))
    return ordered[index]


def snapshot_ms(node) -> tuple[float, int]:
    started = time.perf_counter()
    node.get_node_names_and_namespaces()
    topics = node.get_topic_names_and_types()
    for name, _types in topics:
        node.get_publishers_info_by_topic(name)
        node.get_subscriptions_info_by_topic(name)
    return (time.perf_counter() - started) * 1000.0, len(topics)


def measure(args: argparse.Namespace) -> dict[str, object]:
    import rclpy
    from rclpy.executors import SingleThreadedExecutor
    from std_msgs.msg import String

    rclpy.init()
    node = rclpy.create_node("graph_probe")
    try:
        for index in range(args.topics):
            node.create_publisher(String, f"probe/topic_{index:03d}", 10)

        samples: list[float] = []
        cpu_samples: list[float] = []
        topics_seen = 0
        done = threading.Event()
        wall_start = 0.0
        cpu_start = 0.0

        def poll() -> None:
            nonlocal topics_seen, wall_start, cpu_start
            if not samples:
                wall_start = time.perf_counter()
                cpu_start = time.process_time()
            cpu_before = time.process_time()
            elapsed_ms, count = snapshot_ms(node)
            cpu_samples.append((time.process_time() - cpu_before) * 1000.0)
            samples.append(elapsed_ms)
            topics_seen = max(topics_seen, count)
            if time.perf_counter() - wall_start >= args.duration:
                node.destroy_timer(timer)
                done.set()

        timer = node.create_timer(SNAPSHOT_INTERVAL_S, poll)
        executor = SingleThreadedExecutor()
        executor.add_node(node)
        thread = threading.Thread(target=executor.spin, daemon=True)
        thread.start()
        if not done.wait(timeout=args.duration + 30):
            raise RuntimeError("polling did not finish; the ROS executor is stuck")
        cpu_seconds = time.process_time() - cpu_start
        wall_seconds = time.perf_counter() - wall_start
        executor.shutdown()
        thread.join(timeout=5)
        node.destroy_node()
    finally:
        rclpy.shutdown()

    return {
        "machine": sys.platform,
        "ros_distro": os.environ.get("ROS_DISTRO"),
        "rmw_implementation": os.environ.get("RMW_IMPLEMENTATION") or "rmw_fastrtps_cpp (default)",
        "topic_count": args.topics,
        "topics_seen": topics_seen,
        "samples": len(samples),
        "duration_s": round(wall_seconds, 3),
        "poll_ms_p50": round(statistics.median(samples), 3),
        "poll_ms_p95": round(percentile(samples, 0.95), 3),
        "poll_ms_max": round(max(samples), 3),
        "poll_cpu_ms_p50": round(statistics.median(cpu_samples), 3),
        "cpu_percent": round(cpu_seconds / wall_seconds * 100.0, 2),
        "snapshot_cpu_percent": round(sum(cpu_samples) / 1000.0 / wall_seconds * 100.0, 2),
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.topics < 1 or args.duration <= 0:
        print("graph_probe: --topics must be >= 1 and --duration > 0", file=sys.stderr)
        return 2
    try:
        report = measure(args)
    except ImportError as exc:
        print(
            f"graph_probe: rclpy is not importable ({exc}). "
            "Activate a ROS 2 environment first, e.g. 'pixi shell -e jazzy' or "
            "'source /opt/ros/jazzy/setup.bash'.",
            file=sys.stderr,
        )
        return 2
    except RuntimeError as exc:
        print(f"graph_probe: {exc}", file=sys.stderr)
        return 1
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
