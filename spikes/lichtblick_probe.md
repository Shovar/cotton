# Lichtblick probe — stage 0

Report of the disposable spikes that decide how ROS Studio ships the viewer.
Full numbers and environment live in [`docs/etapa-0-mediciones.md`](../docs/etapa-0-mediciones.md).

## Pinned version

| Field | Value |
| --- | --- |
| Version | `v1.30.0` (stable, published 2026-10-22) |
| Commit | `fcfc7d559d8e76db36c9730e78049a60f976c2d2` |
| License | MPL-2.0 (BMW AG 2024, Foxglove Technologies 2021–2024) |
| Login / cloud | not required to open the viewer locally |

## Environment

macOS 26.6.2 arm64 (Apple M4, 10 cores, 24 GB), Node 26.7.0, npm 11.19.0,
Yarn 4.17.0 via corepack 0.36.0, Python 3.12.13 (RoboStack Jazzy).
Lichtblick was cloned and built outside the repository, in a temporary folder.

## Build

```bash
git clone --depth 1 --branch v1.30.0 https://github.com/lichtblick-suite/lichtblick.git
npm install -g corepack@latest        # Node 26 no longer bundles corepack
yarn install --immutable
yarn build:packages && yarn web:build:prod
```

- `npm ci` does not work: the repository has no `package-lock.json` (Yarn-only).
  It fails with `EUSAGE` before installing anything.
- `yarn install --immutable`: exit 0 in 22 s, 1276 packages, no errors.
- `yarn build:packages && yarn web:build:prod`: exit 0; webpack 5.108.3 compiled
  with 2 warnings in 19 s. There is no root `build` script.

| Artifact | Size |
| --- | --- |
| `web/.webpack` (with source maps) | 172 MB |
| `web/.webpack` without `*.map` | 41.5 MiB |
| `lichtblick-web.tar.gz` official | 40 636 655 B (38.75 MiB) |
| Official bundle extracted | 172 MB |

## Serving and data source

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory web/.webpack
pixi run bash -c '.pixi/envs/default/lib/foxglove_bridge/foxglove_bridge --port 8765'
```

`foxglove_bridge` 3.6.0 came from RoboStack in a temporary pixi environment (it
is not installed in the base Jazzy env). The URL that loads the viewer and
connects to the bridge is:

```text
http://127.0.0.1:8080/?ds=foxglove-websocket&ds.url=ws://127.0.0.1:8765
```

Evidence: headless Edge screenshot shows the viewer with `ws://127.0.0.1:8765`
in its top bar, and the bridge log records the client connection plus a graph
subscribe request. `ds.url` must be an absolute `ws://` URL; a relative host is
not accepted, so the backend must build it from the browser hostname.

Headless Edge has no WebGL: 3D panels show “Error creating WebGL context”. The
viewer shell and the WebSocket data source work; visual 3D verification needs a
GPU browser and belongs to the stage 3 acceptance test.

## Layout by URL

`?layout=...` is **not** supported by v1.30.0. Supported forms:

- `?layoutUrl=<http(s) URL>`: fetches a layout JSON, installs it as a local
  layout and selects it. Verified: the browser requested the file and the
  empty layout replaced the default panels.
- `?defaultLayout=<name>`: selects an already installed layout by name.

Minimal valid layout JSON:

```json
{
  "configById": {},
  "globalVariables": {},
  "playbackConfig": { "speed": 1 }
}
```

`userNodes` is optional. The design must use `layoutUrl` (layout served by the
backend) or `defaultLayout`, not `?layout=`.

## Packaging decision: download, not vendor

Vendoring 38.75 MiB compressed (41.5 MiB without maps) in the wheel or building
Lichtblick in CI is not worth it, and MPL-2.0 requires keeping notices and
source availability. Download the pinned official web bundle on first start,
verify the checksum and cache it locally:

| Field | Value |
| --- | --- |
| URL | `https://github.com/lichtblick-suite/lichtblick/releases/download/v1.30.0/lichtblick-web.tar.gz` |
| Version | `v1.30.0` |
| SHA-256 | `f73b6bd0b4d2857b7311eb780279494334690e203de43440b54bc75994fd16c6` |
| Size | 40 636 655 B |

Offline installs pre-seed the cache by copying this `.tar.gz`; the backend
extracts it after verifying the hash. The plugin manifest stores the download
URL and the viewer URL, so switching viewers does not touch the core.

## Install validation

- **pixi / RoboStack:** wheel `ros_studio-0.1.0-py3-none-any.whl` (17 442 B)
  installed with `pip` inside a temporary Jazzy env. `import rclpy`, `import
  fastapi`, `import uvicorn`, `import ros_studio` and `ros-studio --help` all
  pass. Only `platformdirs` came from PyPI; no resolver conflict, so the
  `--no-deps` variant was not needed.
- **Ubuntu venv `--system-site-packages`:** not validated. This session runs on
  macOS arm64 with no Ubuntu 24.04 + ROS 2 apt host. The wheel is
  `py3-none-any`; the pending command is documented in
  `docs/etapa-0-mediciones.md`.
