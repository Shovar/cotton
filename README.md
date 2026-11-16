# Cotton

<p align="center">
  <img src="frontend/src/assets/cotton-logo-readme.png" alt="Cotton" width="140" />
</p>

Cotton is a local web control panel for an active ROS 2 environment. It shows
the node graph, starts and supervises processes with live logs, completes ROS 2
commands, and embeds a Foxglove viewer. It runs inside the environment you
already have, binds to loopback, and requires a session token instead of accounts
or cloud services.

## Install

Requirements: ROS 2 Humble or Jazzy, Python 3.10+, and Node 24+ only when the
installer has to build the frontend.

```bash
git clone https://github.com/Shovar/ros-studio.git
cd ros-studio
scripts/install.sh
cotton
```

The installer creates a user virtualenv in `~/.local/share/cotton/venv`,
installs the app there and links the `cotton` command into `~/.local/bin`.
The command is a small wrapper: it sources `ROS_SETUP` when set; otherwise, if
the terminal has no ROS 2 environment active, it sources the distro named by
`ROS_DISTRO` or the only `/opt/ros/*/setup.bash` it finds. Re-run the installer
to upgrade.

To install a prebuilt wheel instead of the checkout:

```bash
scripts/install.sh dist/cotton-0.1.0-py3-none-any.whl
```

If `~/.local/bin` is not on your `PATH`, add it to your shell profile. For a
colcon workspace overlay, source its `install/setup.bash` first or point
`ROS_SETUP` at it:

```bash
ROS_SETUP=~/ros2_ws/install/setup.bash cotton
```

Uninstall with `rm -rf ~/.local/share/cotton ~/.local/bin/cotton`. See
[Installation](docs/install.md) for pixi/RoboStack, apt, Docker, WSL2, the manual
wheel build and troubleshooting.

## What it does

- **Graph** — nodes, topics, services and actions, kept in sync with the ROS
  graph and filterable from the UI.
- **Processes** — start commands, follow their logs, stop or restart them, and
  reuse named profiles.
- **Command prompt** — suggestions from `PATH`, ROS 2 verbs and the live graph;
  `Tab` completes and `Ctrl+R` searches the persisted history.
- **Plugins** — the Foxglove/Lichtblick viewer and extra panels, with their
  assets checked and served locally.

The server listens on `127.0.0.1:8000` by default and opens the browser with the
session token in the URL fragment. The app stores the token in `sessionStorage`
and clears the address bar. Use `--host`, `--port`, `--token`, `--no-browser` and
repeatable `--allow-origin` to change that; use `cotton --help` for the
current list. Do not bind to `0.0.0.0` outside Docker.

Data stays on the machine: SQLite state and logs in the platform config
directory (`~/.config/cotton/` on Linux), and the Lichtblick cache in
`~/.cache/cotton/` (macOS uses `~/Library/Caches/cotton/`). There is no
telemetry, account or remote execution.

## Documentation

- [Installation](docs/install.md)
- [Product spec](docs/Spec%20IDE%20local%20para%20ROS%202.md)
- [Design](docs/superpowers/specs/2026-11-06-ros-studio-design.md)
- [Implementation plan](docs/superpowers/plans/2026-11-06-ros-studio-mvp.md)
- [Task list](docs/superpowers/tasks/2026-11-06-ros-studio-design.md)
- [Cotton rename design](docs/superpowers/specs/2026-11-16-cotton-rename-design.md)
- [Cotton rename plan](docs/superpowers/plans/2026-11-16-cotton-rename.md)
- [REST and WebSocket contract](docs/contracts/api.md)
- [Plugin manifests and Lichtblick assets](docs/plugins.md)

## Development

```bash
python3 -m venv .venv --system-site-packages
source .venv/bin/activate
pip install -e ".[dev]"
pytest -m "not integration" --cov=cotton --cov-fail-under=80
```

Use `--system-site-packages` so the virtual environment can import the `rclpy`
provided by the active ROS 2 installation. Run `cotton --help` after
activating a ROS 2 environment; without one, the CLI reports how to activate it.

`scripts/dev.sh` does all of it for you: it keeps the ROS 2 environment that is
already active or sources the one in `ROS_SETUP`, activates `.venv`, rebuilds
`frontend/dist` when the frontend sources changed, copies it to
`backend/src/cotton/web`, and forwards every argument to `cotton`.

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

The backend serves the compiled SPA from `backend/src/cotton/web`. For a
packaged install, copy `frontend/dist` there after `npm run build` (the
Dockerfile and the CI workflows do it before packaging); `scripts/dev.sh` and
`scripts/install.sh` do it for local runs. Then install the package:

```bash
rm -rf backend/src/cotton/web
cp -R frontend/dist backend/src/cotton/web
```

See [docs/install.md](docs/install.md) for pixi, apt, Docker and WSL2.
