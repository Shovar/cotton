# Cotton API contract

This document is the single source of truth for the HTTP API, WebSocket
protocol, payload models, error envelope and authentication. Feature workers
implement against it; do not invent fields or event names outside this file.

- Base URL: `http://127.0.0.1:8000`
- REST prefix: `/api`
- WebSocket endpoint: `/ws`
- JSON only. Timestamps are ISO 8601 strings in UTC (`2026-11-06T12:00:00Z`).

## 1. Authentication

The CLI generates a session token (32 random bytes) at startup.

| Surface | Credential |
| --- | --- |
| REST `/api/*` except `/api/health` | `Authorization: Bearer <token>` |
| `/api/health` | none |
| WebSocket `/ws` | `?token=<token>` query parameter |

`Origin` is validated for WebSocket connections and for CORS. Allowed origins
are exactly `http://127.0.0.1:<port>`, `http://localhost:<port>` and any origin
passed with `--allow-origin`. There are no wildcards. A WebSocket with a bad
token or a non-allowed/missing `Origin` is closed with code `1008` before it is
accepted. REST requests with a missing or wrong token receive `401` with code
`unauthorized`.

The browser receives the token in the URL fragment `#token=...`; the frontend
stores it in `sessionStorage` and removes it from the address bar.

## 2. Error envelope

Every non-2xx JSON response has exactly this shape:

```json
{ "code": "machine_readable_code", "message": "human readable explanation" }
```

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Malformed request that is not a validation error |
| 401 | `unauthorized` | Missing or invalid bearer token |
| 403 | `forbidden_origin` | Origin not allowed by CORS or WebSocket validation |
| 404 | `not_found` | Unknown route |
| 404 | `node_not_found` | ROS node does not exist or disappeared |
| 404 | `topic_not_found` | ROS topic does not exist |
| 404 | `terminal_not_found` | Unknown terminal session id |
| 404 | `plugin_not_found` | Unknown plugin name |
| 409 | `param_not_settable` | Parameter is read-only or rejected by the node |
| 409 | `plugin_error` | Plugin activation or healthcheck failed |
| 409 | `terminal_busy` | A terminal session has an active command and requires confirmation to close |
| 409 | `terminal_close_failed` | The operating system denied permission to terminate a terminal process group |
| 422 | `validation_error` | Request body or path failed validation |
| 500 | `internal_error` | Unexpected server error; details are not leaked |

## 3. Models

### EnvironmentInfo

```json
{
  "distro": "jazzy",
  "domain_id": 0,
  "rmw": "rmw_cyclonedds_cpp",
  "workspace": "/ws",
  "ros_version": "2",
  "app_version": "0.1.0"
}
```

`rmw`, `workspace` and `ros_version` are nullable. `domain_id` defaults to `0`.

### NodeInfo

```json
{
  "name": "/talker",
  "namespace": "/",
  "publishers": ["/chatter"],
  "subscribers": [],
  "services": ["/talker/get_parameters"],
  "actions": []
}
```

### TopicInfo

```json
{
  "name": "/chatter",
  "types": ["std_msgs/msg/String"],
  "publishers": ["/talker"],
  "subscribers": ["/listener"]
}
```

A topic with no endpoints is still listed, with empty lists.

### GraphSnapshot

```json
{
  "nodes": [],
  "topics": [],
  "services": { "/talker/get_parameters": ["rcl_interfaces/srv/GetParameters"] },
  "actions": { "/fibonacci": ["action_tutorials_interfaces/action/Fibonacci"] },
  "revision": 0
}
```

`nodes` is `NodeInfo[]`, `topics` is `TopicInfo[]`, `services` and `actions` are
maps from fully qualified name to a list of types. Lists and map keys are
sorted. The app's own node (`/cotton_<pid>`) is never included.
`revision` increases only when the snapshot changes.

### RateResult

```json
{ "available": true, "hz": 62.1, "window_s": 2.0, "reason": null }
```

When unavailable: `{"available": false, "hz": null, "window_s": 2.0, "reason": "no_publishers"}`.
Known reasons: `no_publishers`, `type_unavailable`.

### PluginRecord

```json
{
  "name": "foxglove",
  "state": "active",
  "error": null,
  "manifest": { "name": "foxglove", "version": "0.1.0", "description": "...", "panels": [], "permissions": [] }
}
```

`state` is one of `discovered`, `active`, `stopped`, `error`.

### TerminalRecord

```json
{
  "spec": {
    "id": "t_0123456789abcdef",
    "kind": "shell",
    "argv": ["/bin/bash"],
    "cwd": "/workspace",
    "env": {}
  },
  "state": "running",
  "pid": 4242,
  "started_at": "2026-11-18T10:00:00Z",
  "exit_code": null,
  "error": null
}
```

`kind` is `shell` or `command`; `state` is `starting`, `running`, `exited` or
`failed`. `started_at`, `pid`, `exit_code` and `error` are nullable. `argv` is
always a list; a string command is converted with `shlex.split` at the API
boundary and nothing is ever passed to a shell.

## 4. REST endpoints

All endpoints below require `Authorization: Bearer <token>` unless marked
otherwise.

| Method | Path | Success | Body / notes |
| --- | --- | --- | --- |
| GET | `/api/health` | 200 | No auth. `{"status":"ok"}` |
| GET | `/api/env` | 200 | `EnvironmentInfo` |
| GET | `/api/commands` | 200 | Sorted executable names reachable through the backend `PATH`; used by the command prompt |
| GET | `/api/graph` | 200 | Current `GraphSnapshot`; empty snapshot before the first poll |
| GET | `/api/nodes/{node_name:path}/params` | 200 | `{ "<param>": <value> }`; 404 `node_not_found` |
| PUT | `/api/nodes/{node_name:path}/params/{param}` | 204 | Body `{"value": <value>}`; 404 `node_not_found`; 409 `param_not_settable`; 422 `validation_error` |
| GET | `/api/topics/{topic:path}/rate?window_s=2.0` | 200 | `RateResult`; 404 `topic_not_found`; `window_s` is clamped to `[0.5, 5.0]` |
| GET | `/api/plugins` | 200 | `PluginRecord[]` |
| POST | `/api/plugins/{name}/activate` | 200 | `PluginRecord`; 404 `plugin_not_found`; 409 `plugin_error` |
| DELETE | `/api/plugins/{name}/activate` | 200 | Stopped `PluginRecord`; 404 `plugin_not_found` |
| GET | `/api/terminals?workspace_id=<id>` | 200 | `TerminalRecord[]`, optionally filtered by workspace |
| POST | `/api/terminals` | 201 | Body `{"workspace_id": string, "group_id"?: string, "command"?: string \| string[], "cwd"?: string, "env"?: object}`; omitted command starts the default shell in the workspace path; 422 `workspace_required` / `group_not_found` / `validation_error`; 404 `workspace_not_found` |
| PATCH | `/api/terminals/{id}` | 200 | Body `{"group_id": string}`; moves the session to another group of its own workspace; 404 `terminal_not_found`; 422 `group_not_found` |
| GET | `/api/folders?path=<dir>` | 200 | `{"path": string, "parent": string \| null, "folders": [{"name": string, "path": string}]}`; only directories, sorted by name, defaults to the home of the backend user; 422 `validation_error` when the path is not an existing directory |
| GET | `/api/workspaces` | 200 | `Workspace[]` |
| POST | `/api/workspaces` | 201 | Body `{"name": string, "path": string}`; the path is stored resolved; 409 `workspace_exists`; 422 `validation_error` |
| PATCH | `/api/workspaces/{id}` | 200 | Body `{"name": string}`; 404 `workspace_not_found`; 422 `validation_error` |
| DELETE | `/api/workspaces/{id}` | 200 | `{"id": string}`; 409 `workspace_has_terminals` while a session of that workspace is alive; 404 `workspace_not_found` |
| GET | `/api/workspaces/{id}/groups` | 200 | `TerminalGroup[]` ordered by position; 404 `workspace_not_found` |
| POST | `/api/workspaces/{id}/groups` | 201 | Body `{"name": string}`; appends at the end; 404 `workspace_not_found`; 422 `validation_error` |
| PATCH | `/api/terminal-groups/{group_id}` | 200 | Body `{"name": string}`; 404 `group_not_found`; 422 `validation_error` |
| DELETE | `/api/terminal-groups/{group_id}` | 200 | `{"id": string}`; 409 `group_not_empty` with open terminals, `group_is_last` for the only group; 404 `group_not_found` |
| GET | `/api/workspaces/{id}/commands` | 200 | `WorkspaceCommand[]` ordered by position; 404 `workspace_not_found` |
| POST | `/api/workspaces/{id}/commands` | 201 | Body `{"label": string, "body": string, "is_startup"?: false}`; 409 `startup_command_exists`; 422 `validation_error`; 404 `workspace_not_found` |
| PATCH | `/api/workspace-commands/{command_id}` | 200 | Body `{"label"?: string, "body"?: string, "is_startup"?: boolean}`; promoting one command clears the previous startup flag; 404 `command_not_found`; 422 `validation_error` |
| DELETE | `/api/workspace-commands/{command_id}` | 200 | `{"id": string}`; 404 `command_not_found` |
| POST | `/api/workspaces/{id}/commands/{command_id}/run` | 201 | Body `{"group_id"?: string}`; starts one shell in the workspace and returns its `TerminalRecord`; 404 `workspace_not_found` / `command_not_found`; 422 `group_not_found` |
| DELETE | `/api/terminals/{id}?force=false` | 200 | Closing `TerminalRecord`; the session is then removed from `GET /api/terminals`; 404 `terminal_not_found`; 409 `terminal_busy` unless `force=true`, or `terminal_close_failed` if the OS denies termination |

A shell terminal (`POST /api/terminals` without `command`, or `/run`) receives
the workspace startup command as its first input, followed by the run body as
`startup && {\n<body>\n}` in a single write. The write waits for the shell's
first output, falling back to two seconds, so a slow `.bashrc` cannot swallow
it. Command terminals (`command`) never receive saved input.

Read-only requests are safe to retry. `POST /api/terminals` is not idempotent.

`/api/env` example response:

```json
{
  "distro": "jazzy",
  "domain_id": 7,
  "rmw": null,
  "workspace": "/ws",
  "ros_version": "2",
  "app_version": "0.1.0"
}
```

## 5. WebSocket `/ws`

Connect to `ws://127.0.0.1:8000/ws?token=<token>` with an allowed `Origin`.
The server closes with code `1008` before accepting if the token or origin is
invalid.

### Client message: subscribe

```json
{ "type": "subscribe", "channels": ["graph", "plugins", "terminals"] }
```

- A subscribe message may be sent more than once; channels accumulate.
- If any requested channel is unknown, nothing is subscribed and the server
  replies:
  ```json
  { "type": "error", "data": { "code": "unknown_channel", "message": "Unknown channel: foo" } }
  ```
- A `terminal:<id>` channel can only be joined with `terminal.attach`; direct
  subscription returns `terminal_attach_required`.

### Client messages: terminal control

```json
{ "type": "terminal.attach", "data": { "id": "t_0123456789abcdef", "after_sequence": 12 } }
{ "type": "terminal.detach", "data": { "id": "t_0123456789abcdef" } }
{ "type": "terminal.input", "data": { "id": "t_0123456789abcdef", "data": "aGVsbG8=" } }
{ "type": "terminal.resize", "data": { "id": "t_0123456789abcdef", "cols": 120, "rows": 40 } }
```

Attach sends the current `terminal.state`, then replays retained output whose
sequence is greater than `after_sequence`, and subscribes the client to live
output. Detach unsubscribes output without stopping the PTY. Input is strict
base64; resize dimensions must be integers from 1 through 1000. Terminal
control is accepted only after attachment. Errors use the standard `error`
message with codes including `terminal_not_found`, `terminal_not_attached`,
`terminal_not_running`, `invalid_terminal_payload`, and `terminal_io_error`.
Other unsupported message types receive `unsupported_message`.

### Server messages

Every server message has `{ "type": string, "data": object }`.

| `type` | Channel | `data` |
| --- | --- | --- |
| `graph.update` | `graph` | `GraphSnapshot` |
| `ros.status` | `graph` | `{"connected": bool, "error": string \| null}` |
| `plugin.state` | `plugins` | `PluginRecord` |
| `terminal.state` | `terminals` or `terminal:<id>` | `TerminalRecord` |
| `terminal.output` | `terminal:<id>` | `{"id": string, "sequence": integer, "data": base64 string}` |
| `terminal.removed` | `terminals` or `terminal:<id>` | `{"id": string}`; sent when a terminal session is closed |
| `error` | any | `{"code": string, "message": string}` |

### Channels and initial backfill

| Channel | Forwards | Initial messages on subscribe |
| --- | --- | --- |
| `graph` | `graph.update`, `ros.status` | Current snapshot (if any) and current ROS status |
| `plugins` | `plugin.state` | One `plugin.state` per known plugin |
| `terminals` | `terminal.state`, `terminal.removed` | One `terminal.state` per known terminal |
| `terminal:<id>` | `terminal.output`, `terminal.state`, `terminal.removed` | Joined by `terminal.attach`; output newer than the requested sequence |
| `test` | test channel only | Registered by tests, never in production |

Terminal and plugin events are only sent to clients subscribed to their channel.
Feature files own their channels: `02-ros-discovery` registers `graph`;
`04-plugins` registers `plugins`; `09-terminals` registers `terminals` and
`terminal:<id>`.

Terminal output sequence numbers increase per session. A transient frontend
disconnect does not stop the PTY; reconnecting clients attach and replay from
their last received sequence.

## 6. SPA serving

The backend serves the compiled frontend at `/`. Unknown paths that do not start
with `/api` or `/ws` return `index.html` so client-side routing works. Unknown
`/api/*` paths return the error envelope with `404 not_found`. When the frontend
has not been built, `/` returns `404` with code `frontend_not_built`.

## 7. Backend extension points

Feature modules must not rewrite `app.py`. They receive the shared `Services`
object and wire themselves in before calling `create_app(services)`:

```python
from cotton.app import create_app
from cotton.channels import Channel
from cotton.services import Services

services.routers.append(my_router)  # FastAPI APIRouter from the feature module
services.channels.register(         # one Channel per WebSocket subscription unit
    Channel("graph", matches=lambda event: event.type in {"graph.update", "ros.status"})
)
services.startup.append(watcher.start)    # async hooks run inside the lifespan
services.shutdown.append(watcher.stop)
app = create_app(services)
```

`Services` fields: `env: EnvironmentInfo`, `ros: RosThread`, `bus: EventBus`,
`auth: Auth`, `db: Database`, `channels: ChannelRegistry`,
`routers: list[APIRouter]`, `spa_dir: Path | None`,
`startup: list[Callable[[], Awaitable[None]]]`,
`shutdown: list[Callable[[], Awaitable[None]]]`.

Every router appended to `Services.routers` is mounted with the `require_auth`
dependency, so feature routes under `/api` require `Authorization: Bearer`
without adding it route by route. `/api/health` is the only unauthenticated API
route. Register routes under `/api` in your own `APIRouter`; do not add routes
directly to `app.py`.

`create_app(services: Services) -> FastAPI` installs the error handlers, CORS,
core routes (`/api/health`, `/api/env`, `/ws`), feature routers, and the SPA
mount. The lifespan starts `RosThread`, runs `startup` hooks, then migrates the
database; on shutdown it runs `shutdown` hooks in reverse order, stops
`RosThread` and closes the database.
