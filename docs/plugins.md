# Plugins

Plugins are declared with a `plugin.yaml` manifest. ROS Studio discovers the
builtin manifests in `ros_studio/builtin_plugins/` and the user manifests in
`~/.config/ros-studio/plugins/` (the platform config directory). A user plugin
with the same `name` replaces the builtin one.

## Manifest

```yaml
name: foxglove                # unique, lowercase [a-z0-9_.-]
version: 0.1.0
description: Foxglove bridge with the local Lichtblick viewer
permissions: [process, network]   # shown to the user, not enforced in v1
requires: []                  # plugin names that must be active first
processes:
  - id: bridge                # prefixed with "<plugin>." at runtime
    argv: [ros2, launch, foxglove_bridge, foxglove_bridge_launch.xml, port:=8765]
    cwd: null
    env: {}
healthcheck:
  url: tcp://127.0.0.1:8765   # tcp://, http:// or https://
  timeout_s: 5.0
  retries: 40
  delay_s: 0.5
panels:
  - id: viewer
    title: Foxglove
    type: iframe              # iframe, stream or native
    url: "http://{host}/lichtblick/index.html?ds=foxglove-websocket&ds.url=ws://{hostname}:8765&layoutUrl=http://{host}/lichtblick/layout.json"
```

Validation runs at load time: ids must be unique per manifest, `argv` cannot be
empty, and `iframe`/`stream` panels need an `http(s)` URL. A manifest that fails
validation, or that requires an unknown plugin, is still listed with `state:
error` and an `error` message; the other plugins keep loading.

Activation starts processes in dependency order, waits for the healthcheck with
the configured retries, and rolls back every process it started when the check
fails. Active plugin names are stored in the `settings` table under
`plugins.active` and restored on the next start. `DELETE /api/plugins/{name}/activate`
stops the processes; closing the backend stops them too but keeps the persisted
list so they return on the next start.

## Lichtblick assets

The viewer is downloaded, not vendored: `LichtblickAssets` fetches the pinned
`v1.30.0` release, verifies its SHA-256, extracts it into the platform cache
directory (`~/.cache/ros-studio/lichtblick/` on Linux), copies the packaged
`layout.json` next to it and writes `.complete`.
For offline installs, copy the verified `lichtblick-web.tar.gz` next to that
directory before the first start.

The backend serves the cache at `/lichtblick` (before the SPA catch-all). If the
assets are not there yet, it answers with a page that explains how to pre-seed
the cache instead of a broken viewer. The viewer URL uses the `layoutUrl` query
parameter, because Lichtblick `v1.30.0` does not accept inline `?layout=` JSON.
The packaged layout opens a 3D panel on `/tf` and a Plot on `/turtle1/pose`.

The panel URL supports two placeholders: `{host}` is replaced with
`location.host` (host and port, so a custom `--port` works) and `{hostname}` with
`location.hostname` (host only, used for the Foxglove bridge on `8765`). The
frontend replaces them before rendering the iframe and checks that same-origin
assets exist before showing the viewer.
