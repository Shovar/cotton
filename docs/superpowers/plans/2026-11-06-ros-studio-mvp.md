# ROS Studio MVP — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el MVP de ROS Studio: una web local instalada dentro del entorno ROS 2 del usuario que muestra el grafo, gestiona procesos de launch con logs en vivo y embebe Lichtblick mediante un plugin.

**Architecture:** Un único proceso Python con FastAPI/uvicorn y un hilo dueño de `rclpy`; la UI React se compila y se sirve desde el backend. Los procesos hijos se lanzan con `asyncio` y `setsid`, y los plugins se declaran con `plugin.yaml`.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic 2, uvicorn, `rclpy`, SQLite, pytest; React 19, TypeScript, Vite, dockview, TanStack Query, Zustand, Vitest, Playwright; Docker para integración.

**Spec:** [`docs/superpowers/specs/2026-11-06-ros-studio-design.md`](../specs/2026-11-06-ros-studio-design.md)

## Global Constraints

- Python `>=3.10`, Node `>=20`, ROS 2 Humble y Jazzy; macOS solo como entorno de desarrollo.
- `rclpy` **no** se declara en `pyproject.toml`; se importa en runtime y se comprueba al arrancar.
- Todo el backend escucha en `127.0.0.1:8000` por defecto; el puente de Foxglove usa `8765`.
- Un solo worker de uvicorn. Un solo hilo ROS; ninguna llamada a `rclpy` fuera de él.
- Sondeo del grafo cada `1.0 s`; refresco visible en `<2 s`; CPU en reposo `<5 %` con 100 topics.
- Buffer de logs de `2000` líneas por proceso; fichero rotado a `5 MB` con `3` copias.
- Parada ordenada: `SIGINT` al grupo → `5 s` → `SIGTERM` → `3 s` → `SIGKILL`.
- Token de sesión de 32 bytes; `Authorization: Bearer` en REST y `?token=` en `/ws`; validación de `Origin`.
- REST bajo `/api`; WebSocket único en `/ws`; errores `{"code": string, "message": string}`.
- Paquete `ros-studio`, licencia Apache-2.0. Frontend compilado dentro del wheel.
- Sin perfiles de entorno, sin prefijo de comando y sin agente de descubrimiento.
- Commits convencionales (`feat:`, `test:`, `chore:`), uno por tarea como mínimo.

## Review Focus

Estos son los cinco fallos que más probablemente sufrirá quien use el programa. Cada uno tiene su test en la tarea que lo posee:

1. **Comando inexistente o que muere al instante:** la UI debe mostrarlo en rojo con código de salida y stderr, nunca dejarlo en «arrancando». (Task 15)
2. **Topic o nodo sin editores ni suscriptores:** debe listarse igualmente y el detalle no puede romperse con listas vacías. (Tasks 7 y 12)
3. **Backend muerto con `kill -9` y procesos vivos:** al reabrir, hay que marcarlos como huérfanos recuperables y poder pararlos, sin duplicar el arranque. (Task 16)
4. **Nodo que desaparece durante una consulta de parámetros o frecuencia:** la API responde `404`/`409` con mensaje claro y no se cuelga. (Tasks 9 y 10)
5. **Dos pestañas o reconexión del WebSocket:** al suscribirse hay que reenviar estado, procesos y últimas líneas de log, sin duplicar ni perder nada. (Tasks 8 y 17)

---

## Etapa 0 — Prototipo de riesgo (semana 1)

### Task 1: Base del repositorio y calidad

**Files:**
- Create: `.gitignore`, `LICENSE`, `README.md`, `pyproject.toml`
- Create: `backend/src/ros_studio/__init__.py`
- Create: `backend/tests/test_package.py`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: paquete importable `ros_studio` con `__version__ = "0.1.0"`; comandos `pytest`, `ruff`, `mypy` funcionando desde la raíz.

- [ ] **Step 1: Inicializar el repositorio y el esqueleto**

```bash
git init -b main
mkdir -p backend/src/ros_studio backend/tests docs/superpowers .github/workflows
```

Crear `pyproject.toml` con hatchling, `name = "ros-studio"`, `requires-python = ">=3.10"`, dependencias `fastapi>=0.115`, `uvicorn[standard]>=0.30`, `pydantic>=2.8`, `PyYAML>=6.0`, `platformdirs>=4.2`; extra `dev` con `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy`, `build`; `[tool.hatch.build.targets.wheel] packages = ["backend/src/ros_studio"]`; `testpaths = ["backend/tests"]`, `asyncio_mode = "auto"` y el marcador `integration`. En mypy, `ignore_missing_imports` para `rclpy.*`, `rcl_interfaces.*` y `rosidl_runtime_py.*`, que solo existen dentro del entorno ROS.

`backend/src/ros_studio/__init__.py` solo contiene `__version__ = "0.1.0"`.

`.gitignore`: `.venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `dist/`, `frontend/node_modules/`, `frontend/dist/`, `backend/src/ros_studio/web/`, `*.db`, `.env`.

`LICENSE`: texto Apache-2.0 completo.

- [ ] **Step 2: Escribir el test del paquete**

```python
from ros_studio import __version__


def test_version() -> None:
    assert __version__ == "0.1.0"
```

- [ ] **Step 3: Instalar en editable y verificar que el test falla o no colecta**

Run: `python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]" && pytest backend/tests/test_package.py -v`
Expected: FAIL si el paquete aún no está en `sys.path` o PASS tras la instalación editable; el objetivo es que la instalación funcione.

- [ ] **Step 4: Añadir CI y verificar la suite**

`.github/workflows/ci.yml` en `ubuntu-latest`, matrix Python `3.10` y `3.12`, pasos: checkout, setup-python, `pip install -e ".[dev]"`, `ruff check backend`, `mypy backend/src`, `pytest -m "not integration"`.

Run: `ruff check backend && mypy backend/src && pytest -m "not integration" -v`
Expected: todo PASS.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml .gitignore LICENSE README.md backend .github
git commit -m "chore: bootstrap ros-studio repository"
```

---

### Task 2: Spike del grafo (coste del sondeo)

**Files:**
- Create: `spikes/graph_probe.py`
- Create: `docs/etapa-0-mediciones.md`

**Interfaces:**
- Produces: medición reproducible de `get_node_names_and_namespaces`, `get_topic_names_and_types` y `get_publishers_info_by_topic` con 100 topics, y una decisión go/no-go anotada.

- [ ] **Step 1: Escribir el probe**

`spikes/graph_probe.py`: crea un nodo `rclpy`, publica `std_msgs/msg/String` en `probe/topic_000`…`probe/topic_099`, gira el executor en un hilo y durante 20 s repite el mismo trabajo que hará `RclpyGraphSource.snapshot()`; imprime JSON con `poll_ms_p50`, `poll_ms_p95`, `poll_ms_max`, `cpu_percent` (usando `time.process_time()`), `topic_count` y `ros_distro`.

Sin ROS disponible debe salir con un mensaje que explique activar el entorno (`pixi shell`, `source /opt/ros/.../setup.bash`).

- [ ] **Step 2: Ejecutarlo en un entorno ROS real**

Run: `python spikes/graph_probe.py --topics 100`
Expected: JSON con los campos anteriores y `topic_count: 100`.

- [ ] **Step 3: Anotar el resultado y decidir**

Crear `docs/etapa-0-mediciones.md` con una tabla: máquina, distro, RMW, `poll_ms_p50`, `poll_ms_p95`, `cpu_percent`. Añadir la decisión: si `cpu_percent < 5` y `poll_ms_p95 < 200`, el sondeo cada 1 s es válido; si no, anotar el intervalo o la consulta perezosa que sí cumple.

- [ ] **Step 4: Repetir con Cyclone DDS si está disponible**

Run: `RMW_IMPLEMENTATION=rmw_cyclonedds_cpp python spikes/graph_probe.py --topics 100`
Expected: segunda fila en la tabla, o una nota de que Cyclone no está instalado.

- [ ] **Step 5: Commit**

```bash
git add spikes/graph_probe.py docs/etapa-0-mediciones.md
git commit -m "spike: measure ros graph polling cost"
```

---

### Task 3: Spike de procesos (señales y huérfanos)

**Files:**
- Create: `spikes/signals_probe.py`
- Modify: `docs/etapa-0-mediciones.md`

**Interfaces:**
- Produces: evidencia de que `start_new_session=True` más la escalada `SIGINT → SIGTERM → SIGKILL` mata también a los nietos, y de cómo detectar un huérfano tras un `kill -9`.

- [ ] **Step 1: Escribir el probe**

`spikes/signals_probe.py` con dos escenarios:

1. Lanza un hijo con `start_new_session=True` que a su vez lanza un nieto `sleep 60`; envía `SIGINT` al grupo, espera 1 s, comprueba con `os.killpg(pgid, 0)`; si sigue vivo, `SIGTERM`; si sigue, `SIGKILL`. Imprime qué señal hizo falta y si el grupo quedó vacío.
2. Escribe un registro JSON con `pid`/`pgid`, mata el proceso padre con `SIGKILL` y, desde un proceso nuevo, comprueba si el nieto sigue vivo y si se puede parar con `killpg`.

- [ ] **Step 2: Ejecutarlo y leer la salida**

Run: `python spikes/signals_probe.py`
Expected: `orphans_after_sigint`, `orphans_after_sigterm`, `group_empty` y la conclusión del escenario 2.

- [ ] **Step 3: Ajustar la escalada a los datos**

Anotar en `docs/etapa-0-mediciones.md` si 5 s de gracia para `SIGINT` y 3 s para `SIGTERM` son suficientes, o el valor medido.

- [ ] **Step 4: Comprobar el caso de un proceso que ignora SIGINT**

Añadir al probe un hijo que capture `SIGINT` y siga vivo; verificar que la escalada termina en `SIGKILL` y deja el grupo vacío. Ejecutar de nuevo.

- [ ] **Step 5: Commit**

```bash
git add spikes/signals_probe.py docs/etapa-0-mediciones.md
git commit -m "spike: validate process group shutdown and orphan detection"
```

---

### Task 4: Spike de Lichtblick y empaquetado

**Files:**
- Create: `spikes/lichtblick_probe.md`
- Modify: `docs/etapa-0-mediciones.md`

**Interfaces:**
- Produces: versión fijada de Lichtblick, licencia vigente, tamaño del build web, formato de URL del panel y decisión vendorizar vs descargar; validación de las dos vías de instalación.

- [ ] **Step 1: Medir el build y la licencia**

Clonar la release estable elegida de Lichtblick, compilar su web (`npm ci && npm run build`) y anotar en `docs/etapa-0-mediciones.md`: versión/tag, licencia del `LICENSE`, `du -sh` del directorio de build, y si el login o la nube son necesarios para abrirlo en local.

- [ ] **Step 2: Verificar la URL del panel**

Servir el build con `python -m http.server 8080`, arrancar `ros2 launch foxglove_bridge foxglove_bridge_launch.xml port:=8765` y abrir `http://127.0.0.1:8080/?ds=foxglove-websocket&ds.url=ws://127.0.0.1:8765`. Anotar la URL exacta que conecta y si el host se puede dejar relativo (`{hostname}`). Probar además si Lichtblick carga un layout por URL (`?layout=...`) y con qué formato, porque el criterio de la fase 3 exige ver un topic sin configurar nada a mano.

- [ ] **Step 3: Decidir el empaquetado**

Escribir en `docs/etapa-0-mediciones.md` una de las dos decisiones: **vendorizar** el build en el wheel (si `du -sh` es aceptable para PyPI) o **descargar** una release fijada con `sha256` en el primer arranque a la caché. Anotar URL, hash y versión exactos.

- [ ] **Step 4: Validar las instalaciones**

- En un entorno pixi/RoboStack: `pixi add fastapi uvicorn` desde conda-forge, construir el wheel con `python -m build` e instalarlo con `pip install dist/ros_studio-0.1.0-py3-none-any.whl`; comprobar `import rclpy` y `ros-studio --help`.
- En un contenedor Ubuntu 24.04 con ROS por apt: `python3 -m venv --system-site-packages /tmp/rs && /tmp/rs/bin/pip install dist/*.whl`; comprobar `import rclpy`.

Anotar en `docs/etapa-0-mediciones.md` los dos resultados y cualquier ajuste de resolvedor.

- [ ] **Step 5: Commit**

```bash
git add spikes/lichtblick_probe.md docs/etapa-0-mediciones.md
git commit -m "spike: measure lichtblick assets and install paths"
```

---

## Etapa 1 — Grafo (semanas 2–3)

### Task 5: Detección del entorno y `/api/env`

**Files:**
- Create: `backend/src/ros_studio/env.py`
- Create: `backend/src/ros_studio/errors.py`
- Create: `backend/src/ros_studio/api/__init__.py`, `backend/src/ros_studio/api/routes_env.py`
- Create: `backend/src/ros_studio/app.py`, `backend/src/ros_studio/cli.py`, `backend/src/ros_studio/__main__.py`
- Test: `backend/tests/test_env.py`, `backend/tests/test_api_env.py`

**Interfaces:**
- Produces: `EnvironmentInfo(distro: str, domain_id: int, rmw: str | None, workspace: str | None, ros_version: str | None, app_version: str)`; `detect_environment(env: Mapping[str, str] | None = None) -> EnvironmentInfo`; `ensure_ros_environment(env=None) -> EnvironmentInfo`; `RosEnvironmentError`; `create_app(env: EnvironmentInfo) -> FastAPI`; `main(argv: list[str] | None = None) -> int`.

- [ ] **Step 1: Escribir los tests**

```python
import pytest
from ros_studio.env import detect_environment, RosEnvironmentError


def test_detects_environment() -> None:
    info = detect_environment({
        "ROS_DISTRO": "jazzy",
        "ROS_DOMAIN_ID": "7",
        "RMW_IMPLEMENTATION": "rmw_cyclonedds_cpp",
        "COLCON_PREFIX_PATH": "/ws/install",
        "ROS_VERSION": "2",
    })
    assert (info.distro, info.domain_id, info.rmw) == ("jazzy", 7, "rmw_cyclonedds_cpp")
    assert info.workspace == "/ws"


def test_missing_distro_is_actionable() -> None:
    with pytest.raises(RosEnvironmentError, match="ROS_DISTRO"):
        detect_environment({})


def test_invalid_domain_is_rejected() -> None:
    with pytest.raises(RosEnvironmentError, match="ROS_DOMAIN_ID"):
        detect_environment({"ROS_DISTRO": "jazzy", "ROS_DOMAIN_ID": "abc"})
```

Y en `test_api_env.py`:

```python
from fastapi.testclient import TestClient
from ros_studio.app import create_app
from ros_studio.env import EnvironmentInfo


def test_env_endpoint() -> None:
    info = EnvironmentInfo(
        distro="jazzy", domain_id=0, rmw=None, workspace=None,
        ros_version="2", app_version="0.1.0",
    )
    response = TestClient(create_app(info)).get("/api/env")
    assert response.status_code == 200
    assert response.json()["distro"] == "jazzy"
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_env.py backend/tests/test_api_env.py -v`
Expected: FAIL con `ModuleNotFoundError: ros_studio.env`.

- [ ] **Step 3: Implementar**

`env.py` usa `os.environ` por defecto. `workspace` es el padre de la primera entrada de `COLCON_PREFIX_PATH` (o `None`). `domain_id` se parsea a entero y falla con mensaje accionable si no lo es. `ensure_ros_environment` comprueba `ROS_DISTRO`, `AMENT_PREFIX_PATH`, `ros2` en `PATH` y `import rclpy`, y lanza `RosEnvironmentError` con el comando de activación según el caso.

`errors.py` define `ApiError(status, code, message)` y `install_error_handlers(app)` que devuelve `{"code", "message"}`.

`app.py` crea `FastAPI`, instala los handlers y monta el router de `/api/env`.

`cli.py` parsea `--host` (default `127.0.0.1`), `--port` (default `8000`), `--no-browser`; llama a `ensure_ros_environment()` y `uvicorn.run(create_app(info), host=..., port=...)`.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_env.py backend/tests/test_api_env.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio backend/tests
git commit -m "feat: detect ros environment and expose /api/env"
```

---

### Task 6: Hilo ROS y cola de comandos

**Files:**
- Create: `backend/src/ros_studio/ros/__init__.py`, `backend/src/ros_studio/ros/thread.py`
- Test: `backend/tests/test_ros_thread.py`, `backend/tests/integration/test_ros_thread_ros.py`

**Interfaces:**
- Produces: `RosThread(node_name: str = "ros_studio", poll_interval: float = 0.05)` con `start() -> None`, `stop() -> None`, `async call(fn: Callable[..., T], *args: Any, timeout: float = 5.0) -> T`; excepciones `RosCallTimeout`, `RosCallError`; métodos protegidos `_setup()`, `_spin_once(timeout)`, `_teardown()` para tests.
- Consumes: nada.

- [ ] **Step 1: Escribir el test unitario con un doble**

```python
import asyncio
import time
import pytest
from ros_studio.ros.thread import RosThread, RosCallTimeout


class FakeRosThread(RosThread):
    def _setup(self) -> None:
        self.node = object()

    def _spin_once(self, timeout: float) -> None:
        time.sleep(timeout)

    def _teardown(self) -> None:
        pass


async def test_call_returns_result() -> None:
    thread = FakeRosThread(poll_interval=0.01)
    thread.start()
    try:
        assert await thread.call(lambda value: value + 1, 1) == 2
    finally:
        thread.stop()


async def test_call_times_out() -> None:
    thread = FakeRosThread(poll_interval=0.01)
    thread.start()
    try:
        with pytest.raises(RosCallTimeout):
            await thread.call(lambda: time.sleep(1), timeout=0.05)
    finally:
        thread.stop()
```

`backend/tests/integration/test_ros_thread_ros.py` con `pytestmark = pytest.mark.integration`: arranca un `RosThread` real, llama a `lambda: 2 + 2`, comprueba `4` y que `stop()` no deja hilos.

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_ros_thread.py -v`
Expected: FAIL porque el módulo no existe.

- [ ] **Step 3: Implementar**

`RosThread` importa `rclpy` dentro de `_setup()`. El hilo ejecuta un bucle `_spin_once` + vaciado no bloqueante de una `queue.Queue` de trabajos. `call()` encola `(fn, args, concurrent.futures.Future)` y hace `await asyncio.wait_for(asyncio.wrap_future(future), timeout)`; al expirar lanza `RosCallTimeout` y deja el trabajo terminar. `start()` es idempotente; `stop()` espera al hilo y llama a `_teardown()`.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_ros_thread.py -v && ruff check backend && mypy backend/src`
Expected: PASS. El test de integración se ejecuta en Docker más adelante.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio/ros backend/tests
git commit -m "feat: add single-owner ros thread with command queue"
```

---

### Task 7: `GraphSource` con `rclpy`

**Files:**
- Create: `backend/src/ros_studio/ros/models.py`, `backend/src/ros_studio/ros/graph.py`
- Test: `backend/tests/test_graph.py`

**Interfaces:**
- Produces: `NodeInfo(name, namespace, publishers, subscribers, services, actions)`, `TopicInfo(name, types, publishers, subscribers)`, `GraphSnapshot(nodes, topics, services, actions, revision)`; protocolo `GraphSource` con `snapshot() -> GraphSnapshot`; `RclpyGraphSource(node: NodeLike, self_node_name: str)`.
- Consumes: `RosThread` (Task 6) para ejecutar `snapshot()`.

- [ ] **Step 1: Escribir el test con un nodo falso**

```python
from dataclasses import dataclass
from ros_studio.ros.graph import RclpyGraphSource


@dataclass
class Endpoint:
    node_name: str
    node_namespace: str
    topic_type: str


class FakeNode:
    def get_node_names_and_namespaces(self):
        return [("talker", "/"), ("listener", "/"), ("ros_studio_1", "/")]

    def get_topic_names_and_types(self):
        return [("/chatter", ["std_msgs/msg/String"])]

    def get_service_names_and_types(self):
        return [("/talker/get_parameters", ["rcl_interfaces/srv/GetParameters"])]

    def get_action_names_and_types(self):
        return []

    def get_publishers_info_by_topic(self, topic):
        return [Endpoint("talker", "/", "std_msgs/msg/String")]

    def get_subscriptions_info_by_topic(self, topic):
        return [Endpoint("listener", "/", "std_msgs/msg/String")]


def test_snapshot_excludes_self_and_inverts_endpoints() -> None:
    source = RclpyGraphSource(FakeNode(), self_node_name="/ros_studio_1")
    graph = source.snapshot()
    assert [node.name for node in graph.nodes] == ["/listener", "/talker"]
    assert graph.topics[0].name == "/chatter"
    assert graph.topics[0].publishers == ["/talker"]
    assert graph.topics[0].subscribers == ["/listener"]
    assert graph.services["/talker/get_parameters"] == ["rcl_interfaces/srv/GetParameters"]


def test_topic_without_endpoints_is_listed() -> None:
    class EmptyNode(FakeNode):
        def get_publishers_info_by_topic(self, topic):
            return []

        def get_subscriptions_info_by_topic(self, topic):
            return []

    graph = RclpyGraphSource(EmptyNode(), self_node_name="/ros_studio_1").snapshot()
    assert graph.topics[0].publishers == []
    assert graph.topics[0].subscribers == []
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_graph.py -v`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

`models.py` con modelos Pydantic. `graph.py`: `NodeLike` como `Protocol` (sin importar `rclpy` en el módulo); `RclpyGraphSource.snapshot()` construye nombres completos `/ns/name`, excluye el nodo propio, invierte editores/suscriptores por topic, asigna servicios y acciones por prefijo de nodo y devuelve listas ordenadas. `revision` empieza en 0 y lo incrementa el watcher (Task 8).

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_graph.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio/ros backend/tests/test_graph.py
git commit -m "feat: add rclpy graph source and models"
```

---

### Task 8: Bus de eventos, watcher y WebSocket `/ws`

**Files:**
- Create: `backend/src/ros_studio/events.py`, `backend/src/ros_studio/ros/watcher.py`
- Create: `backend/src/ros_studio/api/ws.py`, `backend/src/ros_studio/api/routes_graph.py`
- Modify: `backend/src/ros_studio/app.py`, `backend/src/ros_studio/cli.py`
- Test: `backend/tests/test_events.py`, `backend/tests/test_watcher.py`, `backend/tests/test_ws_graph.py`

**Interfaces:**
- Produces: `Event(type: str, data: dict)`; `EventBus.subscribe() -> asyncio.Queue[Event]`, `unsubscribe(queue)`, `async publish(type, data)`; `GraphWatcher(ros, source, bus, interval=1.0)` con `async run()`, `async stop()`, `current() -> GraphSnapshot | None`, `current_status() -> dict`; `create_app(services: Services) -> FastAPI` con `Services(env, ros, graph, watcher, bus)`; `GET /api/graph`; `/ws` con mensajes `{"type": "subscribe", "channels": ["graph", "ros.status"]}`, eventos `{"type": "graph.update", "data": GraphSnapshot}` y `{"type": "ros.status", "data": {"connected": bool, "error": str | None}}`.
- Consumes: `RosThread`, `RclpyGraphSource`.

- [ ] **Step 1: Escribir los tests**

```python
async def test_bus_fans_out() -> None:
    bus = EventBus()
    first, second = bus.subscribe(), bus.subscribe()
    await bus.publish("graph.update", {"revision": 1})
    assert (await first.get()).data == {"revision": 1}
    assert (await second.get()).type == "graph.update"


async def test_watcher_emits_only_on_change() -> None:
    class Source:
        def __init__(self): self.calls = 0
        def snapshot(self):
            self.calls += 1
            return GraphSnapshot(nodes=[], topics=[], services={}, actions={}, revision=self.calls // 3)

    class Ros:
        async def call(self, fn, *args, timeout=5.0): return fn(*args)

    bus = EventBus()
    queue = bus.subscribe()
    watcher = GraphWatcher(Ros(), Source(), bus, interval=0.01)
    task = asyncio.create_task(watcher.run())
    await asyncio.sleep(0.05)
    await watcher.stop()
    task.cancel()
    events = [queue.get_nowait() for _ in range(queue.qsize())]
    assert events and all(event.type == "graph.update" for event in events)


async def test_watcher_reports_ros_disconnection() -> None:
    class FailingRos:
        async def call(self, fn, *args, timeout=5.0):
            raise RosCallError("dds down")

    bus = EventBus()
    queue = bus.subscribe()
    watcher = GraphWatcher(FailingRos(), object(), bus, interval=0.01)
    task = asyncio.create_task(watcher.run())
    event = await asyncio.wait_for(queue.get(), timeout=0.5)
    await watcher.stop()
    task.cancel()
    assert event.type == "ros.status"
    assert event.data == {"connected": False, "error": "dds down"}
```

Y el test del WebSocket:

```python
def test_ws_sends_current_snapshot(services) -> None:
    with TestClient(create_app(services)).websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "channels": ["graph"]})
        message = ws.receive_json()
        assert message["type"] == "graph.update"
        assert message["data"]["revision"] == 0
```

`services` es un fixture que construye `Services` con un `StubWatcher` que devuelve un snapshot vacío.

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_events.py backend/tests/test_watcher.py backend/tests/test_ws_graph.py -v`
Expected: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar**

`EventBus` mantiene un `set` de colas y publica sin bloquear. `GraphWatcher` obtiene el snapshot con `await ros.call(source.snapshot)`, lo compara con `model_dump_json()` y publica `graph.update` solo si cambió; `current()` devuelve el último. Si la llamada lanza, publica `ros.status` con `connected=False` y el mensaje, y reintenta con espera creciente `1, 2, 4, 8, 16, 30` s; al recuperarse publica `connected=True` y vuelve al intervalo normal. `current_status()` devuelve el último estado. El router del grafo devuelve `watcher.current()` o un snapshot vacío. `/ws` autentica más adelante (Task 13); por ahora acepta, procesa `subscribe`, mantiene un canal por cliente y envía el snapshot y el estado actual al suscribirse. Un cliente con `channels` desconocidos recibe `{"type": "error", "data": {"code": "unknown_channel"}}`.

`app.py` usa un `lifespan` que arranca el watcher y lo para al cerrar; `cli.py` construye los servicios reales.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_events.py backend/tests/test_watcher.py backend/tests/test_ws_graph.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio backend/tests
git commit -m "feat: stream graph snapshots over websocket"
```

---

### Task 9: Parámetros remotos

**Files:**
- Create: `backend/src/ros_studio/ros/params.py`
- Create: `backend/src/ros_studio/api/routes_params.py`
- Modify: `backend/src/ros_studio/app.py`
- Test: `backend/tests/test_params.py`, `backend/tests/test_api_params.py`

**Interfaces:**
- Produces: `coerce_value(current: Any, new: Any) -> tuple[str, Any]` con tipos `"bool"`, `"integer"`, `"double"`, `"string"`, `"byte_array"`, `"bool_array"`, `"integer_array"`, `"double_array"`, `"string_array"`; `RemoteParams(node)` con `get_all(node_name: str, timeout: float = 5.0) -> dict[str, Any]` y `set(node_name: str, name: str, value: Any, timeout: float = 5.0) -> None`; `GET /api/nodes/{node_name:path}/params`, `PUT /api/nodes/{node_name:path}/params/{param}` con cuerpo `{"value": ...}`.
- Consumes: `RosThread`, `NodeLike`.

- [ ] **Step 1: Escribir los tests**

```python
import pytest
from ros_studio.ros.params import coerce_value


@pytest.mark.parametrize("current,new,expected", [
    (True, False, ("bool", False)),
    (3, 4, ("integer", 4)),
    (1.5, 2, ("double", 2.0)),
    ("a", "b", ("string", "b")),
    ([1, 2], [3], ("integer_array", [3])),
])
def test_coerce_keeps_declared_type(current, new, expected):
    assert coerce_value(current, new) == expected


def test_coerce_rejects_incompatible_value():
    with pytest.raises(ValueError, match="bool"):
        coerce_value(True, "no")
```

Y el test de API con un `RemoteParams` falso inyectado: `GET` devuelve `{"speed": 1.5}`; `PUT` responde `204`; un nodo desconocido lanza `RosCallError` y la API responde `404` con `{"code": "node_not_found"}`.

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_params.py backend/tests/test_api_params.py -v`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

`coerce_value` convierte el valor nuevo al tipo del actual y falla con un mensaje que nombra el tipo esperado. `RemoteParams` crea clientes `GetParameters`/`SetParameters` por nodo y usa `rclpy.spin_until_future_complete(node, future, timeout_sec=...)` mientras espera: el trabajo corre dentro del hilo ROS, que en ese momento no está girando, así que sin ese giro anidado la respuesta nunca llegaría. Traduce `rclpy` a `RosCallError("node_not_found")` o `RosCallError("param_not_settable")`. La API ejecuta las llamadas con `await ros.call(...)`, mapea errores y valida que el nombre del nodo empiece por `/`.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_params.py backend/tests/test_api_params.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio backend/tests
git commit -m "feat: read and write remote ros parameters"
```

---

### Task 10: Frecuencia de topic bajo demanda

**Files:**
- Create: `backend/src/ros_studio/ros/rate.py`
- Create: `backend/src/ros_studio/api/routes_topics.py`
- Modify: `backend/src/ros_studio/app.py`
- Test: `backend/tests/test_rate.py`, `backend/tests/test_api_rate.py`

**Interfaces:**
- Produces: `RateResult(available: bool, hz: float | None, window_s: float, reason: str | None)`; `measure_rate(node: NodeLike, topic: str, window_s: float = 2.0) -> RateResult`; `GET /api/topics/{topic:path}/rate` con `{"available": true, "hz": 62.1, "window_s": 2.0, "reason": null}`.
- Consumes: `RosThread`.

- [ ] **Step 1: Escribir los tests**

```python
from ros_studio.ros.rate import compute_hz, RateResult


def test_compute_hz() -> None:
    assert compute_hz(124, 2.0) == 62.0
    assert compute_hz(0, 2.0) == 0.0


def test_no_publishers_is_unavailable() -> None:
    class Node:
        def get_publishers_info_by_topic(self, topic): return []

    result = measure_rate(Node(), "/missing", window_s=0.01)
    assert result == RateResult(available=False, hz=None, window_s=0.01, reason="no_publishers")
```

El test de API comprueba `200` con un medidor falso y `404` con `{"code": "topic_not_found"}`.

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_rate.py backend/tests/test_api_rate.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`measure_rate` obtiene el primer editor, importa el tipo con `rosidl_runtime_py.utilities.get_message` (si falla devuelve `reason="type_unavailable"`), crea un nodo temporal con el QoS del editor, gira ese nodo en bucle durante `window_s` y cuenta mensajes. `compute_hz(count, window_s)` redondea a un decimal. La API ejecuta `measure_rate` con `await ros.call(...)`, traduce topic inexistente a `404` y limita `window_s` a `[0.5, 5.0]`.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_rate.py backend/tests/test_api_rate.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio backend/tests
git commit -m "feat: measure topic rate on demand"
```

---

### Task 11: Shell del frontend

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Create: `frontend/src/api/session.ts`, `frontend/src/api/client.ts`, `frontend/src/api/ws.ts`
- Create: `frontend/src/state/store.ts`, `frontend/src/state/preferences.ts`
- Create: `frontend/src/layout/Workbench.tsx`, `frontend/src/layout/StatusBar.tsx`
- Modify: `backend/src/ros_studio/app.py`
- Test: `frontend/src/api/session.test.ts`, `frontend/src/api/ws.test.ts`, `frontend/src/state/preferences.test.ts`, `frontend/src/layout/StatusBar.test.tsx`, `backend/tests/test_spa.py`

**Interfaces:**
- Produces: `readTokenFromHash(hash: string) -> { token: string | null; hash: string }`; `apiGet<T>(path: string) -> Promise<T>`, `apiSend<T>(method, path, body?) -> Promise<T>`; `WsClient` con `connect()`, `subscribe(channels: string[])`, `onEvent(handler)`, `nextDelay(attempt: number): number`; `useStore` (Zustand) con `env`, `graph`, `processes`, `plugins`, `rosConnected`, `connection`; `loadPreferences()`, `savePreferences({ theme, layout })`, `applyTheme("light" | "dark")`; `mount_spa(app: FastAPI, web_dir: Path | None) -> None` que sirve `index.html` para rutas no-API cuando el build existe.
- Consumes: REST `/api/env`, WS `/ws` (canales `graph`, `ros.status`).

- [ ] **Step 1: Crear el proyecto y los tests**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install && npm install dockview @tanstack/react-query zustand
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

Tests:

```ts
import { describe, expect, it } from "vitest";
import { readTokenFromHash } from "./session";

describe("readTokenFromHash", () => {
  it("extrae el token y limpia el hash", () => {
    expect(readTokenFromHash("#token=abc")).toEqual({ token: "abc", hash: "" });
  });
  it("no inventa token", () => {
    expect(readTokenFromHash("")).toEqual({ token: null, hash: "" });
  });
});

import { nextDelay } from "./ws";

it("backoff exponencial con techo de 30 s", () => {
  expect(nextDelay(0)).toBe(1000);
  expect(nextDelay(5)).toBe(30000);
});
```

```ts
import { applyTheme, loadPreferences, savePreferences } from "./preferences";

it("persiste tema y layout", () => {
  savePreferences({ theme: "dark", layout: { grid: {} } });
  expect(loadPreferences()).toEqual({ theme: "dark", layout: { grid: {} } });
  applyTheme("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
});
```

`StatusBar.test.tsx` renderiza con `env = { distro: "jazzy", domain_id: 0, workspace: "/ws" }` y comprueba que aparecen los tres valores; con `rosConnected={false}` muestra «ROS desconectado».

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient
from ros_studio.app import mount_spa


def test_mount_spa_serves_index_and_falls_back(tmp_path) -> None:
    (tmp_path / "index.html").write_text("<html>ok</html>")
    app = FastAPI()
    mount_spa(app, tmp_path)
    client = TestClient(app)
    assert client.get("/").status_code == 200
    assert client.get("/some/route").status_code == 200
    assert client.get("/api/unknown").status_code == 404
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_spa.py -v && cd frontend && npx vitest run src/api/session.test.ts src/api/ws.test.ts src/state/preferences.test.ts src/layout/StatusBar.test.tsx`
Expected: FAIL, archivos sin implementar.

- [ ] **Step 3: Implementar**

`session.ts` lee `#token=`, guarda el token en `sessionStorage` y devuelve el hash limpio para `history.replaceState`. `client.ts` añade `Authorization: Bearer`, lanza `ApiError(code, message, status)` y usa rutas relativas. `ws.ts` construye `ws://${location.host}/ws?token=...`, se reconecta con `nextDelay`, reenvía las suscripciones al abrir y expone `onEvent`. El store guarda los eventos del WS, incluido `ros.status` en `rosConnected`. `preferences.ts` persiste `theme` y el layout serializado de dockview en `localStorage` (`ros-studio-preferences`) y aplica `data-theme` al elemento raíz. `Workbench` monta una barra de actividad (Grafo, Procesos, Plugins, Ajustes), un `dockview` con paneles vacíos («Grafo», «Procesos», «Plugins», «Ajustes») y restaura/guarda el layout en cada cambio; `StatusBar` muestra distro, dominio, workspace, estado de conexión y accesos de tema claro/oscuro.

`vite.config.ts` proxya `/api` y `/ws` a `http://127.0.0.1:8000` en desarrollo. `mount_spa` sirve `index.html` para `/` y cualquier ruta que no empiece por `/api` ni `/ws`; si no hay build, responde `{"code": "frontend_not_built", "message": "Ejecuta npm run build"}` en `/`. El CLI pasa la ruta del paquete (`ros_studio/web`) o `None`.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_spa.py -v && cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: todo PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend backend/src/ros_studio/app.py backend/tests/test_spa.py
git commit -m "feat: scaffold react workbench with api and ws clients"
```

---

### Task 12: Vista de grafo, detalle de topic y editor de parámetros

**Files:**
- Create: `frontend/src/views/GraphView.tsx`, `frontend/src/views/TopicDetail.tsx`, `frontend/src/views/NodeParams.tsx`
- Modify: `frontend/src/layout/Workbench.tsx`, `frontend/src/state/store.ts`
- Test: `frontend/src/views/GraphView.test.tsx`, `frontend/src/views/NodeParams.test.tsx`

**Interfaces:**
- Produces: `GraphView` que lista nodos/topics con búsqueda y abre `TopicDetail`; `NodeParams` que lista parámetros y guarda con `PUT /api/nodes/{node}/params/{param}`; `TopicDetail` muestra tipo, editores, suscriptores y botón «Medir frecuencia» que llama a `GET /api/topics/{topic}/rate`.
- Consumes: `/api/graph`, `graph.update`, `/api/topics/.../rate`, `/api/nodes/.../params`.

- [ ] **Step 1: Escribir los tests**

```tsx
it("lista topics y filtra por búsqueda", () => {
  seedGraph({ topics: [topic("/chatter"), topic("/odom")] });
  render(<GraphView />);
  expect(screen.getByText("/chatter")).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Buscar"), { target: { value: "odom" } });
  expect(screen.queryByText("/chatter")).not.toBeInTheDocument();
  expect(screen.getByText("/odom")).toBeInTheDocument();
});

it("no se rompe con un topic sin endpoints", () => {
  seedGraph({ topics: [topic("/empty")] });
  render(<TopicDetail topic="/empty" />);
  expect(screen.getByText("Sin editores")).toBeInTheDocument();
});

it("guarda un parámetro con el tipo actual", async () => {
  const send = vi.spyOn(api, "apiSend").mockResolvedValue(undefined);
  render(<NodeParams node="/talker" params={{ use_sim_time: false }} />);
  fireEvent.click(screen.getByLabelText("use_sim_time"));
  await waitFor(() => expect(send).toHaveBeenCalledWith(
    "PUT", "/api/nodes/%2Ftalker/params/use_sim_time", { value: true },
  ));
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd frontend && npx vitest run src/views/GraphView.test.tsx src/views/NodeParams.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Cargar el grafo con `apiGet("/api/graph")` y actualizarlo con `graph.update`. Los topics se agrupan por espacio de nombres; el detalle muestra listas vacías como «Sin editores»/«Sin suscriptores». `NodeParams` carga los parámetros al abrir el nodo, renderiza checkbox para booleanos, input numérico o de texto según el tipo, codifica el nombre con `encodeURIComponent` y muestra el error de la API sin perder el valor editado. La medición de frecuencia muestra un spinner y luego `62.1 Hz` o el motivo.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: add graph, topic detail and parameter editor views"
```

---

## Etapa 2 — Procesos (semanas 4–6)

### Task 13: Token de sesión y validación de `Origin`

**Files:**
- Create: `backend/src/ros_studio/security.py`
- Modify: `backend/src/ros_studio/app.py`, `backend/src/ros_studio/cli.py`, `backend/src/ros_studio/api/ws.py`
- Test: `backend/tests/test_security.py`, `backend/tests/test_api_auth.py`

**Interfaces:**
- Produces: `Auth(token: str, allowed_origins: set[str])` con `check_bearer(authorization: str | None) -> None`, `check_ws(token: str | None, origin: str | None) -> None`; `generate_token() -> str`; dependencia `require_auth`; `create_app(services)` exige token en REST salvo `/api/health` y en `/ws`; `Services` gana `auth: Auth`.
- Consumes: `Services` (Task 8).

- [ ] **Step 1: Escribir los tests**

```python
def test_rest_requires_bearer(client) -> None:
    assert client.get("/api/env").status_code == 401
    assert client.get("/api/env", headers={"Authorization": "Bearer test"}).status_code == 200


def test_ws_rejects_bad_origin(client) -> None:
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws?token=test", headers={"origin": "http://evil.test"}):
            pass
    assert exc.value.code == 1008


def test_token_generation_is_random() -> None:
    assert len(generate_token()) >= 32
    assert generate_token() != generate_token()


def test_health_is_open(client) -> None:
    assert client.get("/api/health").status_code == 200


def test_cors_rejects_unknown_origin(client) -> None:
    response = client.options("/api/env", headers={
        "Origin": "http://evil.test",
        "Access-Control-Request-Method": "GET",
    })
    assert "access-control-allow-origin" not in response.headers
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_security.py backend/tests/test_api_auth.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`Auth` compara con `secrets.compare_digest`. Orígenes permitidos por defecto: `http://127.0.0.1:{port}` y `http://localhost:{port}`; `--allow-origin` añade más. La API usa una dependencia que devuelve `401 {"code": "unauthorized"}` y expone `GET /api/health` sin token. `CORSMiddleware` se configura con la lista exacta de orígenes permitidos, sin comodines. El WebSocket valida token y `Origin` antes de `accept()` y cierra con `1008`. `cli.py` genera el token, construye la URL `http://host:port/#token=...` y abre el navegador salvo `--no-browser`; admite `--token` solo para automatización, documentado como inseguro.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest -m "not integration" -v && ruff check backend && mypy backend/src`
Expected: PASS (los tests anteriores se actualizan con el fixture de autenticación).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio backend/tests
git commit -m "feat: require session token and validate websocket origin"
```

---

### Task 14: Modelos de proceso, logs y niveles

**Files:**
- Create: `backend/src/ros_studio/processes/__init__.py`, `backend/src/ros_studio/processes/models.py`, `backend/src/ros_studio/processes/logs.py`
- Test: `backend/tests/test_process_models.py`, `backend/tests/test_logs.py`

**Interfaces:**
- Produces: `ProcessState` (`starting`, `running`, `stopping`, `exited`, `failed`); `ProcessSpec(id, argv, cwd=None, env={}, plugin=None, autostart=False)`; `ProcessRecord(id, spec, state, pid, pgid, started_at, exit_code, error, recovered=False)`; `LogLevel` (`debug`, `info`, `warn`, `error`); `LogLine(id, stream, level, ts, text)`; `LogBuffer(max_lines=2000)` con `append(stream, text, ts) -> LogLine`, `tail(n) -> list[LogLine]`; `LogFileWriter(path, max_bytes=5_000_000, backups=3)` con `write(line)`.
- Consumes: nada.

- [ ] **Step 1: Escribir los tests**

```python
def test_buffer_keeps_last_lines() -> None:
    buffer = LogBuffer(max_lines=3)
    for i in range(5):
        buffer.append("stdout", f"line {i}", datetime.now(timezone.utc))
    assert [line.text for line in buffer.tail(10)] == ["line 2", "line 3", "line 4"]


def test_parses_ros_log_level() -> None:
    buffer = LogBuffer()
    line = buffer.append("stderr", "[WARN] [1720000000.1] [talker]: slow", datetime.now(timezone.utc))
    assert line.level == "warn"


def test_rotates_file(tmp_path) -> None:
    path = tmp_path / "p.log"
    writer = LogFileWriter(path, max_bytes=120, backups=2)
    for _ in range(10):
        writer.write(LogLine("p", "stdout", None, datetime.now(timezone.utc), "x" * 30))
    assert path.exists() and (tmp_path / "p.log.1").exists()
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_process_models.py backend/tests/test_logs.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`LogBuffer` usa `collections.deque(maxlen=max_lines)`. El nivel se extrae con una regex para `[DEBUG]`, `[INFO]`, `[WARN]`, `[ERROR]` al principio de la línea; si no hay, `None`. `LogFileWriter` rota al superar `max_bytes`, desplaza `.1`…`.n` y escribe una línea JSON por entrada.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_process_models.py backend/tests/test_logs.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio/processes backend/tests
git commit -m "feat: add process models and rotating logs with levels"
```

---

### Task 15: `ProcessManager` con arranque, streaming y parada ordenada

**Files:**
- Create: `backend/src/ros_studio/processes/manager.py`
- Modify: `backend/src/ros_studio/events.py`
- Test: `backend/tests/test_process_manager.py`

**Interfaces:**
- Produces: `StopTimeouts(interrupt=5.0, terminate=3.0)`; `ProcessManager(bus, logs_dir, stop_timeouts=StopTimeouts())` con `async start(spec: ProcessSpec) -> ProcessRecord`, `async stop(process_id: str) -> ProcessRecord`, `async restart(process_id: str) -> ProcessRecord`, `async shutdown() -> None`, `list() -> list[ProcessRecord]`, `get(process_id) -> ProcessRecord`, `logs(process_id: str) -> LogBuffer`; `ProcessNotFound`, `ProcessConflict`; eventos `process.state` y `process.log`.
- Consumes: `EventBus`, `LogBuffer`, `LogFileWriter`, `ProcessSpec`, `ProcessRecord`.

- [ ] **Step 1: Escribir los tests con procesos reales**

```python
async def test_start_streams_logs_and_stops(manager) -> None:
    record = await manager.start(ProcessSpec(
        id="p1",
        argv=[sys.executable, "-c", "print('hola', flush=True); import time; time.sleep(30)"],
    ))
    assert record.state == "running"
    await asyncio.sleep(0.2)
    lines = manager.logs("p1").tail(10)
    assert any(line.text == "hola" for line in lines)
    stopped = await manager.stop("p1")
    assert stopped.state == "exited"


async def test_missing_command_marks_failed(manager) -> None:
    record = await manager.start(ProcessSpec(id="p2", argv=["/no/existe"]))
    await asyncio.sleep(0.1)
    assert manager.get("p2").state == "failed"
    assert manager.get("p2").error


async def test_nonzero_exit_is_failed(manager) -> None:
    await manager.start(ProcessSpec(id="p3", argv=[sys.executable, "-c", "import sys; sys.exit(3)"]))
    await asyncio.sleep(0.2)
    assert manager.get("p3").state == "failed"
    assert manager.get("p3").exit_code == 3


async def test_duplicate_id_conflicts(manager) -> None:
    await manager.start(ProcessSpec(id="p4", argv=[sys.executable, "-c", "import time; time.sleep(5)"]))
    with pytest.raises(ProcessConflict):
        await manager.start(ProcessSpec(id="p4", argv=[sys.executable, "-c", "pass"]))
    await manager.shutdown()
```

`manager` es un fixture con `stop_timeouts=StopTimeouts(interrupt=0.2, terminate=0.2)` y un `logs_dir` temporal.

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_process_manager.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`start` valida que el `id` no esté activo, usa `asyncio.create_subprocess_exec(*argv, cwd=..., env={**os.environ, **spec.env}, start_new_session=True, stdout=PIPE, stderr=PIPE)`, guarda `pid`/`pgid` y lanza tareas de lectura línea a línea. Cada línea se añade al buffer, se escribe en `<logs_dir>/<id>.log` con `LogFileWriter` y se publica `process.log`. Una tarea `wait()` fija `exited` o `failed` (código 0 vs distinto) y publica `process.state`.

`stop` pasa a `stopping`, envía `SIGINT` con `os.killpg(pgid, signal.SIGINT)`, espera `interrupt` segundos, luego `SIGTERM` y luego `SIGKILL`; si el proceso ya no existe, actualiza el estado y no falla. `shutdown` para todos en orden inverso de arranque. Los errores de arranque (`FileNotFoundError`, `PermissionError`) se convierten en registro `failed` con el mensaje.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_process_manager.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio/processes backend/src/ros_studio/events.py backend/tests
git commit -m "feat: manage child processes with ordered shutdown"
```

---

### Task 16: Registro de PIDs, recuperación y cierre

**Files:**
- Create: `backend/src/ros_studio/storage/__init__.py`, `backend/src/ros_studio/storage/db.py`, `backend/src/ros_studio/storage/process_registry.py`
- Modify: `backend/src/ros_studio/processes/manager.py`, `backend/src/ros_studio/app.py`, `backend/src/ros_studio/cli.py`
- Test: `backend/tests/test_storage.py`, `backend/tests/test_recovery.py`

**Interfaces:**
- Produces: `Database(path: Path)` con `migrate()`, `user_version() -> int`; `ProcessRegistry(db)` con `save(record)`, `delete(process_id)`, `all() -> list[ProcessRecord]`; `ProcessManager(bus, logs_dir, registry, ...)` con `async recover() -> list[ProcessRecord]`; `shutdown()` para todos; los recuperados llevan `recovered=True` y no reenganchan logs.
- Consumes: `ProcessRecord`, SQLite.

- [ ] **Step 1: Escribir los tests**

```python
def test_migrations_and_registry(tmp_path) -> None:
    db = Database(tmp_path / "state.db")
    db.migrate()
    registry = ProcessRegistry(db)
    record = ProcessRecord(
        id="p1", spec=ProcessSpec(id="p1", argv=["sleep", "1"]),
        state="running", pid=123, pgid=123,
        started_at=datetime.now(timezone.utc), exit_code=None, error=None,
    )
    registry.save(record)
    assert registry.all()[0].id == record.id
    registry.delete(record.id)
    assert registry.all() == []


async def test_recover_alive_orphan_can_be_stopped(manager, registry, tmp_path) -> None:
    record = await manager.start(ProcessSpec(
        id="orphan", argv=[sys.executable, "-c", "import time; time.sleep(30)"],
    ))
    registry.save(record)
    manager2 = ProcessManager(bus=EventBus(), logs_dir=tmp_path, registry=registry)
    recovered = await manager2.recover()
    assert recovered[0].id == "orphan"
    assert recovered[0].state == "running"
    assert recovered[0].recovered is True
    await manager2.shutdown()
    assert not process_alive(record.pid)


async def test_recover_dead_process_is_removed(registry, tmp_path) -> None:
    registry.save(dead_record(pid=999999))
    manager = ProcessManager(bus=EventBus(), logs_dir=tmp_path, registry=registry)
    assert await manager.recover() == []
    assert registry.all() == []
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_storage.py backend/tests/test_recovery.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`Database` abre SQLite con `check_same_thread=False`, activa `PRAGMA journal_mode=WAL` y migra con `user_version`. La tabla `process_registry(id, spec_json, pid, pgid, started_at, exit_code)` se escribe al arrancar y se borra al terminar. `recover()` comprueba `os.kill(pid, 0)`; si vive, marca `running`, `recovered=True` y lo incluye en el orden de parada; si no, borra la fila. El `lifespan` de la app llama a `recover()` al arrancar y a `processes.shutdown()` al cerrar, antes de parar el hilo ROS; la lista recuperada se expone en `/api/processes`. `shutdown()` para recuperados por `pgid` con la misma escalada.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_storage.py backend/tests/test_recovery.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio backend/tests
git commit -m "feat: persist process registry and recover orphans"
```

---

### Task 17: API REST y WebSocket de procesos

**Files:**
- Create: `backend/src/ros_studio/api/routes_processes.py`
- Modify: `backend/src/ros_studio/api/ws.py`, `backend/src/ros_studio/app.py`
- Test: `backend/tests/test_api_processes.py`, `backend/tests/test_ws_processes.py`

**Interfaces:**
- Produces: `GET /api/processes`, `POST /api/processes` (cuerpo `{id?, command, args?, cwd?, env?}`), `DELETE /api/processes/{id}`, `POST /api/processes/{id}/restart`, `GET /api/processes/{id}/logs?lines=200`; WS canales `processes` y `logs:<id>` con reenvío inicial de estado y últimas 200 líneas; `Services` gana `processes: ProcessManager`.
- Consumes: `ProcessManager`, `Auth`.

- [ ] **Step 1: Escribir los tests**

```python
def test_create_list_and_stop(client) -> None:
    created = client.post("/api/processes", json={
        "command": [sys.executable, "-c", "print('hi', flush=True); import time; time.sleep(30)"],
    }, headers=auth_headers)
    assert created.status_code == 201
    process_id = created.json()["id"]
    assert client.get("/api/processes", headers=auth_headers).json()[0]["id"] == process_id
    assert client.delete(f"/api/processes/{process_id}", headers=auth_headers).status_code == 200


def test_command_string_is_shlex_split(client) -> None:
    created = client.post("/api/processes", json={"command": "sleep 30"}, headers=auth_headers)
    assert created.json()["spec"]["argv"] == ["sleep", "30"]
    client.delete(f"/api/processes/{created.json()['id']}", headers=auth_headers)


def test_ws_backfills_state_and_logs(client) -> None:
    created = client.post("/api/processes", json={
        "command": [sys.executable, "-c", "print('hola', flush=True); import time; time.sleep(30)"],
    }, headers=auth_headers).json()
    with client.websocket_connect("/ws?token=test") as ws:
        ws.send_json({"type": "subscribe", "channels": ["processes", f"logs:{created['id']}"]})
        messages = [ws.receive_json() for _ in range(2)]
        assert {m["type"] for m in messages} == {"process.state", "process.log"}
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_api_processes.py backend/tests/test_ws_processes.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

La API valida el cuerpo con Pydantic, genera `id` con `p_<8 hex>` si falta, convierte `command` en lista con `shlex.split` si es string y lo añade a `args`, y mapea `ProcessConflict` a `409` y `ProcessNotFound` a `404`. `DELETE` devuelve el registro parado. `GET /logs` devuelve `tail(lines)` con `lines` acotado a `[1, 2000]`.

El WS añade canales `processes` (todos los estados) y `logs:<id>` (últimas 200 líneas al suscribirse); filtra eventos por canal antes de enviarlos. No se envían logs de procesos no suscritos.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_api_processes.py backend/tests/test_ws_processes.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio backend/tests
git commit -m "feat: expose process api and websocket channels"
```

---

### Task 18: Perfiles de lanzamiento

**Files:**
- Create: `backend/src/ros_studio/processes/profiles.py`, `backend/src/ros_studio/api/routes_profiles.py`
- Modify: `backend/src/ros_studio/storage/db.py`, `backend/src/ros_studio/app.py`
- Test: `backend/tests/test_profiles.py`, `backend/tests/test_api_profiles.py`

**Interfaces:**
- Produces: `Profile(id, name, processes: list[ProcessSpec])`; `ProfileRepository(db)` con `list()`, `upsert(profile)`, `delete(id)`; `POST /api/profiles`, `PUT /api/profiles/{id}`, `DELETE /api/profiles/{id}`, `POST /api/profiles/{id}/start`; el arranque respeta el orden listado y, si uno falla, para los ya arrancados y responde `409`.
- Consumes: `ProcessManager`, `Database`.

- [ ] **Step 1: Escribir los tests**

```python
def test_profile_roundtrip(repo) -> None:
    profile = Profile(id="sim", name="Simulación", processes=[
        ProcessSpec(id="a", argv=["sleep", "1"]),
        ProcessSpec(id="b", argv=["sleep", "1"]),
    ])
    repo.upsert(profile)
    assert repo.list()[0].name == "Simulación"


def test_start_profile_stops_started_on_failure(client, fake_manager) -> None:
    fake_manager.fail_on = "b"
    response = client.post("/api/profiles/sim/start", headers=auth_headers)
    assert response.status_code == 409
    assert [call for call in fake_manager.stopped] == ["a"]
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_profiles.py backend/tests/test_api_profiles.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Migración `user_version = 2` con tabla `profiles(id TEXT PRIMARY KEY, name TEXT, spec_json TEXT, updated_at TEXT)`. La API valida que los `id` de proceso sean únicos dentro del perfil. `start` recorre la lista en orden; si `start` lanza, para los ya arrancados en orden inverso y devuelve `409 {"code": "profile_start_failed", "message": ...}`.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_profiles.py backend/tests/test_api_profiles.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio backend/tests
git commit -m "feat: persist and launch process profiles"
```

---

### Task 19: UI de procesos, logs y perfiles

**Files:**
- Create: `frontend/src/views/ProcessesView.tsx`, `frontend/src/views/LogsPanel.tsx`, `frontend/src/views/ProfilesPanel.tsx`
- Create: `frontend/src/layout/CommandPalette.tsx`
- Modify: `frontend/src/layout/Workbench.tsx`, `frontend/src/state/store.ts`
- Test: `frontend/src/views/ProcessesView.test.tsx`, `frontend/src/views/LogsPanel.test.tsx`, `frontend/src/layout/CommandPalette.test.tsx`

**Interfaces:**
- Produces: lista de procesos con estado y código de salida; formulario de arranque (`command`, `cwd` opcional); botones parar/reiniciar con confirmación; logs por proceso con filtro de nivel, búsqueda y descarga; lista de perfiles con «Iniciar» y «Guardar como perfil»; `CommandPalette` que se abre con `Ctrl+Shift+P` y ejecuta acciones (`open-graph`, `open-processes`, `open-plugins`, `stop-process`, `restart-process`).
- Consumes: `/api/processes`, `/api/processes/{id}/logs`, `/api/profiles`, eventos `process.state` y `process.log`.

- [ ] **Step 1: Escribir los tests**

```tsx
it("muestra el código de salida de un proceso fallido", () => {
  seedProcesses([{ id: "p1", state: "failed", exit_code: 3, spec: { argv: ["bad"] } }]);
  render(<ProcessesView />);
  expect(screen.getByText("failed")).toBeInTheDocument();
  expect(screen.getByText("exit 3")).toBeInTheDocument();
});

it("filtra logs por nivel y texto", () => {
  seedLogs("p1", [
    { level: "info", text: "hola" },
    { level: "error", text: "fallo" },
  ]);
  render(<LogsPanel processId="p1" />);
  fireEvent.change(screen.getByLabelText("Nivel"), { target: { value: "error" } });
  expect(screen.queryByText("hola")).not.toBeInTheDocument();
  expect(screen.getByText("fallo")).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Buscar en logs"), { target: { value: "nada" } });
  expect(screen.queryByText("fallo")).not.toBeInTheDocument();
});

it("guardar como perfil llama a la API", async () => {
  const send = vi.spyOn(api, "apiSend").mockResolvedValue({});
  render(<ProfilesPanel />);
  fireEvent.click(screen.getByText("Guardar como perfil"));
  await waitFor(() => expect(send).toHaveBeenCalledWith("POST", "/api/profiles", expect.anything()));
});

it("abre la paleta con Ctrl+Shift+P y ejecuta una acción", () => {
  const onAction = vi.fn();
  render(<CommandPalette onAction={onAction} />);
  fireEvent.keyDown(window, { key: "P", ctrlKey: true, shiftKey: true });
  fireEvent.click(screen.getByText("Abrir grafo"));
  expect(onAction).toHaveBeenCalledWith("open-graph");
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd frontend && npx vitest run src/views/ProcessesView.test.tsx src/views/LogsPanel.test.tsx src/layout/CommandPalette.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

La vista de procesos se alimenta de `GET /api/processes` y de `process.state`. Al montar un log se piden las últimas 200 líneas y se suscribe a `logs:<id>`; el store mantiene un máximo de 2000 líneas por proceso. El filtro de nivel acepta `todos`, `info`, `warn` y `error`; la búsqueda es por subcadena y se combina con el nivel. La descarga genera un blob con las líneas visibles. Parar pide confirmación; reiniciar no. El panel de perfiles lista, arranca y guarda la selección actual de procesos. `CommandPalette` escucha `Ctrl+Shift+P`, filtra acciones por texto y las ejecuta cerrando el diálogo; las acciones de proceso actúan sobre la selección actual.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: add processes, logs and profiles ui"
```

---

## Etapa 3 — Foxglove y plugins (semanas 7–8)

### Task 20: Manifiestos de plugin y loader

**Files:**
- Create: `backend/src/ros_studio/plugins/__init__.py`, `backend/src/ros_studio/plugins/models.py`, `backend/src/ros_studio/plugins/loader.py`
- Create: `backend/src/ros_studio/builtin_plugins/__init__.py`
- Test: `backend/tests/test_plugin_manifest.py`, `backend/tests/test_plugin_loader.py`

**Interfaces:**
- Produces: `PluginProcessSpec(id, command, autostart=False, healthcheck=None)` con propiedad `argv: list[str]` (resultado de `shlex.split(command)`); `PanelSpec(id, title, type: "iframe" | "stream" | "native", url=None, requires=[])`; `PluginManifest(name, version, description, processes, panels, permissions)`; `DiscoveredPlugin(manifest: PluginManifest | None, path: Path, error: str | None)`; `PluginLoader(builtin_dir: Path, user_dir: Path)` con `discover() -> list[DiscoveredPlugin]`.
- Consumes: `ProcessSpec` (conversión con `shlex.split`).

- [ ] **Step 1: Escribir los tests**

```python
def write_plugin(tmp_path, name="demo", body=None):
    directory = tmp_path / name
    directory.mkdir()
    (directory / "plugin.yaml").write_text(body or """
name: demo
version: 0.1.0
description: Demo
processes:
  - id: bridge
    command: sleep 30
    healthcheck: tcp://127.0.0.1:9999
panels:
  - id: view
    title: Demo
    type: iframe
    url: http://127.0.0.1:8080
    requires: [bridge]
permissions: [spawn-process]
""")
    return directory


def test_discovers_valid_manifest(tmp_path) -> None:
    loader = PluginLoader(tmp_path / "none", tmp_path)
    found = loader.discover()
    assert found[0].manifest.name == "demo"
    assert found[0].manifest.processes[0].argv == ["sleep", "30"]


def test_invalid_requires_does_not_crash(tmp_path) -> None:
    directory = write_plugin(tmp_path, body="""
name: x
version: 1
description: x
processes:
  - id: bridge
    command: sleep 1
panels:
  - id: p
    type: iframe
    url: http://127.0.0.1:1
    requires: [missing]
""")
    found = PluginLoader(tmp_path / "none", tmp_path).discover()
    assert found[0].manifest is None
    assert "missing" in found[0].error
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_plugin_manifest.py backend/tests/test_plugin_loader.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Modelos Pydantic con validadores: ids únicos, `requires` apunta a procesos existentes, `iframe`/`stream` exigen `url`, `native` exige `panel`. El loader recorre `builtin_dir` y `user_dir`, ignora carpetas sin `plugin.yaml`, captura `ValidationError` y `YAMLError` en `DiscoveredPlugin.error` sin abortar el resto. Los duplicados por nombre: gana el de usuario y se anota un aviso.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_plugin_manifest.py backend/tests/test_plugin_loader.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio/plugins backend/src/ros_studio/builtin_plugins backend/tests
git commit -m "feat: load and validate plugin manifests"
```

---

### Task 21: `PluginManager` con activación, dependencias y healthchecks

**Files:**
- Create: `backend/src/ros_studio/plugins/manager.py`, `backend/src/ros_studio/plugins/healthcheck.py`
- Create: `backend/src/ros_studio/storage/settings.py`
- Test: `backend/tests/test_plugin_manager.py`, `backend/tests/test_healthcheck.py`

**Interfaces:**
- Produces: `PluginRecord(name, state: "discovered" | "active" | "stopped" | "error", error=None, manifest)`;
  `SettingsRepository(db)` con `get(key: str, default: Any) -> Any` y `set(key: str, value: Any) -> None`;
  `check_health(url: str, timeout: float = 10.0) -> None` (lanza `HealthcheckError`); `PluginManager(loader, processes, bus, healthcheck=check_health, settings=None)` con `list()`, `async activate(name) -> PluginRecord`, `async deactivate(name) -> PluginRecord`, `async restore() -> list[PluginRecord]`, `async shutdown()`; eventos `plugin.state`.
- Consumes: `ProcessManager`, `PluginLoader`, `Database`.

- [ ] **Step 1: Escribir los tests**

```python
async def test_activate_starts_processes_in_order_and_waits(plugin_manager, fake_processes) -> None:
    record = await plugin_manager.activate("demo")
    assert record.state == "active"
    assert fake_processes.started == ["bridge"]


async def test_failed_healthcheck_stops_started_processes(plugin_manager, fake_processes, fake_health) -> None:
    fake_health.fail = True
    record = await plugin_manager.activate("demo")
    assert record.state == "error"
    assert fake_processes.stopped == ["bridge"]


def test_healthcheck_tcp() -> None:
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen()
    port = server.getsockname()[1]
    asyncio.run(check_health(f"tcp://127.0.0.1:{port}", timeout=1))


async def test_active_plugins_are_persisted_and_restored(plugin_manager, settings) -> None:
    await plugin_manager.activate("demo")
    assert settings.get("plugins.active", []) == ["demo"]
    restored = await make_manager(settings=settings).restore()
    assert [record.name for record in restored] == ["demo"]
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_plugin_manager.py backend/tests/test_healthcheck.py -v`
Expected: FAIL.

- [ ] **Step 3: Implementar**

La migración `user_version = 3` añade `settings(key TEXT PRIMARY KEY, value_json TEXT)`. `activate` comprueba que el plugin existe y no está activo; arranca cada proceso en el orden del manifiesto, espera su healthcheck (`tcp://` con `asyncio.open_connection`, `http://` con `urllib.request.urlopen` en `asyncio.to_thread`) con reintento cada `0.2 s` hasta `timeout`; si uno falla, para los arrancados en orden inverso y deja el plugin en `error`. Al activar, guarda el nombre en `plugins.active`; `deactivate` lo quita y para en orden inverso. `restore()` reactiva los nombres guardados, omitiendo los que ya estén activos y dejando en `error` los que fallen sin abortar el arranque. `shutdown` desactiva todos. Los permisos se devuelven en el registro, no se aplican. El `lifespan` de la app llama a `restore()` después de `processes.recover()`.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_plugin_manager.py backend/tests/test_healthcheck.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio/plugins backend/tests
git commit -m "feat: activate plugins with dependency order and healthchecks"
```

---

### Task 22: API, WebSocket y UI de plugins

**Files:**
- Create: `backend/src/ros_studio/api/routes_plugins.py`
- Create: `frontend/src/views/PluginsView.tsx`, `frontend/src/panels/PluginPanel.tsx`
- Modify: `backend/src/ros_studio/api/ws.py`, `backend/src/ros_studio/app.py`, `frontend/src/layout/Workbench.tsx`
- Test: `backend/tests/test_api_plugins.py`, `frontend/src/views/PluginsView.test.tsx`

**Interfaces:**
- Produces: `GET /api/plugins`, `POST /api/plugins/{name}/activate`, `DELETE /api/plugins/{name}/activate`; WS canal `plugins`; UI con lista, permisos, activar/desactivar y apertura de panel; `Services` gana `plugins: PluginManager`.
- Consumes: `PluginManager`, `Auth`.

- [ ] **Step 1: Escribir los tests**

```python
def test_list_and_activate(client, fake_plugins) -> None:
    assert client.get("/api/plugins", headers=auth_headers).json()[0]["name"] == "demo"
    activated = client.post("/api/plugins/demo/activate", headers=auth_headers)
    assert activated.json()["state"] == "active"
```

```tsx
it("muestra permisos y activa", async () => {
  seedPlugins([{ name: "demo", state: "discovered", manifest: { permissions: ["spawn-process"] } }]);
  const send = vi.spyOn(api, "apiSend").mockResolvedValue({ state: "active" });
  render(<PluginsView />);
  expect(screen.getByText("spawn-process")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Activar"));
  await waitFor(() => expect(send).toHaveBeenCalledWith("POST", "/api/plugins/demo/activate"));
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_api_plugins.py -v && cd frontend && npx vitest run src/views/PluginsView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

La API devuelve `PluginRecord` con manifiesto, estado y error; activar/desactivar mapea `PluginNotFound` a `404`, conflicto de estado a `409`. El WS reenvía la lista al suscribirse y emite `plugin.state`. `PluginsView` pinta estado, permisos y error, y al activar abre un panel en `dockview`: `iframe` con `src` (sustituyendo `{hostname}` por `location.hostname`), `stream` con el mismo iframe y `native` con un placeholder que explica que es un panel del núcleo.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest backend/tests/test_api_plugins.py -v && cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio frontend/src backend/tests
git commit -m "feat: expose and manage plugins in the ui"
```

---

### Task 23: Plugin de Foxglove, Lichtblick y panel embebido

**Files:**
- Create: `backend/src/ros_studio/builtin_plugins/foxglove/plugin.yaml`
- Create: `backend/src/ros_studio/builtin_plugins/foxglove/layout.json`
- Create: `backend/src/ros_studio/lichtblick.py`
- Modify: `backend/src/ros_studio/app.py`, `backend/src/ros_studio/cli.py`, `frontend/src/panels/PluginPanel.tsx`
- Test: `backend/tests/test_lichtblick.py`, `backend/tests/test_foxglove_plugin.py`, `frontend/src/panels/PluginPanel.test.tsx`

**Interfaces:**
- Produces: `LichtblickAssets(cache_dir: Path, vendor_dir: Path | None, version: str, url: str, sha256: str)` con `async ensure() -> Path` y `mount_path() -> Path`; plugin `foxglove` con proceso `bridge` (`ros2 launch foxglove_bridge foxglove_bridge_launch.xml port:=8765`, healthcheck `tcp://127.0.0.1:8765`) y panel `iframe` en `/lichtblick/?ds=foxglove-websocket&ds.url=ws://{hostname}:8765&layout=/lichtblick/layout.json`; montaje estático en `/lichtblick`.
- Consumes: `PluginManager`, `ProcessManager`, `{hostname}`.

- [ ] **Step 1: Escribir los tests**

```python
async def test_vendor_dir_wins(tmp_path) -> None:
    vendor = tmp_path / "vendor"
    vendor.mkdir()
    (vendor / "index.html").write_text("ok")
    assets = LichtblickAssets(tmp_path / "cache", vendor, "1.0", "http://invalid", "0" * 64)
    assert await assets.ensure() == vendor


async def test_download_verifies_checksum(tmp_path) -> None:
    assets = LichtblickAssets(tmp_path / "cache", None, "1.0", "http://example/app.zip", "0" * 64)
    with pytest.raises(AssetError, match="checksum"):
        await assets.ensure()
```

```tsx
it("sustituye hostname en la url del panel", () => {
  render(<PluginPanel panel={{ type: "iframe", url: "/lichtblick/?ds=foxglove-websocket&ds.url=ws://{hostname}:8765" }} />);
  expect(screen.getByTitle("Foxglove")).toHaveAttribute(
    "src", "/lichtblick/?ds=foxglove-websocket&ds.url=ws://localhost:8765",
  );
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pytest backend/tests/test_lichtblick.py backend/tests/test_foxglove_plugin.py -v && cd frontend && npx vitest run src/panels/PluginPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`plugin.yaml` con el manifiesto del diseño. `LichtblickAssets` usa el directorio vendorizado si existe; si no, descarga el zip fijado en `docs/etapa-0-mediciones.md` a `~/.cache/ros-studio/lichtblick/<version>/`, verifica `sha256`, extrae y escribe un marcador `.complete`; en ambos casos copia `layout.json` al directorio servido si no está. Si la descarga falla, el plugin queda en `error` con un mensaje que incluye la URL y cómo pre-sembrar la caché. `app.py` monta `/lichtblick` con `StaticFiles(html=True)` cuando el directorio existe (antes del catch-all de la SPA) y si no devuelve una página con instrucciones. El frontend sustituye `{hostname}` y muestra el iframe a pantalla completa del panel. `layout.json` trae un panel 3D sobre `/tf` y un Plot sobre `/turtle1/pose` para que al abrir el visor ya haya paneles conectados; si el formato de Lichtblick no admite layout por URL, se anota en `docs/etapa-0-mediciones.md` y se abre con la vista por defecto.

- [ ] **Step 4: Ejecutar y ver el verde**

Run: `pytest -m "not integration" -v && cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ros_studio frontend/src backend/tests
git commit -m "feat: ship foxglove plugin with local lichtblick panel"
```

---

### Task 24: Docker, integración, E2E y documentación

**Files:**
- Create: `docker/Dockerfile`, `docker/compose.yaml`
- Create: `.github/workflows/integration.yml`
- Create: `backend/tests/integration/test_mvp_ros.py`
- Create: `frontend/playwright.config.ts`, `frontend/e2e/mvp.spec.ts`
- Create: `docs/install.md`
- Modify: `README.md`

**Interfaces:**
- Produces: imagen con ROS 2 Jazzy, app instalada en un venv `--system-site-packages`, puertos `8000` y `8765` en loopback; CI de integración con Humble y Jazzy; E2E del flujo completo; guía de instalación pixi/apt/Docker.
- Consumes: todo lo anterior.

- [ ] **Step 1: Escribir el test de integración**

`backend/tests/integration/test_mvp_ros.py` con `pytestmark = pytest.mark.integration`:

```python
import subprocess

def test_graph_matches_ros_cli(client, auth_headers) -> None:
    process = client.post("/api/processes", json={
        "command": "ros2 run turtlesim turtlesim_node",
    }, headers=auth_headers).json()
    try:
        wait_until(lambda: any(
            node["name"] == "/turtlesim"
            for node in client.get("/api/graph", headers=auth_headers).json()["nodes"]
        ), timeout=5)
        api = client.get("/api/graph", headers=auth_headers).json()
        api_nodes = {n["name"] for n in api["nodes"] if not n["name"].startswith("/ros_studio")}
        cli_nodes = {
            line.strip() for line in subprocess.check_output(["ros2", "node", "list"], text=True).splitlines()
            if not line.startswith("/ros_studio")
        }
        assert api_nodes == cli_nodes
        assert {t["name"] for t in api["topics"]} == set(
            subprocess.check_output(["ros2", "topic", "list"], text=True).split()
        )
        rate = client.get("/api/topics//turtle1/pose/rate", headers=auth_headers).json()
        assert rate["available"] is True and rate["hz"] > 0
    finally:
        client.delete(f"/api/processes/{process['id']}", headers=auth_headers)
```

Este test es el criterio de aceptación de la fase 1: compara nodos y topics con la CLI de ROS, espera a que `turtlesim` aparezca en menos de 5 s, mide la frecuencia de `/turtle1/pose` y para el proceso al final.

- [ ] **Step 2: Escribir el E2E y ejecutarlo**

`frontend/e2e/mvp.spec.ts`: abrir `http://127.0.0.1:8000/#token=test-token`, arrancar `ros2 run turtlesim turtlesim_node` desde la UI, ver el nodo `/turtlesim` en el grafo, abrir `/turtle1/pose`, medir frecuencia, parar el proceso y activar el plugin de Foxglove; comprobar que el panel aparece y que el plugin llega a `active`.

Run: `cd frontend && npx playwright test`
Expected: PASS contra el contenedor.

- [ ] **Step 3: Crear Docker y CI**

`docker/Dockerfile` con una etapa Node que ejecuta `npm ci && npm run build` y copia `frontend/dist` a `backend/src/ros_studio/web`; la etapa final parte de `ros:jazzy-ros-base`, instala `python3-venv`, `ros-jazzy-foxglove-bridge`, `ros-jazzy-turtlesim`, `ros-jazzy-demo-nodes-cpp`, crea `/opt/ros-studio` con `python3 -m venv --system-site-packages`, construye e instala el wheel (que ya incluye la web) y arranca `ros-studio --host 0.0.0.0 --token test-token`. `compose.yaml` publica `127.0.0.1:8000:8000` y `127.0.0.1:8765:8765` y monta el workspace. El mismo copiado de `frontend/dist` se hace antes de `python -m build` en CI y en la receta de publicación.

`integration.yml`: job en contenedor `ros:humble-ros-base` y `ros:jazzy-ros-base`, instala dependencias, `pytest -m integration`, y un job de E2E que construye la imagen y ejecuta Playwright.

- [ ] **Step 4: Documentar y verificar**

`docs/install.md` con los tres caminos (pixi: `pixi add fastapi uvicorn` + `pixi add --pypi ros-studio`; apt: venv `--system-site-packages`; Docker), el reinicio al cambiar `ROS_DOMAIN_ID`, WSL2 (mismo camino que Ubuntu, con el navegador de Windows entrando por localhost forwarding), la nota de macOS como entorno de desarrollo y el aviso de puertos en Docker. `README.md` enlaza spec, diseño, plan e instalación.

Repetir la medición de la etapa 0 (`spikes/graph_probe.py --topics 100`) contra la versión final y anotar en `docs/etapa-0-mediciones.md` que el sondeo sigue por debajo del 5 % de CPU y de 200 ms p95.

Run: `docker build -f docker/Dockerfile -t ros-studio . && docker run --rm ros-studio ros-studio --help && pytest -m integration -v`
Expected: imagen construida, ayuda mostrada, integración PASS.

- [ ] **Step 5: Commit**

```bash
git add docker .github backend/tests/integration frontend/playwright.config.ts frontend/e2e docs/install.md README.md
git commit -m "feat: add docker image, integration tests and install docs"
```

---

## Etapas 4–5 (hoja de ruta, sin detallar)

- **Etapa 4 — Workspace (~2 semanas):** detectar paquetes con `colcon list`, localizar `launch/*.py|xml|yaml`, árbol en la barra lateral, `POST /api/workspace/build` con salida en vivo por `build.output`, y grafo visual de nodos/topics (RF-9, RF-11).
- **Etapa 5 — Gazebo y plugins (~2–3 semanas):** plugin `gazebo` con `gz sim -s`, tipo de panel `stream` con noVNC, visor headless, pulido del ciclo de plugins y pruebas de carga. RViz queda para después.

Cada etapa se planifica cuando la anterior esté cerrada; las estimaciones se recalibran con los datos de la etapa 0.
