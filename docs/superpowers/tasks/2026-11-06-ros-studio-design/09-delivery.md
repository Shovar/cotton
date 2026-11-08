# 09 — Docker, integración, E2E y documentación

**Objetivo:** empaquetar el wheel con la web, construir la imagen ROS, ejecutar integración y E2E, y documentar la instalación.

**Depende de:** todos los ficheros anteriores.

**Desbloquea a:** nada: cierra el MVP.

## Reglas de este fichero

- No añade features; solo empaqueta, verifica y documenta.
- La imagen publica solo `127.0.0.1:8000` y `127.0.0.1:8765`.
- El wheel incluye `frontend/dist`; el Dockerfile lo copia antes de `python -m build`.
- Los tests de integración se marcan `integration` y se saltan sin ROS.

## Bloque E1 — Integración backend

- [ ] **T202 · 15 min** — Escribir el test de integración que compara nodos/topics con `ros2` y mide `/turtle1/pose`. **Hecho:** falla sin turtlesim.
- [ ] **T203 · 10 min** — Implementar el helper `wait_until` y el arranque/parada de turtlesim en el test. **Hecho:** el test pasa con ROS.

## Bloque E2 — E2E

- [ ] **T204 · 10 min** — Crear `playwright.config.ts` y el esqueleto de `e2e/mvp.spec.ts`. **Hecho:** Playwright arranca.
- [ ] **T205 · 15 min** — Implementar el flujo E2E: token, arranque, grafo, frecuencia, parada y Foxglove. **Hecho:** el test pasa contra Docker.

## Bloque E3 — Docker

- [ ] **T206 · 15 min** — Crear la etapa Node del Dockerfile que compila el frontend y lo copia al paquete. **Hecho:** existe `frontend/dist`.
- [ ] **T207 · 15 min** — Crear la etapa ROS del Dockerfile con venv y wheel. **Hecho:** `ros-studio --help` funciona en la imagen.
- [ ] **T208 · 10 min** — Crear `compose.yaml` con workspace y puertos `127.0.0.1:8000`/`8765`. **Hecho:** `docker compose config` es válido.

## Bloque E4 — CI

- [ ] **T209 · 15 min** — Añadir el workflow de integración con matrix Humble/Jazzy. **Hecho:** el YAML es válido y ejecuta `pytest -m integration`.

## Bloque E5 — Documentación

- [ ] **T210 · 15 min** — Escribir `docs/install.md` con pixi, apt, Docker, WSL2 y el reinicio por dominio. **Hecho:** los tres caminos están completos.
- [ ] **T211 · 5 min** — Enlazar spec, diseño, plan, tareas e instalación desde el README. **Hecho:** los enlaces resuelven.

## Bloque E6 — Cierre

- [ ] **T212 · 15 min** — Construir la imagen, ejecutar integración y E2E, y repetir la medición de 100 topics. **Hecho:** todo en verde y medición anotada.
- [ ] **T213 · 5 min** — Commit `feat: add docker image, integration tests and install docs`. **Hecho:** commit creado.

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

Frontend:

```bash
npm install
npm run lint
npm run typecheck
npm test -- --coverage
```

## Gate de cierre

- [ ] `docker compose config` es válido y la imagen arranca.
- [ ] Integración y E2E en verde contra Docker.
- [ ] `docs/install.md` cubre pixi, apt, Docker y WSL2.
- [ ] La medición de 100 topics se repite y queda anotada.
