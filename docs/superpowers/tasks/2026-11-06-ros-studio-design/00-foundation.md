# 00 — Foundation

**Objetivo:** dejar el repositorio, el entorno ROS, el hilo `rclpy`, el bus, el WebSocket, la seguridad y la base de datos listos para que el resto de ficheros trabaje contra contratos estables.

**Depende de:** nada.

**Desbloquea a:** todos los demás ficheros.

## Reglas de este fichero

- Es el único fichero que crea `app.py`, `cli.py`, `Services` y las migraciones base.
- Los demás ficheros añaden rutas y servicios desde su propio módulo; no reescriben `app.py`.
- `docs/contracts/api.md` (T214) es la fuente de verdad de endpoints, eventos y errores.
- Migraciones reservadas: v1 registro de procesos, v2 perfiles, v3 settings. Ningún otro fichero crea versiones nuevas.
- Socket.IO, ORM, DI container o capas vacías: no. Arquitectura hexagonal flexible, sin esqueletos especulativos.

## Bloque F1 — Repositorio y tooling

- [x] **T001 · 5 min** — Inicializar git (`git init -b main`) y crear `backend/src/ros_studio`, `backend/tests`, `docs`, `.github/workflows`. **Hecho:** `git status` funciona y los directorios existen.
- [x] **T002 · 5 min** — Crear `.gitignore` con `.venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `dist/`, `frontend/node_modules/`, `frontend/dist/`, `backend/src/ros_studio/web/`, `*.db`. **Hecho:** `git status` no muestra ruido.
- [x] **T003 · 5 min** — Añadir `LICENSE` con el texto Apache-2.0. **Hecho:** el fichero empieza por «Apache License» y tiene 2.0.
- [x] **T004 · 5 min** — Crear `README.md` con una descripción de tres líneas y enlaces a spec, diseño, plan y tareas. **Hecho:** los enlaces resuelven.
- [x] **T005 · 10 min** — Crear `pyproject.toml` con hatchling, `ros-studio`, Python `>=3.10`, dependencias `fastapi`, `uvicorn[standard]`, `pydantic`, `PyYAML`, `platformdirs` y extra `dev`. **Hecho:** `python -m build --sdist` no falla por configuración.
- [x] **T006 · 5 min** — Crear `backend/src/ros_studio/__init__.py` con `__version__ = "0.1.0"`. **Hecho:** `python -c "import ros_studio; print(ros_studio.__version__)"` imprime la versión tras instalar.
- [x] **T007 · 10 min** — Escribir `backend/tests/test_package.py` y configurar pytest (`testpaths`, `asyncio_mode`, marcador `integration`). **Hecho:** el test pasa.
- [x] **T008 · 10 min** — Crear `.venv`, instalar `-e ".[dev]"` y ejecutar `pytest`. **Hecho:** la suite colecta y pasa.
- [x] **T009 · 10 min** — Configurar `ruff` y `mypy` (con `ignore_missing_imports` para `rclpy.*`, `rcl_interfaces.*`, `rosidl_runtime_py.*`). **Hecho:** `ruff check backend && mypy backend/src` pasa.
- [x] **T010 · 10 min** — Crear `.github/workflows/ci.yml` con matrix Python 3.10/3.12, ruff, mypy y `pytest -m "not integration"`. **Hecho:** el YAML es válido y los comandos son los mismos que en local.
- [x] **T011 · 10 min** — Ejecutar checks completos y commit `chore: bootstrap ros-studio repository`. **Hecho:** `git log -1` muestra el commit.

## Bloque F2 — Contrato REST/WS

- [x] **T214 · 10 min** — Escribir `docs/contracts/api.md` con endpoints, modelos, códigos de error, canales WS, eventos y cabeceras de auth. **Hecho:** cada fichero de feature referencia el contrato y no inventa campos.

## Bloque F3 — Entorno ROS y API base

- [x] **T036 · 10 min** — Escribir el test de `detect_environment` con `ROS_DISTRO`, dominio, RMW y workspace. **Hecho:** el test existe y falla por módulo ausente.
- [x] **T037 · 10 min** — Escribir los tests de distro ausente y dominio inválido con mensajes accionables. **Hecho:** ambos fallan como se espera.
- [x] **T038 · 15 min** — Implementar `EnvironmentInfo` y `detect_environment`; derivar workspace del padre de `COLCON_PREFIX_PATH`. **Hecho:** T036 en verde.
- [x] **T039 · 10 min** — Implementar `ensure_ros_environment` y `RosEnvironmentError` comprobando `rclpy`, `AMENT_PREFIX_PATH` y `ros2` en `PATH`. **Hecho:** T037 en verde.
- [x] **T040 · 10 min** — Crear `errors.py` con `ApiError` y el handler `{code, message}`. **Hecho:** un endpoint de prueba devuelve el formato.
- [x] **T041 · 10 min** — Crear `create_app(env)` y `GET /api/env`; test con `TestClient`. **Hecho:** responde 200 con la distro.
- [x] **T042 · 10 min** — Añadir `cli.py` y `__main__.py` con `--host`, `--port`, `--no-browser` y `uvicorn.run`. **Hecho:** `ros-studio --help` lista las opciones.
- [x] **T043 · 10 min** — Ejecutar tests, ruff y mypy; commit `feat: detect ros environment and expose /api/env`. **Hecho:** commit creado.

## Bloque F4 — Hilo ROS

- [x] **T044 · 10 min** — Escribir el test de `RosThread.call` con un doble que ejecuta una función. **Hecho:** falla por módulo ausente.
- [x] **T045 · 10 min** — Escribir el test de timeout con una función que duerme. **Hecho:** falla como se espera.
- [x] **T046 · 15 min** — Implementar el esqueleto de `RosThread` con hilo, cola de trabajos y futuros. **Hecho:** T044 en verde.
- [x] **T047 · 10 min** — Implementar `_setup`/`_spin_once`/`_teardown` con `rclpy` importado en runtime. **Hecho:** el hilo arranca y para sin dejar hilos.
- [x] **T048 · 10 min** — Añadir el test de integración marcado `integration` con un `RosThread` real. **Hecho:** se salta sin ROS y pasa con ROS.
- [x] **T049 · 10 min** — Checks y commit `feat: add single-owner ros thread with command queue`. **Hecho:** commit creado.

## Bloque F5 — Bus de eventos y WebSocket genérico

- [ ] **T057 · 10 min** — Escribir el test de fan-out de `EventBus` e implementarlo. **Hecho:** dos suscriptores reciben el evento.
- [ ] **T063 · 15 min** — Implementar `/ws` con `subscribe`, un registro de canales y reenvío de eventos; cada feature registra su canal. **Hecho:** un cliente suscrito recibe los eventos del bus.
- [ ] **T064 · 10 min** — Escribir el test del WebSocket con `TestClient` sobre un canal de prueba. **Hecho:** el test recibe el mensaje y lo valida.
- [ ] **T065 · 10 min** — Enganchar arranque/parada del watcher al `lifespan` y al CLI. **Hecho:** no quedan tareas al cerrar.
- [ ] **T066 · 10 min** — Checks y commit `feat: stream graph snapshots over websocket`. **Hecho:** commit creado.

## Bloque F6 — Servido de la SPA

- [ ] **T089 · 10 min** — Escribir el test de `mount_spa` (index, fallback y `/api` 404). **Hecho:** falla por función ausente.
- [ ] **T090 · 10 min** — Implementar `mount_spa` en el backend y pasarlo desde el CLI. **Hecho:** T089 en verde.

## Bloque F7 — Token de sesión y Origin

- [ ] **T104 · 10 min** — Escribir los tests de `Auth` (token correcto/incorrecto y generación aleatoria). **Hecho:** fallan por módulo ausente.
- [ ] **T105 · 10 min** — Implementar `Auth` con `secrets.compare_digest`. **Hecho:** T104 en verde.
- [ ] **T106 · 10 min** — Añadir la dependencia `require_auth` y el 401 `{code: "unauthorized"}`. **Hecho:** `/api/env` exige token.
- [ ] **T107 · 5 min** — Añadir `GET /api/health` sin token y su test. **Hecho:** responde 200.
- [ ] **T108 · 10 min** — Configurar CORS sin comodines y el test de origen desconocido. **Hecho:** no aparece `access-control-allow-origin`.
- [ ] **T109 · 15 min** — Validar token y `Origin` en `/ws` antes de aceptar; cierre 1008. **Hecho:** el test de origen malo pasa.
- [ ] **T110 · 10 min** — Generar token en el CLI, abrir `#token=...` y aceptar `--token` solo para automatización. **Hecho:** el navegador recibe el token.
- [ ] **T111 · 10 min** — Actualizar los fixtures de tests existentes con cabeceras de autenticación. **Hecho:** toda la suite pasa.
- [ ] **T112 · 10 min** — Checks y commit `feat: require session token and validate websocket origin`. **Hecho:** commit creado.

## Bloque F8 — SQLite base

- [ ] **T130 · 10 min** — Escribir el test de migración de `Database` y `user_version()`. **Hecho:** falla por módulo ausente.
- [ ] **T131 · 10 min** — Implementar `Database` con WAL y migración v1. **Hecho:** T130 en verde.

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

Frontend (cuando exista el build):

```bash
npm install
npm run lint
npm run typecheck
npm test -- --coverage
```

## Gate de cierre

- [ ] `ruff`, `mypy` y `pytest` en verde con cobertura ≥ 80 %.
- [ ] `/api/health` responde sin token; el resto exige Bearer y el WS valida `Origin`.
- [ ] `GET /api/env` devuelve distro, dominio, RMW y workspace.
- [ ] El WebSocket entrega eventos de un canal de prueba y cierra limpio al apagar.
- [ ] `user_version = 1` con la tabla `process_registry`.
