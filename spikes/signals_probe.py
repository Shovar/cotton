#!/usr/bin/env python3
"""Validate process-group shutdown and orphan recovery.

Three scenarios, all with ``start_new_session=True`` so the child owns its
process group:

1. Cooperative child: ``SIGINT`` to the group must kill the child and its
   grandchild.
2. Backend crash: the parent is killed with ``SIGKILL``; a fresh process must
   still detect the orphaned grandchild and stop it with ``killpg``.
3. Stubborn child: the child and grandchild ignore ``SIGINT`` and ``SIGTERM``,
   so the escalation must end in ``SIGKILL`` and leave the group empty.

Run with the active ROS or system Python (only the standard library is used):

    python spikes/signals_probe.py
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import time

GRACE_SIGINT_S = 5.0
GRACE_SIGTERM_S = 3.0
POLL_S = 0.02

# Grandchild is a real `sleep` so it leaves the Python process tree.
CHILD_SCRIPT = """
import os
import signal
import subprocess
import sys
import time

ignore = sys.argv[1] == "ignore"
if ignore:
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)

grandchild = subprocess.Popen(["sleep", "60"])
print(f"grandchild_pid={grandchild.pid}", flush=True)
print(f"child_pid={os.getpid()}", flush=True)
while True:
    time.sleep(0.2)
"""

CHECK_SCRIPT = """
import json
import os
import signal
import sys
import time

registry_path = sys.argv[1]
with open(registry_path, encoding="utf-8") as handle:
    registry = json.load(handle)
pgid = registry["pgid"]


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def group_alive():
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


report = {
    "orphan_grandchild_alive": alive(registry["grandchild_pid"]),
    "group_alive_after_parent_kill": group_alive(),
}
for name, sig, grace in (
    ("SIGTERM", signal.SIGTERM, 1.0),
    ("SIGKILL", signal.SIGKILL, 1.0),
):
    if not group_alive():
        break
    os.killpg(pgid, sig)
    deadline = time.monotonic() + grace
    while time.monotonic() < deadline and group_alive():
        time.sleep(0.02)
    report["signal_that_emptied_group"] = name
report["group_empty_after_killpg"] = not group_alive()
print(json.dumps(report), flush=True)
"""


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def start_tree(ignore_signals: bool) -> tuple[subprocess.Popen[str], int]:
    child = subprocess.Popen(
        [sys.executable, "-c", CHILD_SCRIPT, "ignore" if ignore_signals else "cooperate"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        start_new_session=True,
    )
    assert child.stdout is not None
    line = child.stdout.readline()
    if not line.startswith("grandchild_pid="):
        child.kill()
        raise RuntimeError(f"child did not report its grandchild: {line!r}")
    return child, int(line.split("=", 1)[1])


def wait_group_gone(child: subprocess.Popen[str], pgid: int, timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        child.poll()
        if not group_alive(pgid):
            return True
        time.sleep(POLL_S)
    child.poll()
    return not group_alive(pgid)


def escalate(
    child: subprocess.Popen[str], pgid: int, members: list[int]
) -> dict[str, object]:
    result: dict[str, object] = {}
    started = time.monotonic()
    signal_used = None
    for name, sig, grace in (
        ("SIGINT", signal.SIGINT, GRACE_SIGINT_S),
        ("SIGTERM", signal.SIGTERM, GRACE_SIGTERM_S),
        ("SIGKILL", signal.SIGKILL, 1.0),
    ):
        try:
            os.killpg(pgid, sig)
        except ProcessLookupError:
            break
        gone = wait_group_gone(child, pgid, grace)
        result[f"orphans_after_{name.lower()}"] = sum(1 for pid in members if alive(pid))
        if gone:
            signal_used = name
            break
    result["signal_that_emptied_group"] = signal_used
    result["elapsed_s"] = round(time.monotonic() - started, 3)
    result["group_empty"] = not group_alive(pgid)
    return result


def scenario_cooperative() -> dict[str, object]:
    child, grandchild_pid = start_tree(ignore_signals=False)
    pgid = child.pid
    report: dict[str, object] = {
        "child_pid": child.pid,
        "child_pgid": pgid,
        "grandchild_pid": grandchild_pid,
    }
    report.update(escalate(child, pgid, [child.pid, grandchild_pid]))
    child.wait(timeout=5)
    return report


def scenario_backend_killed() -> dict[str, object]:
    child, grandchild_pid = start_tree(ignore_signals=False)
    pgid = child.pid
    registry = {"pid": child.pid, "pgid": pgid, "grandchild_pid": grandchild_pid}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
        json.dump(registry, handle)
        registry_path = handle.name
    try:
        child.kill()  # kill -9 the parent only; the grandchild keeps the group alive
        child.wait(timeout=5)
        check = subprocess.run(
            [sys.executable, "-c", CHECK_SCRIPT, registry_path],
            capture_output=True,
            text=True,
            check=True,
        )
        report = json.loads(check.stdout)
        report.update(
            {
                "registry": registry,
                "parent_exit_signal": "SIGKILL",
                "orphan_stoppable_from_new_process": report["group_empty_after_killpg"],
                "group_empty": report["group_empty_after_killpg"],
            }
        )
        return report
    finally:
        if group_alive(pgid):
            os.killpg(pgid, signal.SIGKILL)
        os.unlink(registry_path)


def scenario_stubborn() -> dict[str, object]:
    child, grandchild_pid = start_tree(ignore_signals=True)
    pgid = child.pid
    report: dict[str, object] = {
        "child_ignores": ["SIGINT", "SIGTERM"],
        "child_pid": child.pid,
        "child_pgid": pgid,
        "grandchild_pid": grandchild_pid,
    }
    report.update(escalate(child, pgid, [child.pid, grandchild_pid]))
    child.wait(timeout=5)
    return report


def main() -> int:
    started = time.monotonic()
    report = {
        "machine": sys.platform,
        "grace_sigint_s": GRACE_SIGINT_S,
        "grace_sigterm_s": GRACE_SIGTERM_S,
        "scenario_1_cooperative": scenario_cooperative(),
        "scenario_2_parent_killed": scenario_backend_killed(),
        "scenario_3_stubborn": scenario_stubborn(),
    }
    report["wall_s"] = round(time.monotonic() - started, 3)
    report["five_plus_three_grace_sufficient"] = all(
        report[key]["group_empty"]
        for key in (
            "scenario_1_cooperative",
            "scenario_2_parent_killed",
            "scenario_3_stubborn",
        )
    )
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
