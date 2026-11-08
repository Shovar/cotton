# ROS Studio

ROS Studio is a local web control panel for an active ROS 2 environment: it shows
the node graph, manages launch processes with live logs, and embeds a Foxglove
viewer. It runs inside the environment you already have, binds to loopback, and
requires a session token instead of accounts or cloud services.

## Documentation

- [Product spec](docs/Spec%20IDE%20local%20para%20ROS%202.md)
- [Design](docs/superpowers/specs/2026-11-06-ros-studio-design.md)
- [Implementation plan](docs/superpowers/plans/2026-11-06-ros-studio-mvp.md)
- [Task list](docs/superpowers/tasks/2026-11-06-ros-studio-design.md)
- [REST and WebSocket contract](docs/contracts/api.md)

## Development

```bash
/opt/homebrew/bin/python3.12 -m venv .venv --system-site-packages
source .venv/bin/activate
pip install -e ".[dev]"
pytest -m "not integration" --cov=ros_studio --cov-fail-under=80
```

Use `--system-site-packages` so the virtual environment can import the `rclpy`
provided by the active ROS 2 installation. Run `ros-studio --help` after
activating a ROS 2 environment; without one, the CLI reports how to activate it.
