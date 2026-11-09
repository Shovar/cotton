# 03 — Procesos

**Objetivo:** gestionar hijos con grupo propio, logs con nivel y rotación, recuperación tras caída y perfiles de lanzamiento.

**Depende de:** 00-foundation (Database v1, EventBus, WebSocket y contrato REST/WS).

**Desbloquea a:** 07-ui-processes, el plugin de Foxglove y delivery.

## Reglas de este fichero

- La API solo habla con `ProcessManager`; el plugin lo hace contra el puerto `ProcessPort`.
- Nunca `shell=True`: siempre `argv` y `shlex.split` en el borde.
- La migración v2 (perfiles) es la única que se crea en este fichero.
- Los logs se guardan en disco además de en memoria: la UI no es la fuente de verdad.

## Bloque P1 — Modelos de proceso y logs

- [x] **T113 · 10 min** — Escribir el test del buffer circular e implementarlo. **Hecho:** conserva las últimas 3 líneas.
- [x] **T114 · 10 min** — Escribir el test del parser de nivel e implementarlo (`[WARN]` → `warn`). **Hecho:** el test pasa.
- [x] **T115 · 5 min** — Escribir el test de rotación de fichero. **Hecho:** aparecen `.log.1` y `.log.2`.
- [x] **T116 · 15 min** — Implementar `LogFileWriter` con límite de 5 MB y 3 copias. **Hecho:** T115 en verde.
- [x] **T117 · 10 min** — Crear `ProcessSpec`, `ProcessRecord`, `ProcessState` y `LogLine`. **Hecho:** serializan a JSON.
- [x] **T118 · 10 min** — Checks y commit `feat: add process models and rotating logs with levels`. **Hecho:** commit creado.

## Bloque P2 — ProcessManager

- [x] **T119 · 10 min** — Escribir el test de arranque con log y parada ordenada. **Hecho:** falla por módulo ausente.
- [x] **T120 · 15 min** — Implementar `start` con `create_subprocess_exec` y grupo propio. **Hecho:** el proceso aparece `running`.
- [x] **T121 · 15 min** — Implementar lectores de stdout/stderr que llenan buffer, fichero y evento. **Hecho:** el test ve la línea «hola».
- [x] **T122 · 10 min** — Implementar la tarea `wait()` que fija `exited`/`failed` y publica estado. **Hecho:** el estado final es correcto.
- [x] **T123 · 10 min** — Escribir y resolver el test de comando inexistente (`failed` con error). **Hecho:** no queda en `starting`.
- [x] **T124 · 5 min** — Escribir y resolver el test de salida distinta de cero (`exit_code == 3`). **Hecho:** el test pasa.
- [x] **T125 · 10 min** — Escribir y resolver el test de id duplicado (`ProcessConflict`). **Hecho:** el test pasa.
- [x] **T126 · 15 min** — Escribir el test de parada con hijo que ignora `SIGINT`. **Hecho:** falla antes de implementar la escalada.
- [x] **T127 · 15 min** — Implementar la escalada `SIGINT` → 5 s → `SIGTERM` → 3 s → `SIGKILL`. **Hecho:** T126 en verde y grupo vacío.
- [x] **T128 · 10 min** — Implementar `shutdown()` en orden inverso y `logs(id)`. **Hecho:** no quedan procesos hijos.
- [x] **T129 · 10 min** — Checks y commit `feat: manage child processes with ordered shutdown`. **Hecho:** commit creado.

## Bloque P3 — Registro y recuperación

- [x] **T132 · 10 min** — Escribir el test de `ProcessRegistry` (save/all/delete). **Hecho:** falla como se espera.
- [x] **T133 · 10 min** — Implementar el registro sobre SQLite. **Hecho:** T132 en verde.
- [x] **T134 · 10 min** — Escribir el test de recuperación de un proceso vivo. **Hecho:** falla por `recover` ausente.
- [x] **T135 · 15 min** — Implementar `recover()` con `os.kill(pid, 0)` y `recovered=True`. **Hecho:** T134 en verde.
- [x] **T136 · 10 min** — Escribir y resolver el caso de PID muerto que se borra del registro. **Hecho:** la lista queda vacía.
- [x] **T137 · 10 min** — Enganchar `recover()` al arranque y `shutdown()` al cierre de la app. **Hecho:** los hijos mueren al cerrar.
- [x] **T138 · 10 min** — Checks y commit `feat: persist process registry and recover orphans`. **Hecho:** commit creado.

## Bloque P4 — API y WS de procesos

- [ ] **T139 · 10 min** — Escribir el test de crear, listar y parar un proceso. **Hecho:** falla por rutas ausentes.
- [ ] **T140 · 15 min** — Implementar las rutas REST de procesos y el estado 201. **Hecho:** T139 en verde.
- [ ] **T141 · 10 min** — Escribir y resolver el test de `command` string con `shlex.split`. **Hecho:** `["sleep", "30"]`.
- [ ] **T142 · 10 min** — Mapear `ProcessConflict` a 409 y `ProcessNotFound` a 404. **Hecho:** tests de ambos.
- [ ] **T143 · 10 min** — Implementar `GET /logs?lines=` con límite 1–2000. **Hecho:** devuelve las últimas líneas.
- [ ] **T144 · 10 min** — Escribir el test de backfill por WS (`processes` + `logs:id`). **Hecho:** falla antes de implementar.
- [ ] **T145 · 15 min** — Implementar los canales WS y el reenvío inicial de estado y logs. **Hecho:** T144 en verde.
- [ ] **T146 · 10 min** — Checks y commit `feat: expose process api and websocket channels`. **Hecho:** commit creado.

## Bloque P5 — Perfiles

- [ ] **T147 · 10 min** — Añadir la migración v2 con tabla `profiles`. **Hecho:** `user_version` pasa a 2.
- [ ] **T148 · 10 min** — Escribir el test de `ProfileRepository` (upsert/list/delete). **Hecho:** falla por módulo ausente.
- [ ] **T149 · 10 min** — Implementar el repositorio. **Hecho:** T148 en verde.
- [ ] **T150 · 10 min** — Escribir los tests de las rutas de perfiles. **Hecho:** fallan por rutas ausentes.
- [ ] **T151 · 15 min** — Implementar `POST`/`PUT`/`DELETE /api/profiles`. **Hecho:** T150 en verde.
- [ ] **T152 · 10 min** — Escribir y resolver el arranque con fallo: para los ya arrancados y responde 409. **Hecho:** el test pasa.
- [ ] **T153 · 10 min** — Checks y commit `feat: persist and launch process profiles`. **Hecho:** commit creado.

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

- [ ] Arrancar, parar y reiniciar no deja huérfanos; la escalada termina en `SIGKILL`.
- [ ] Un proceso vivo sobrevive a `kill -9` del padre y se recupera al arrancar la app.
- [ ] Los logs llegan por WS, se filtran por nivel y se descargan.
- [ ] Los perfiles se guardan, se lanzan en orden y fallan con 409 si uno no arranca.
