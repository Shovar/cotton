# ROS Studio API contract

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
| 404 | `process_not_found` | Unknown process id |
| 404 | `plugin_not_found` | Unknown plugin name |
| 409 | `process_conflict` | Process id already active |
| 409 | `param_not_settable` | Parameter is read-only or rejected by the node |
| 409 | `profile_start_failed` | A profile process failed; already started processes were stopped |
| 409 | `plugin_error` | Plugin activation or healthcheck failed |
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
sorted. The app's own node (`/ros_studio_<pid>`) is never included.
`revision` increases only when the snapshot changes.

### ProcessSpec

```json
{
  "id": "p_1a2b3c4d",
  "argv": ["ros2", "launch", "demo_nodes_cpp", "talker_listener.launch.py"],
  "cwd": null,
  "env": {},
  "plugin": null,
  "autostart": false
}
```

`argv` is always a list. A string `command` is converted with `shlex.split` at
the API boundary; nothing is ever passed to a shell.

### ProcessRecord

```json
{
  "id": "p_1a2b3c4d",
  "spec": { "id": "p_1a2b3c4d", "argv": ["sleep", "30"], "cwd": null, "env": {}, "plugin": null, "autostart": false },
  "state": "running",
  "pid": 4242,
  "pgid": 4242,
  "started_at": "2026-11-06T12:00:00Z",
  "exit_code": null,
  "error": null,
  "recovered": false
}
```

`state` is one of `starting`, `running`, `stopping`, `exited`, `failed`.
A recovered process is alive after a backend restart and has `recovered: true`.

### LogLine

```json
{
  "id": "p_1a2b3c4d",
  "stream": "stdout",
  "level": "warn",
  "ts": "2026-11-06T12:00:00Z",
  "text": "[WARN] [talker]: slow"
}
```

`stream` is `stdout` or `stderr`. `level` is `debug`, `info`, `warn`, `error`
or `null` when the line has no ROS level prefix. `id` is the process id.

### RateResult

```json
{ "available": true, "hz": 62.1, "window_s": 2.0, "reason": null }
```

When unavailable: `{"available": false, "hz": null, "window_s": 2.0, "reason": "no_publishers"}`.
Known reasons: `no_publishers`, `type_unavailable`.

### Profile

```json
{
  "id": "sim",
  "name": "Simulation",
  "processes": [
    { "id": "a", "argv": ["sleep", "1"], "cwd": null, "env": {}, "plugin": null, "autostart": false }
  ]
}
```

### PluginRecord

```json
{
  "name": "foxglove",
  "state": "active",
  "error": null,
  "manifest": { "name": "foxglove", "version": "0.1.0", "description": "...", "processes": [], "panels": [], "permissions": [] }
}
```

`state` is one of `discovered`, `active`, `stopped`, `error`.

## 4. REST endpoints

All endpoints below require `Authorization: Bearer <token>` unless marked
otherwise.

| Method | Path | Success | Body / notes |
| --- | --- | --- | --- |
| GET | `/api/health` | 200 | No auth. `{"status":"ok"}` |
| GET | `/api/env` | 200 | `EnvironmentInfo` |
| GET | `/api/graph` | 200 | Current `GraphSnapshot`; empty snapshot before the first poll |
| GET | `/api/nodes/{node_name:path}/params` | 200 | `{ "<param>": <value> }`; 404 `node_not_found` |
| PUT | `/api/nodes/{node_name:path}/params/{param}` | 204 | Body `{"value": <value>}`; 404 `node_not_found`; 409 `param_not_settable`; 422 `validation_error` |
| GET | `/api/topics/{topic:path}/rate?window_s=2.0` | 200 | `RateResult`; 404 `topic_not_found`; `window_s` is clamped to `[0.5, 5.0]` |
| GET | `/api/processes` | 200 | `ProcessRecord[]` |
| POST | `/api/processes` | 201 | Body `{"id"?: string, "command": string \| string[], "args"?: string[], "cwd"?: string, "env"?: object}`; string command is `shlex.split`; 409 `process_conflict` |
| DELETE | `/api/processes/{id}` | 200 | Stopped `ProcessRecord`; 404 `process_not_found` |
| POST | `/api/processes/{id}/restart` | 200 | Restarted `ProcessRecord`; 404 `process_not_found`; 409 `process_conflict` |
| GET | `/api/processes/{id}/logs?lines=200` | 200 | `LogLine[]`, newest last; `lines` clamped to `[1, 2000]`; 404 `process_not_found` |
| GET | `/api/profiles` | 200 | `Profile[]` |
| POST | `/api/profiles` | 201 | `Profile` body; 422 `validation_error` |
| PUT | `/api/profiles/{id}` | 200 | `Profile` body; 404 `not_found`; 422 `validation_error` |
| DELETE | `/api/profiles/{id}` | 204 | 404 `not_found` |
| POST | `/api/profiles/{id}/start` | 200 | Started `ProcessRecord[]` in listed order; 404 `not_found`; 409 `profile_start_failed` |
| GET | `/api/plugins` | 200 | `PluginRecord[]` |
| POST | `/api/plugins/{name}/activate` | 200 | `PluginRecord`; 404 `plugin_not_found`; 409 `plugin_error` |
| DELETE | `/api/plugins/{name}/activate` | 200 | Stopped `PluginRecord`; 404 `plugin_not_found` |

Read-only requests are safe to retry. `POST /api/processes` and
`POST /api/profiles/{id}/start` are not idempotent.

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
{ "type": "subscribe", "channels": ["graph", "processes", "logs:p_1a2b3c4d"] }
```

- A subscribe message may be sent more than once; channels accumulate.
- If any requested channel is unknown, nothing is subscribed and the server
  replies:
  ```json
  { "type": "error", "data": { "code": "unknown_channel", "message": "Unknown channel: foo" } }
  ```
- Other message types receive `{"type":"error","data":{"code":"unsupported_message","message":"..."}}`.

### Server messages

Every server message has `{ "type": string, "data": object }`.

| `type` | Channel | `data` |
| --- | --- | --- |
| `graph.update` | `graph` | `GraphSnapshot` |
| `ros.status` | `graph` | `{"connected": bool, "error": string \| null}` |
| `process.state` | `processes` | `ProcessRecord` |
| `process.log` | `logs:<id>` | `LogLine` |
| `plugin.state` | `plugins` | `PluginRecord` |
| `error` | any | `{"code": string, "message": string}` |

### Channels and initial backfill

| Channel | Forwards | Initial messages on subscribe |
| --- | --- | --- |
| `graph` | `graph.update`, `ros.status` | Current snapshot (if any) and current ROS status |
| `processes` | `process.state` | One `process.state` per known process |
| `logs:<id>` | `process.log` events whose `data.id` equals `<id>` | Last 200 log lines for that process |
| `plugins` | `plugin.state` | One `plugin.state` per known plugin |
| `test` | test channel only | Registered by tests, never in production |

Log events for processes the client has not subscribed to are never sent.
Feature files own their channels: `02-ros-discovery` registers `graph`;
`03-processes` registers `processes` and `logs:<id>`; `04-plugins` registers
`plugins`.

## 6. SPA serving

The backend serves the compiled frontend at `/`. Unknown paths that do not start
with `/api` or `/ws` return `index.html` so client-side routing works. Unknown
`/api/*` paths return the error envelope with `404 not_found`. When the frontend
has not been built, `/` returns `404` with code `frontend_not_built`.

## 7. Backend extension points

Feature modules must not rewrite `app.py`. They receive the shared `Services`
object and wire themselves in before calling `create_app(services)`:

```python
from ros_studio.app import create_app
from ros_studio.channels import Channel
from ros_studio.services import Services

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
