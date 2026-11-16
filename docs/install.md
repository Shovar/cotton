# Installing ROS Studio

ROS Studio runs inside a ROS 2 environment you already have. It is a Python
package plus a compiled web UI served by the same process; `rclpy` is never
installed from PyPI, it comes from the active ROS 2 distribution.

Supported targets are Linux (Ubuntu 22.04 and 24.04), WSL2 and Docker. macOS is
a development environment only: use pixi/RoboStack there and expect DDS
discovery limits that do not exist on Linux.

Requirements:

- ROS 2 Humble or Jazzy, with `ros2`, `rclpy`, `ROS_DISTRO` and
  `AMENT_PREFIX_PATH` reachable from the shell that starts ROS Studio.
- Python 3.10+ and `python3-venv` on Debian/Ubuntu.
- Node 24+ (`24.15+` for the test suite) and npm only when building or testing
  the frontend from source, or when the installer has to build it.
- `foxglove_bridge` and `turtlesim` for the viewer plugin and the E2E flow
  (`ros-<distro>-foxglove-bridge`, `ros-<distro>-turtlesim`).

## Installer (recommended)

From a checkout:

```bash
scripts/install.sh
ros-studio
```

The installer creates `~/.local/share/ros-studio/venv` with
`--system-site-packages`, installs the package there, and writes
`~/.local/share/ros-studio/bin/ros-studio`, linked as `~/.local/bin/ros-studio`.
The linked command is a wrapper: it sources `ROS_SETUP` when set; otherwise,
when ROS 2 is not active it sources the distro named by `ROS_DISTRO` or the only
`/opt/ros/*/setup.bash` it finds. It also keeps the venv's `site-packages` ahead
of ROS `PYTHONPATH` entries.

From a prebuilt wheel:

```bash
scripts/install.sh dist/ros_studio-0.1.0-py3-none-any.whl
```

Without a wheel, the installer builds the frontend when the compiled bundle is
missing or older than its sources, then installs the checkout. It picks the
first Python 3.10+ interpreter it finds (`python3.13` to `python3`) unless
`PYTHON` names one. Re-run the same command to upgrade. `--prefix DIR` changes the install directory and
`--bin-dir DIR` changes where the command is linked; `--help` lists both.

If your terminal does not already include `~/.local/bin`, add it to `PATH` in
`~/.profile` or `~/.zshrc`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

For a colcon overlay, source its `install/setup.bash` before `ros-studio`, or
run `ROS_SETUP=~/ros2_ws/install/setup.bash ros-studio`. Uninstall with
`rm -rf ~/.local/share/ros-studio ~/.local/bin/ros-studio`.

## Build a wheel manually

Use this path for releases, CI or an environment where the installer does not
fit:

```bash
npm install
npm run build
rm -rf backend/src/ros_studio/web
cp -R frontend/dist backend/src/ros_studio/web
python -m build --wheel
```

The wheel embeds `frontend/dist` as `ros_studio/web`; the copy step is required
because the frontend build is not tracked in git. Install the wheel with the
installer, or inside an environment that can already import `rclpy`:

```bash
pip install dist/ros_studio-0.1.0-py3-none-any.whl
ros-studio --help
```

`ros-studio` binds to `127.0.0.1:8000`, generates a session token and opens the
browser at `http://127.0.0.1:8000/#token=<token>`. Keep that token in the URL
fragment only; the app stores it in `sessionStorage` and clears the address bar.

Flags: `--host`, `--port`, `--token`, `--no-browser`, and repeatable
`--allow-origin` for extra WebSocket/CORS origins. Use `--token` only for
automation, never for an interactive session.

## Running a checkout

`scripts/dev.sh` starts ROS Studio from a source checkout on any of the paths
in this document. It uses the ROS 2 environment that is already active, or
sources the one given in `ROS_SETUP` (a pixi/RoboStack `setup.sh`, an apt
`setup.bash` or a colcon workspace `install/setup.bash`), then activates
`.venv` and forwards every argument to `ros-studio`:

```bash
scripts/dev.sh
ROS_SETUP=/path/to/ros/setup.sh scripts/dev.sh --port 8111
```

Some setup scripts (pixi/RoboStack in particular) prepend their own
`site-packages` to `PYTHONPATH`, which shadows the packages installed in
`.venv` and breaks the imports. The script puts the `.venv` packages back in
front, so no manual `PYTHONPATH` handling is needed. macOS still has the DDS
discovery limits noted below.

## pixi / RoboStack (macOS and Linux)

```bash
pixi init ros-studio-env
cd ros-studio-env
pixi add python=3.12 pip fastapi uvicorn
pixi add --channel robostack-jazzy ros-jazzy-rclpy ros-jazzy-foxglove-bridge ros-jazzy-turtlesim
pixi add --pypi ./dist/ros_studio-0.1.0-py3-none-any.whl
pixi run ros-studio --help
pixi run ros-studio
```

Install FastAPI and uvicorn from conda-forge and the ROS packages from
RoboStack so the resolvedor does not mix two builds of the same library. If the
resolvedor still complains about duplicate dependencies, install the wheel with
`pip install --no-deps` and keep the conda-forge versions.

This path was validated in stage 0 (`docs/etapa-0-mediciones.md`, S4): the wheel
installs, `import rclpy` works and `ros-studio --help` prints its usage.

## apt (Ubuntu 22.04 and 24.04)

```bash
sudo apt install python3-venv ros-jazzy-desktop ros-jazzy-foxglove-bridge ros-jazzy-turtlesim

cd ros-studio
scripts/install.sh
ros-studio
```

The installer creates the venv with `--system-site-packages`, so it imports the
`rclpy` installed by apt without declaring it as a PyPI dependency. The wrapper
sources `/opt/ros/jazzy/setup.bash` when it is the only ROS installation; source
it yourself (or set `ROS_SETUP`) when Humble and Jazzy are both installed. For
Humble, replace `jazzy` with `humble` everywhere.

To install an already built wheel, pass it to the installer instead:
`scripts/install.sh ./dist/ros_studio-0.1.0-py3-none-any.whl`.

The apt path was not executed on this macOS host; the integration workflow in
`.github/workflows/integration.yml` runs the same commands inside the official
`ros:humble-ros-base` and `ros:jazzy-ros-base` images on every push.

## Docker

```bash
docker compose -f docker/compose.yaml up --build
```

Open `http://127.0.0.1:8000/#token=test-token` (the compose default token). The
image is `ros:jazzy-ros-base` with the app installed in a
`--system-site-packages` venv, plus `foxglove_bridge`, `turtlesim` and
`demo_nodes_cpp`. The entrypoint starts a virtual display (`Xvfb :99`) when
`DISPLAY` is unset, so GUI nodes such as `turtlesim_node` also run headless
inside the container.

Compose publishes only `127.0.0.1:8000` (UI and API) and `127.0.0.1:8765`
(`foxglove_bridge`). Variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ROS_STUDIO_TOKEN` | `test-token` | Session token; change it outside local demos |
| `ROS_DOMAIN_ID` | `0` | DDS domain shared with the workspace |
| `ROS_WORKSPACE` | `docker/workspace` | colcon workspace mounted read-only at `/ws`; its `install/setup.bash` is sourced when present |

Without `docker compose`, the same image runs directly:

```bash
docker build -f docker/Dockerfile -t ros-studio .
docker run --rm -p 127.0.0.1:8000:8000 -p 127.0.0.1:8765:8765 \
  -e ROS_DOMAIN_ID=0 ros-studio
```

Two caveats:

- The token protects the API and the UI, not `foxglove_bridge`. Port `8765` is
  published on loopback for that reason; do not expose it on `0.0.0.0`.
- A bridged Docker network does not see ROS nodes running on the host. Keep the
  nodes inside the container, or run the container with `--network host` on
  Linux (then the port mappings are not used). A remote browser is out of scope
  for the v1.

## WSL2

Use the apt path inside the WSL distribution. WSL2 forwards `127.0.0.1:8000` to
Windows, so the browser on Windows opens `http://127.0.0.1:8000/#token=<token>`
while ROS Studio and ROS 2 keep running inside WSL. Do not bind to `0.0.0.0`
to make it work.

DDS multicast between WSL2 and a physical robot may be blocked depending on the
network; setting the same `ROS_DOMAIN_ID` and RMW implementation on both sides
is the first thing to check.

## Integration and E2E

The integration test starts `turtlesim`, compares nodes and topics with
`ros2 node list` / `ros2 topic list --include-hidden-topics` and measures
`/turtle1/pose`. It is marked `integration` and skips cleanly without ROS:

```bash
pytest -m integration -v
```

The E2E flow drives the browser against a running stack (compose or `docker
run`): token, start `turtlesim`, see `/turtlesim` in the graph, measure
`/turtle1/pose`, stop the process and activate the Foxglove plugin.

```bash
cd frontend
npm ci
npx playwright install chromium
npm run e2e
```

`ROS_STUDIO_URL` and `ROS_STUDIO_TOKEN` override the default
`http://127.0.0.1:8000` and `test-token`. The same flow runs in
`.github/workflows/integration.yml` with Humble and Jazzy.

## Changing `ROS_DOMAIN_ID`

ROS Studio reads `ROS_DOMAIN_ID` when it starts, and every node must agree on
it. After changing the variable, restart ROS Studio **and** the processes it
launches, and clear the ROS 2 daemon cache:

```bash
ros2 daemon stop
ros-studio
```

Restarting only the browser is not enough: the backend keeps its `rclpy` node on
the old domain.

## Offline Lichtblick assets

The Foxglove viewer is downloaded on first start to the platform cache
(`~/.cache/ros-studio/lichtblick/` on Linux,
`~/Library/Caches/ros-studio/lichtblick/` on macOS), checked against the pinned
SHA-256 and extracted. For offline installs, copy the verified
`lichtblick-web.tar.gz` next to that directory before the first start; the
backend serves it at `/lichtblick` and explains how to pre-seed the cache when
the assets are missing.

## Troubleshooting

- `ros-studio: command not found`: add `~/.local/bin` to `PATH` (see the
  installer section) or reinstall with a directory that is already on `PATH`.
- `ROS_DISTRO is not set` or `AMENT_PREFIX_PATH is not set`: source
  `/opt/ros/<distro>/setup.bash` (or your colcon workspace) in the same shell,
  or set `ROS_SETUP` and let the installed wrapper source it.
- `ros-studio: ROS_SETUP does not exist`: point `ROS_SETUP` at the setup script
  or unset it to let the wrapper look in `/opt/ros`.
- `ros-studio: broken installation`: re-run `scripts/install.sh`.
- `rclpy is not importable`: recreate the venv with
  `python3 -m venv --system-site-packages`.
- `frontend_not_built` on `/`: the wheel has no `ros_studio/web`; rebuild the
  frontend and reinstall the wheel.
- The UI loads but the graph is empty: check that the nodes use the same
  `ROS_DOMAIN_ID` and RMW implementation, then run `ros2 node list`.
