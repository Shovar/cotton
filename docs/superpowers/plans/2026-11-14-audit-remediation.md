# Corrección de hallazgos de auditoría — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los hallazgos de la auditoría del 2026-11-14: token en logs, RF-1 incompleto (servicios y acciones), caché de endpoints prometida, exclusión del nodo propio, puerto fijo del plugin, CI sin frontend, barra de estado, panel Ajustes vacío y documentación desalineada.

**Architecture:** Cambios pequeños en las capas existentes: `cli.py` (arranque), `ros/` (nodo, grafo, frecuencia), `features/graph` y `layout` (React), manifiesto del plugin, CI y documentos. No se añaden capas, dependencias ni endpoints nuevos.

**Tech Stack:** Python 3.10+, FastAPI/uvicorn, `rclpy`, pytest; React 19, TypeScript, Vitest; GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-11-06-ros-studio-design.md`](../specs/2026-11-06-ros-studio-design.md)

## Global Constraints

- Python `>=3.10`, Node `>=20`. Sin dependencias nuevas.
- `rclpy` se importa en runtime; nunca se declara en `pyproject.toml`.
- Sondeo del grafo cada `1.0 s`; refresco visible en `<2 s`.
- Bind a `127.0.0.1` por defecto; token de sesión y `Origin` obligatorios, nunca desactivados.
- REST bajo `/api`; WebSocket único en `/ws`; errores `{"code": string, "message": string}`.
- Cobertura mínima 80 % en backend y frontend.
- Commits convencionales en inglés, uno por tarea.

## Review Focus

1. **`cotton --port 9000`:** el panel de Foxglove debe cargar desde el puerto real; el puente sigue en `8765`.
2. **Nuevo publisher en un topic sin cambios de tipo:** la caché no lo verá hasta que cambien nombre o tipos; es un límite aceptado y documentado, no un fallo silencioso.
3. **`/rosout` y `/parameter_events`:** tras excluir el nodo propio deben seguir listados con sus demás editores/suscriptores.
4. **Dos instancias o reinicio del hilo ROS:** nombres con PID distintos y caché descartada al cambiar de nodo.
5. **Diagnóstico de autenticación:** al apagar el access log no debe quedar ningún token en logs; los `401`/`1008` siguen siendo distinguibles por el cliente.

---

### Task 1: Sacar el token del access log

**Files:**
- Modify: `backend/src/cotton/cli.py:147`
- Test: `backend/tests/test_cli.py`

**Interfaces:**
- Consumes: `cli.main(argv)` existente.
- Produces: `uvicorn.run(..., access_log=False)`; ninguna otra firma cambia.

- [ ] **Step 1: Escribir el test que falla**

```python
def test_main_disables_uvicorn_access_log(monkeypatch: pytest.MonkeyPatch) -> None:
    options: dict[str, object] = {}

    def run(*_args: object, **kwargs: object) -> None:
        options.update(kwargs)

    monkeypatch.setattr(cli, "ensure_ros_environment", environment)
    monkeypatch.setattr(cli.uvicorn, "run", run)

    assert cli.main(["--no-browser"]) == 0
    assert options["access_log"] is False
```

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `pytest backend/tests/test_cli.py::test_main_disables_uvicorn_access_log -v`
Expected: FAIL con `KeyError: 'access_log'`.

- [ ] **Step 3: Implementar**

En `cli.py:147`, añadir el argumento:

```python
uvicorn.run(create_app(services), host=args.host, port=args.port, access_log=False)
```

Decisión: se apaga el access log entero. Redactar el token exigiría un filtro de logging propio; el log de peticiones de una app local de un usuario no compensa esa complejidad. Los errores de auth siguen llegando al cliente como `401`/cierre `1008`.

- [ ] **Step 4: Verificar**

Run: `pytest backend/tests/test_cli.py -v && ruff check backend && mypy backend/src`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cotton/cli.py backend/tests/test_cli.py
git commit -m "fix: keep the session token out of uvicorn access logs"
```

---

### Task 2: Nodo con PID y probe de frecuencia con nombre propio

**Files:**
- Modify: `backend/src/cotton/ros/thread.py:30-32`
- Modify: `backend/src/cotton/ros/rate.py:38-51,76-99`
- Test: `backend/tests/test_ros_thread.py`, `backend/tests/test_rate.py`

**Interfaces:**
- Consumes: `RosThread(node_name=...)`, `measure_rate(node, topic, window_s)`.
- Produces: `RosThread.node_name` por defecto `f"cotton_{os.getpid()}"`; `measure_rate(..., probe_name: str = "cotton_rate")`; `ThreadRateSource.measure` pasa `f"{ros.node_name}_rate"`.

- [ ] **Step 1: Escribir los tests que fallan**

En `test_ros_thread.py`:

```python
def test_default_node_name_includes_the_pid() -> None:
    assert RosThread().node_name == f"cotton_{os.getpid()}"


def test_explicit_node_name_is_kept() -> None:
    assert RosThread(node_name="cotton_7").node_name == "cotton_7"
```

En `test_rate.py`:

```python
def test_thread_rate_source_names_the_probe_after_the_app_node(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, str] = {}

    def fake_measure(
        _node: object, _topic: str, window_s: float = 2.0, probe_name: str = "cotton_rate"
    ) -> RateResult:
        seen["probe_name"] = probe_name
        return RateResult(available=True, hz=1.0, window_s=window_s)

    monkeypatch.setattr("cotton.ros.rate.measure_rate", fake_measure)
    ros = SimpleNamespace(node=object(), node_name="cotton_42")

    assert ThreadRateSource(ros).measure("/chatter").hz == 1.0
    assert seen["probe_name"] == "cotton_42_rate"
```

Añadir a `test_rate.py` los imports que faltan: `from types import SimpleNamespace`, `ThreadRateSource` desde `cotton.ros.rate` y `import os` en `test_ros_thread.py`.

- [ ] **Step 2: Ejecutarlos y verlos fallar**

Run: `pytest backend/tests/test_ros_thread.py backend/tests/test_rate.py -v`
Expected: FAIL (`cotton` sin PID; `TypeError` por `probe_name`).

- [ ] **Step 3: Implementar**

`thread.py`: `import os`; cambiar el constructor a

```python
def __init__(self, node_name: str | None = None, poll_interval: float = 0.05) -> None:
    self.node_name = node_name or f"cotton_{os.getpid()}"
```

`rate.py`: añadir `probe_name: str = "cotton_rate"` a `measure_rate`, pasarlo a `_count_messages` y usarlo en `rclpy.create_node(probe_name)`. En `ThreadRateSource.measure`:

```python
return measure_rate(node, topic, window_s, probe_name=f"{self._ros.node_name}_rate")
```

- [ ] **Step 4: Verificar**

Run: `pytest backend/tests/test_ros_thread.py backend/tests/test_rate.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cotton/ros/thread.py backend/src/cotton/ros/rate.py backend/tests/test_ros_thread.py backend/tests/test_rate.py
git commit -m "fix: name the ros node and rate probe after the app process"
```

---

### Task 3: Excluir el nodo propio de todo el grafo

**Files:**
- Modify: `backend/src/cotton/ros/graph.py:38-89,122-132`
- Test: `backend/tests/test_graph.py`

**Interfaces:**
- Consumes: `RclpyGraphSource(node, self_node_name).snapshot()`.
- Produces: helper `_owned_by_app(name: str, self_node_name: str) -> bool`; ningún nodo, endpoint, servicio o acción del proceso propio aparece en `GraphSnapshot`.

- [ ] **Step 1: Escribir el test que falla**

Añadir al `FakeNode` un topic publicado por el nodo propio y un servicio suyo:

```python
def test_self_node_is_removed_from_endpoints_services_and_actions() -> None:
    class OwnNode(FakeNode):
        def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
            return [("/rosout", ["rcl_interfaces/msg/Log"])]

        def get_service_names_and_types(self) -> list[tuple[str, list[str]]]:
            return [
                ("/cotton_1/get_parameters", ["rcl_interfaces/srv/GetParameters"]),
                ("/talker/get_parameters", ["rcl_interfaces/srv/GetParameters"]),
            ]

        def get_publishers_info_by_topic(self, _topic: str) -> list[Endpoint]:
            return [Endpoint("cotton_1", "/", "rcl_interfaces/msg/Log"), Endpoint("talker", "/", "rcl_interfaces/msg/Log")]

        def get_subscriptions_info_by_topic(self, _topic: str) -> list[Endpoint]:
            return [Endpoint("cotton_1_rate", "/", "rcl_interfaces/msg/Log")]

    graph = RclpyGraphSource(OwnNode(), self_node_name="/cotton_1").snapshot()

    assert graph.topics[0].publishers == ["/talker"]
    assert graph.topics[0].subscribers == []
    assert "/cotton_1/get_parameters" not in graph.services
    assert "/talker/get_parameters" in graph.services
```

Nota: `/rosout` sigue listado porque otros nodos también publican en él.

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `pytest backend/tests/test_graph.py::test_self_node_is_removed_from_endpoints_services_and_actions -v`
Expected: FAIL (`["/cotton_1", "/talker"]` en publishers).

- [ ] **Step 3: Implementar**

En `graph.py`:

```python
def _owned_by_app(name: str, self_node_name: str) -> bool:
    return (
        name == self_node_name
        or name.startswith(f"{self_node_name}_")
        or name.startswith(f"{self_node_name}/")
    )
```

- Construir los topics con los endpoints crudos y aplicar `dataclasses.replace` para filtrar `publishers`/`subscribers` con `_owned_by_app` antes de invertirlos (`_topics_by_endpoint`).
- Filtrar `services` y `actions` por clave con el mismo helper.
- La lista de nodos usa ya el nombre completo: sustituir la comparación `!= self._self_node_name` por `not _owned_by_app(...)`.

- [ ] **Step 4: Verificar**

Run: `pytest backend/tests/test_graph.py -v`
Expected: PASS, incluidos los tests existentes de topics sin endpoints.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cotton/ros/graph.py backend/tests/test_graph.py
git commit -m "fix: exclude the app's own nodes from graph endpoints and services"
```

---

### Task 4: Caché de endpoints por topic

**Files:**
- Modify: `backend/src/cotton/ros/graph.py:31-102`
- Test: `backend/tests/test_graph.py`

**Interfaces:**
- Consumes: `RclpyGraphSource(node, self_node_name)` y `ThreadGraphSource(ros)`.
- Produces: `RclpyGraphSource.endpoint_calls` no; en su lugar la caché interna `dict[str, tuple[tuple[str, ...], list[str], list[str]]]` y `ThreadGraphSource` que reutiliza la misma instancia mientras el nodo no cambie.

- [ ] **Step 1: Escribir los tests que fallan**

```python
class CountingNode(FakeNode):
    def __init__(self) -> None:
        self.calls = 0
        self.types: dict[str, list[str]] = {"/chatter": ["std_msgs/msg/String"]}

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
        return list(self.types.items())

    def get_publishers_info_by_topic(self, topic: str) -> list[Endpoint]:
        self.calls += 1
        return super().get_publishers_info_by_topic(topic)


def test_endpoints_are_cached_until_the_topic_types_change() -> None:
    node = CountingNode()
    source = RclpyGraphSource(node, self_node_name="/cotton_1")

    source.snapshot()
    source.snapshot()
    assert node.calls == 1

    node.types["/chatter"] = ["std_msgs/msg/String", "std_msgs/msg/Header"]
    source.snapshot()
    assert node.calls == 2


def test_thread_source_reuses_the_cache_until_the_node_changes() -> None:
    node = CountingNode()
    ros = SimpleNamespace(node=node, node_name="cotton_1")
    source = ThreadGraphSource(ros)  # type: ignore[arg-type]

    source.snapshot()
    source.snapshot()
    assert node.calls == 1

    ros.node = CountingNode()
    source.snapshot()
    assert node.calls == 1  # el nodo viejo no se vuelve a consultar
```

- [ ] **Step 2: Ejecutarlos y verlos fallar**

Run: `pytest backend/tests/test_graph.py -v`
Expected: FAIL (`node.calls == 2` en la segunda llamada; `ThreadGraphSource` no existe como caché).

- [ ] **Step 3: Implementar**

En `RclpyGraphSource.__init__`, añadir `self._cache: dict[str, tuple[tuple[str, ...], list[str], list[str]]] = {}`. Sustituir las dos llamadas inline por:

```python
def _endpoints(self, name: str, types: list[str]) -> tuple[list[str], list[str]]:
    key = tuple(sorted(types))
    cached = self._cache.get(name)
    if cached is not None and cached[0] == key:
        return cached[1], cached[2]
    # shortcut: endpoints refresh only when a topic's types change; upgrade to a
    # periodic full refresh if a publisher appears without a type change.
    publishers = _endpoints(self._node.get_publishers_info_by_topic(name))
    subscribers = _endpoints(self._node.get_subscriptions_info_by_topic(name))
    self._cache[name] = (key, publishers, subscribers)
    return publishers, subscribers
```

En `ThreadGraphSource`, guardar `self._source: RclpyGraphSource | None` y `self._node: object | None`; reconstruir la instancia solo cuando `self._ros.node` no sea el mismo objeto.

- [ ] **Step 4: Verificar**

Run: `pytest backend/tests/test_graph.py backend/tests/test_watcher.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cotton/ros/graph.py backend/tests/test_graph.py
git commit -m "perf: cache graph endpoints until a topic changes"
```

---

### Task 5: Servicios y acciones en la UI del grafo

**Files:**
- Modify: `frontend/src/features/graph/GraphView.tsx:16-76`
- Test: `frontend/src/features/graph/GraphView.test.tsx`

**Interfaces:**
- Consumes: `GraphSnapshot.services: Record<string, string[]>` y `GraphSnapshot.actions` (ya existen).
- Produces: secciones «Servicios» y «Acciones» con nombre y tipos, filtradas por el mismo buscador.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `SNAPSHOT`:

```tsx
services: { "/talker/get_parameters": ["rcl_interfaces/srv/GetParameters"] },
actions: { "/talker/fibonacci": ["action_tutorials_interfaces/action/Fibonacci"] },
```

y estos tests:

```tsx
it("lists services and actions with their types", () => {
  render(<GraphView snapshot={SNAPSHOT} />);

  expect(screen.getByRole("heading", { name: "Servicios" })).toBeInTheDocument();
  expect(screen.getByText("/talker/get_parameters")).toBeInTheDocument();
  expect(screen.getByText("rcl_interfaces/srv/GetParameters")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Acciones" })).toBeInTheDocument();
  expect(screen.getByText("/talker/fibonacci")).toBeInTheDocument();
});

it("filters services and actions with the same search box", () => {
  render(<GraphView snapshot={SNAPSHOT} />);

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en el grafo" }), {
    target: { value: "fibonacci" },
  });

  expect(screen.getByText("/talker/fibonacci")).toBeInTheDocument();
  expect(screen.queryByText("/talker/get_parameters")).not.toBeInTheDocument();
});
```

Actualizar el helper `search` existente a `getByRole("searchbox", { name: "Buscar en el grafo" })` y el `aria-label` del input a `"Buscar en el grafo"`.

- [ ] **Step 2: Ejecutarlos y verlos fallar**

Run: `npm test -- --run src/features/graph/GraphView.test.tsx`
Expected: FAIL (no hay headings «Servicios» ni «Acciones»).

- [ ] **Step 3: Implementar**

- Calcular `services` y `actions` como `Object.entries(...)` filtrados por `needle`.
- Añadir un segundo `<div className="graph-columns">` con dos `<div className="graph-column">`: `<h2>Servicios</h2>` y `<h2>Acciones</h2>`.
- Cada entrada: `<li key={name}><code>{name}</code> {types.join(", ")}</li>`.
- Estados vacíos: `Sin servicios` y `Sin acciones`.
- El `aria-label` del `<input>` pasa a `"Buscar en el grafo"`.

- [ ] **Step 4: Verificar**

Run: `npm test -- --run src/features/graph/GraphView.test.tsx && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/graph/GraphView.tsx frontend/src/features/graph/GraphView.test.tsx
git commit -m "feat: show services and actions in the graph view"
```

---

### Task 6: El panel del plugin usa el puerto real

**Files:**
- Modify: `backend/src/cotton/builtin_plugins/foxglove/plugin.yaml:24`
- Modify: `frontend/src/features/plugins/PluginPanel.tsx:13`
- Test: `frontend/src/features/plugins/PluginPanel.test.tsx`, `backend/tests/test_plugin_loader.py`

**Interfaces:**
- Consumes: `PluginPanelSpec.url` con placeholders `{hostname}` y `{host}`.
- Produces: `{host}` se sustituye por `location.host` (host y puerto); `{hostname}` sigue siendo solo el host.

- [ ] **Step 1: Escribir los tests que fallan**

Frontend:

```tsx
it("replaces {host} with host and port for a custom port", () => {
  render(
    <PluginPanel
      plugin={PLUGIN}
      panel={{
        id: "viewer",
        title: "Foxglove",
        type: "iframe",
        url: "http://{host}/lichtblick/index.html",
      }}
      onClose={() => {}}
    />,
  );

  expect(screen.getByTitle("Foxglove")).toHaveAttribute(
    "src",
    `http://${location.host}/lichtblick/index.html`,
  );
});
```

Backend:

```python
def test_builtin_foxglove_panel_uses_the_runtime_port() -> None:
    plugin = next(
        item for item in PluginLoader(BUILTIN_PLUGINS_DIR).discover() if item.name == "foxglove"
    )

    url = plugin.manifest.panels[0].url
    assert url is not None
    assert ":8000" not in url
    assert "http://{host}/" in url
    assert "ws://{hostname}:8765" in url
```

- [ ] **Step 2: Ejecutarlos y verlos fallar**

Run: `pytest backend/tests/test_plugin_loader.py::test_builtin_foxglove_panel_uses_the_runtime_port -v`
Run: `npm test -- --run src/features/plugins/PluginPanel.test.tsx`
Expected: FAIL en ambos.

- [ ] **Step 3: Implementar**

`PluginPanel.tsx`:

```tsx
const src =
  panel.url
    ?.replaceAll("{hostname}", location.hostname)
    .replaceAll("{host}", location.host) ?? null;
```

`plugin.yaml`: la URL del panel queda

```yaml
url: "http://{host}/lichtblick/index.html?ds=foxglove-websocket&ds.url=ws://{hostname}:8765&layoutUrl=http://{host}/lichtblick/layout.json"
```

El puente sigue en `8765`; solo cambia el puerto de la app.

- [ ] **Step 4: Verificar**

Run: `pytest backend/tests/test_plugin_loader.py -v && npm test -- --run src/features/plugins/PluginPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/cotton/builtin_plugins/foxglove/plugin.yaml backend/tests/test_plugin_loader.py frontend/src/features/plugins/PluginPanel.tsx frontend/src/features/plugins/PluginPanel.test.tsx
git commit -m "fix: load the foxglove panel from the real app port"
```

---

### Task 7: CI que también prueba el frontend

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `frontend/package-lock.json`, scripts `lint`, `typecheck`, `test`.
- Produces: job `frontend` en Node 20.

- [ ] **Step 1: Añadir el job**

```yaml
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Types
        run: npm run typecheck
      - name: Tests
        run: npm test -- --coverage
```

- [ ] **Step 2: Verificar el YAML y los mismos comandos en local**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Run: `cd frontend && npm run lint && npm run typecheck && npm test -- --coverage`
Expected: YAML válido y los tres comandos en verde.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, typecheck and test the frontend"
```

---

### Task 8: Procesos activos y errores en la barra de estado

**Files:**
- Modify: `frontend/src/layout/StatusBar.tsx:9-26`
- Test: `frontend/src/layout/StatusBar.test.tsx`

**Interfaces:**
- Consumes: `StoreState.processes: Record<string, ProcessRecord>`.
- Produces: `Procesos <n>` con `starting`+`running`; `Errores <n>` solo si hay `failed`.

- [ ] **Step 1: Escribir el test que falla**

```tsx
it("counts running processes and failed ones", () => {
  useStore.setState({
    processes: {
      a: processRecord("a", "running"),
      b: processRecord("b", "starting"),
      c: processRecord("c", "failed"),
    },
  });

  render(<StatusBar />);

  expect(screen.getByText("Procesos 2")).toBeInTheDocument();
  expect(screen.getByText("Errores 1")).toBeInTheDocument();
});
```

Añadir el helper al principio del fichero:

```tsx
function processRecord(id: string, state: ProcessRecord["state"]): ProcessRecord {
  return {
    id,
    spec: { id, argv: ["ros2", "run"], cwd: null, env: {}, plugin: null, autostart: false },
    state,
    pid: null,
    pgid: null,
    started_at: null,
    exit_code: null,
    error: null,
    recovered: false,
  };
}
```

y resetear `processes: {}` en el `beforeEach` existente.

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `npm test -- --run src/layout/StatusBar.test.tsx`
Expected: FAIL (`Procesos 2` no existe).

- [ ] **Step 3: Implementar**

En `StatusBar`, leer `processes` del store y calcular:

```tsx
const running = Object.values(processes).filter(
  (record) => record.state === "starting" || record.state === "running",
).length;
const failed = Object.values(processes).filter((record) => record.state === "failed").length;
```

Renderizar `<span>Procesos {running}</span>` antes del estado de ROS, y `{failed > 0 && <span className="status-off">Errores {failed}</span>}`.

- [ ] **Step 4: Verificar**

Run: `npm test -- --run src/layout/StatusBar.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/layout/StatusBar.tsx frontend/src/layout/StatusBar.test.tsx
git commit -m "feat: show running processes and failures in the status bar"
```

---

### Task 9: Quitar el panel Ajustes vacío

**Files:**
- Modify: `frontend/src/layout/shellPanels.ts:4-9`
- Test: `frontend/src/layout/Workbench.test.tsx:100-119`

**Interfaces:**
- Consumes: `registerShellPanels()`.
- Produces: tres paneles de shell (`graph`, `processes`, `plugins`).

Decisión: la selección de distro/dominio/workspace desde la UI (RF-3) choca con el modelo «una instancia = un entorno» del diseño; no está en las etapas 1–3. Se elimina el placeholder en lugar de dejar una pestaña que no hace nada.

- [ ] **Step 1: Actualizar el test**

En `Workbench.test.tsx`, cambiar `times(4)` a `times(3)`, `"graph,processes,plugins,settings"` a `"graph,processes,plugins"` y la lista de nombres a `["Grafo", "Procesos", "Plugins"]`.

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `npm test -- --run src/layout/Workbench.test.tsx`
Expected: FAIL (siguen existiendo cuatro paneles).

- [ ] **Step 3: Implementar**

Borrar la línea `{ id: "settings", title: "Ajustes" },` de `shellPanels.ts`.

- [ ] **Step 4: Verificar**

Run: `npm test -- --run src/layout/Workbench.test.tsx && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/layout/shellPanels.ts frontend/src/layout/Workbench.test.tsx
git commit -m "refactor: drop the empty settings panel"
```

---

### Task 10: Alinear la documentación con el código

**Files:**
- Create: `tasks.md`
- Modify: `docs/superpowers/tasks/2026-11-06-ros-studio-design.md:3,23-32,67-72`
- Modify: `docs/superpowers/specs/2026-11-06-ros-studio-design.md:5,73`
- Modify: `docs/etapa-0-mediciones.md:65-68`

**Interfaces:**
- Consumes: estado real tras las tareas 1–9.
- Produces: enlaces válidos, afirmaciones de rendimiento verdaderas y gates con evidencia.

- [ ] **Step 1: Crear `tasks.md` en la raíz**

```markdown
# Tareas

El tracker real está en
[`docs/superpowers/tasks/2026-11-06-ros-studio-design.md`](../tasks/2026-11-06-ros-studio-design.md).
Este fichero existe para que las referencias de `AGENTS.md` resuelvan.
```

- [ ] **Step 2: Arreglar los enlaces del índice**

- Cabecera: `../plans/2026-11-06-ros-studio-mvp.md`, `../specs/2026-11-06-ros-studio-design.md` y `../../Spec%20IDE%20local%20para%20ROS%202.md`.
- Tabla: `2026-11-06-ros-studio-design/00-foundation.md`, etc.
- En el spec, `../../../Spec...` pasa a `../../Spec...`.

Verificar que no queda ningún enlace roto:

```bash
cd docs/superpowers/tasks && grep -o '](\([^)]*\))' 2026-11-06-ros-studio-design.md
```

- [ ] **Step 3: Corregir las afirmaciones de rendimiento**

En el diseño, sustituir la línea 73 por el comportamiento real: snapshot completo cada segundo, sondeo de nombres y tipos, caché de editores/suscriptores por topic hasta que cambien los tipos, y deltas diferidos a la etapa 4.

En `docs/etapa-0-mediciones.md`, sustituir «con la caché y las consultas perezosas de endpoints que ya prevé el diseño (solo topics cambiados)» por la caché implementada y su límite (un publisher nuevo en un topic sin cambio de tipos no se ve hasta el siguiente cambio).

- [ ] **Step 4: Marcar los gates con evidencia**

- Etapa 1: marcar `[x]` solo si se ejecutó la comprobación contra `ros2`; si no, dejarlo `[ ]` con la nota «pendiente de entorno ROS (ver `docs/verification-ros.md`)».
- Etapas 0, 2 y 3: mismo criterio; la etapa 0 mantiene Ubuntu bloqueado.
- No marcar nada cuya evidencia no exista en el repositorio.

- [ ] **Step 5: Verificar y commit**

Run: `git diff --check`
Expected: sin errores de whitespace ni enlaces evidentes rotos.

```bash
git add tasks.md docs/superpowers docs/etapa-0-mediciones.md
git commit -m "docs: align plans, gates and performance claims with the code"
```

---

### Task 11: Runbook para las verificaciones que necesitan ROS

**Files:**
- Create: `docs/verification-ros.md`

**Interfaces:**
- Consumes: `docker/compose.yaml`, `frontend/e2e/mvp.spec.ts`.
- Produces: comandos reproducibles para `T034`, `T069`, `T070`, `T200` y el E2E.

- [ ] **Step 1: Escribir el runbook**

Incluir, con el resultado esperado de cada uno:

```bash
# T034 — Ubuntu con venv --system-site-packages
python3 -m venv --system-site-packages /tmp/rs
/tmp/rs/bin/pip install dist/cotton-0.1.0-py3-none-any.whl
/tmp/rs/bin/python -c "import rclpy, cotton; print('ok')"

# T069/T070 — parámetros remotos contra un nodo real
ros2 run demo_nodes_cpp parameter_blackboard &
cotton --no-browser --token test-token &
curl -s -H 'Authorization: Bearer test-token' \
  'http://127.0.0.1:8000/api/nodes//parameter_blackboard/params'

# T200 — healthcheck del puente
ros2 launch foxglove_bridge foxglove_bridge_launch.xml port:=8765 &
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/api/plugins

# E2E
docker compose -f docker/compose.yaml up --build -d
cd frontend && npm run e2e
docker compose -f docker/compose.yaml down
```

- [ ] **Step 2: Enlazar el runbook desde `tasks.md` y desde el índice**

Añadir una línea en ambos: «Verificaciones con ROS: `docs/verification-ros.md`».

- [ ] **Step 3: Verificar**

Run: `git diff --check`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add docs/verification-ros.md tasks.md docs/superpowers/tasks/2026-11-06-ros-studio-design.md
git commit -m "docs: add the ROS verification runbook"
```

---

## Cierre

Tras la última tarea:

```bash
ruff check backend && ruff format --check backend && mypy backend/src
pytest -m "not integration" --cov=cotton --cov-fail-under=80
cd frontend && npm run lint && npm run typecheck && npm test -- --coverage
```

Expected: todo en verde y cobertura ≥ 80 % en ambos lados. Los cuatro puntos que siguen dependiendo de ROS (`T034`, `T069`, `T070`, `T200`) quedan `[!]` con el runbook como evidencia de cómo cerrarlos.
