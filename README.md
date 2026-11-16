# ROS Studio

ROS Studio is a local web control panel for an active ROS 2 environment: it shows
the node graph, manages launch processes with live logs, and embeds a Foxglove
viewer. It runs inside the environment you already have, binds to loopback, and
requires a session token instead of accounts or cloud services.

## Documentation

- [Installation](docs/install.md)
- [Product spec](docs/Spec%20IDE%20local%20para%20ROS%202.md)
- [Design](docs/superpowers/specs/2026-11-06-ros-studio-design.md)
- [Implementation plan](docs/superpowers/plans/2026-11-06-ros-studio-mvp.md)
- [Task list](docs/superpowers/tasks/2026-11-06-ros-studio-design.md)
- [REST and WebSocket contract](docs/contracts/api.md)
- [Plugin manifests and Lichtblick assets](docs/plugins.md)

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

`scripts/dev.sh` does all of it for you: it keeps the ROS 2 environment that is
already active or sources the one in `ROS_SETUP`, activates `.venv`, rebuilds
`frontend/dist` when the frontend sources changed, copies it to
`backend/src/ros_studio/web`, and forwards every argument to `ros-studio`.

```bash
scripts/dev.sh                       # already-sourced ROS 2 shell
ROS_SETUP=/path/to/setup.bash scripts/dev.sh --port 8111
```

## Frontend development

The commands below run from the repository root and delegate to `frontend/`:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
```

The Vite dev server proxies `/api` and `/ws` to `http://127.0.0.1:8000`. Open
the printed URL with the session token in the fragment (`/#token=<token>`); the
frontend stores it in `sessionStorage` and removes it from the address bar.

The backend serves the compiled SPA from `backend/src/ros_studio/web`. For a
packaged install, copy `frontend/dist` there after `npm run build` (the
Dockerfile, the CI workflows and the release recipe do it before packaging);
`scripts/dev.sh` does it for local runs. Then install the package:

```bash
rm -rf backend/src/ros_studio/web
cp -R frontend/dist backend/src/ros_studio/web
```

See [docs/install.md](docs/install.md) for pixi, apt, Docker and WSL2.
