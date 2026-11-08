# 02 — Descubrimiento ROS

**Objetivo:** implementar el snapshot del grafo, el watcher, los parámetros remotos y la medición de frecuencia sobre el hilo ROS de foundation.

**Depende de:** 00-foundation (RosThread, EventBus, WebSocket y contrato REST/WS).

**Desbloquea a:** 06-ui-graph y el canal `graph` del WebSocket.

## Reglas de este fichero

- No importa FastAPI ni React. `GraphSource` habla con `rclpy`; la API traduce a DTOs.
- Toda llamada a `rclpy` pasa por `RosThread.call`; nunca se gira desde el hilo de la API.
- Los modelos de respuesta siguen `docs/contracts/api.md`; no se añaden campos ad hoc.
- El canal `graph` se registra aquí, no en foundation.

## Bloque D1 — Modelos y GraphSource

- [ ] **T050 · 10 min** — Crear `models.py` con `NodeInfo`, `TopicInfo` y `GraphSnapshot`. **Hecho:** instancian y serializan.
- [ ] **T051 · 10 min** — Crear el `FakeNode` del test y comprobar que el nodo propio se excluye. **Hecho:** el test falla por implementación ausente.
- [ ] **T052 · 5 min** — Añadir el test de topic sin editores ni suscriptores. **Hecho:** el test existe.
- [ ] **T053 · 15 min** — Implementar `snapshot()` para nodos y topics, invirtiendo endpoints. **Hecho:** T051 y T052 en verde.
- [ ] **T054 · 10 min** — Añadir servicios y acciones por prefijo de nodo. **Hecho:** el test comprueba `/talker/get_parameters`.
- [ ] **T055 · 5 min** — Ordenar listas y fijar `revision = 0` en el snapshot. **Hecho:** el orden es estable.
- [ ] **T056 · 10 min** — Checks y commit `feat: add rclpy graph source and models`. **Hecho:** commit creado.

## Bloque D2 — Watcher y estado de conexión

- [ ] **T058 · 10 min** — Escribir el test de watcher que solo emite al cambiar el snapshot. **Hecho:** falla por módulo ausente.
- [ ] **T059 · 15 min** — Implementar `GraphWatcher.run`, comparación por JSON y `current()`. **Hecho:** T058 en verde.
- [ ] **T060 · 10 min** — Escribir el test de `ros.status` cuando el snapshot lanza. **Hecho:** el test existe.
- [ ] **T061 · 10 min** — Implementar `connected=False`, backoff 1→30 s y recuperación. **Hecho:** T060 en verde.
- [ ] **T062 · 10 min** — Añadir `GET /api/graph` con el snapshot actual. **Hecho:** responde 200 con listas.

## Bloque D3 — Canal WS del grafo

- [ ] **T216 · 5 min** — Registrar el canal `graph` en el registro del WebSocket y enviar el snapshot inicial al suscribirse. **Hecho:** un cliente suscrito a `graph` recibe `graph.update` al conectar.

## Bloque D4 — Parámetros remotos

- [ ] **T067 · 10 min** — Escribir los tests de `coerce_value` para bool, int, float, string y arrays. **Hecho:** fallan por módulo ausente.
- [ ] **T068 · 10 min** — Implementar `coerce_value` con error que nombra el tipo esperado. **Hecho:** T067 en verde.
- [ ] **T069 · 15 min** — Implementar `RemoteParams.get_all` y `set` con clientes de servicio. **Hecho:** un nodo real devuelve sus parámetros.
- [ ] **T070 · 10 min** — Añadir `spin_until_future_complete` durante la espera para no bloquear sin girar. **Hecho:** la llamada devuelve en menos del timeout.
- [ ] **T071 · 15 min** — Crear `GET`/`PUT /api/nodes/{node_name:path}/params` con validación de nombre. **Hecho:** los tests de API pasan.
- [ ] **T072 · 10 min** — Mapear nodo inexistente a 404 y parámetro no escribible a 409. **Hecho:** hay tests para ambos.
- [ ] **T073 · 10 min** — Checks y commit `feat: read and write remote ros parameters`. **Hecho:** commit creado.

## Bloque D5 — Frecuencia de topic

- [ ] **T074 · 5 min** — Escribir los tests de `compute_hz`. **Hecho:** fallan por módulo ausente.
- [ ] **T075 · 5 min** — Escribir el test de topic sin editores (`no_publishers`). **Hecho:** el test existe.
- [ ] **T076 · 15 min** — Implementar `measure_rate` con nodo temporal, QoS del editor y ventana de 2 s. **Hecho:** T074 y T075 en verde.
- [ ] **T077 · 10 min** — Crear `GET /api/topics/{topic:path}/rate`. **Hecho:** responde `available` y `hz`.
- [ ] **T078 · 10 min** — Traducir topic inexistente a 404 y limitar `window_s` a `[0.5, 5]`. **Hecho:** tests de ambos casos.
- [ ] **T079 · 10 min** — Checks y commit `feat: measure topic rate on demand`. **Hecho:** commit creado.

## Verificación

```bash
python -m venv .venv --system-site-packages
source .venv/bin/activate
pip install -e ".[dev]"
ruff check backend
ruff format --check backend
mypy backend/src
pytest -m "not integration" --cov=ros_studio --cov-fail-under=80
```

## Gate de cierre

- [ ] Un test de integración compara nodos y topics con `ros2 node list` y `ros2 topic list`.
- [ ] El grafo se refresca en menos de 2 s y `ros.status` refleja la desconexión.
- [ ] Leer y escribir un parámetro remoto funciona en un nodo real.
- [ ] `/api/topics/{topic}/rate` devuelve `hz > 0` con turtlesim.
