# 04 — Plugins y Foxglove

**Objetivo:** cargar manifiestos, activar plugins con dependencias y healthchecks, persistir el estado y servir Lichtblick con un layout por defecto.

**Depende de:** 00-foundation y el puerto `ProcessPort` (puede desarrollarse contra un doble).

**Desbloquea a:** 08-ui-plugins, delivery y el criterio de la fase 3.

## Reglas de este fichero

- La integración real con Foxglove necesita 03-processes; hasta entonces se usa un `ProcessPort` falso.
- La migración v3 (`settings`) es la única que se crea en este fichero.
- Los manifiestos se validan en el borde: ids, `requires`, argv y URLs.
- Los assets de Lichtblick se verifican con sha256; nunca se sirve una descarga sin comprobar.

## Bloque X1 — Manifiestos y loader

- [ ] **T165 · 15 min** — Crear los modelos `PluginProcessSpec`, `PanelSpec`, `PluginManifest` y `DiscoveredPlugin`. **Hecho:** validan un YAML mínimo.
- [ ] **T166 · 10 min** — Añadir validadores de ids únicos, `requires` existentes y URL obligatoria. **Hecho:** los casos inválidos fallan con mensaje.
- [ ] **T167 · 10 min** — Escribir el test de manifiesto válido y `argv`. **Hecho:** falla por loader ausente.
- [ ] **T168 · 15 min** — Implementar `PluginLoader.discover` para builtin y usuario. **Hecho:** T167 en verde.
- [ ] **T169 · 10 min** — Escribir y resolver el test de `requires` inexistente sin romper el resto. **Hecho:** se guarda `error` y sigue.
- [ ] **T170 · 10 min** — Implementar la prioridad del plugin de usuario sobre el incluido. **Hecho:** hay test con dos manifiestos.
- [ ] **T171 · 10 min** — Checks y commit `feat: load and validate plugin manifests`. **Hecho:** commit creado.

## Bloque X2 — Settings y PluginManager

- [ ] **T172 · 10 min** — Escribir el test de `SettingsRepository` y la migración v3. **Hecho:** falla por módulo ausente.
- [ ] **T173 · 10 min** — Implementar la tabla `settings` y el repositorio JSON. **Hecho:** T172 en verde.
- [ ] **T174 · 10 min** — Escribir el test de activación en orden y healthcheck esperado. **Hecho:** falla por manager ausente.
- [ ] **T175 · 15 min** — Implementar `activate` con arranque ordenado y espera. **Hecho:** T174 en verde.
- [ ] **T176 · 10 min** — Escribir el test de healthcheck TCP con socket real. **Hecho:** falla por función ausente.
- [ ] **T177 · 10 min** — Implementar `check_health` para `tcp://`. **Hecho:** T176 en verde.
- [ ] **T178 · 10 min** — Añadir el healthcheck `http://` con timeout y reintentos. **Hecho:** hay test con servidor local.
- [ ] **T179 · 10 min** — Escribir y resolver el rollback cuando un healthcheck falla. **Hecho:** para los procesos y deja `error`.
- [ ] **T180 · 10 min** — Escribir el test de persistencia de `plugins.active`. **Hecho:** falla antes de guardar.
- [ ] **T181 · 10 min** — Implementar `restore()` y el guardado al activar/desactivar. **Hecho:** T180 en verde.
- [ ] **T182 · 10 min** — Llamar a `restore()` en el `lifespan` tras `recover()`. **Hecho:** un plugin activo vuelve al arrancar.
- [ ] **T183 · 10 min** — Checks y commit `feat: activate plugins with dependency order and healthchecks`. **Hecho:** commit creado.

## Bloque X3 — API y WS de plugins

- [ ] **T184 · 10 min** — Escribir el test de listar y activar plugins. **Hecho:** falla por rutas ausentes.
- [ ] **T185 · 15 min** — Implementar las rutas de plugins y el mapeo de errores. **Hecho:** T184 en verde.
- [ ] **T186 · 10 min** — Añadir el canal WS `plugins` con reenvío inicial. **Hecho:** hay test de suscripción.

## Bloque X4 — Foxglove y Lichtblick (backend)

- [ ] **T192 · 10 min** — Crear `builtin_plugins/foxglove/plugin.yaml` con bridge, healthcheck y panel. **Hecho:** el loader lo descubre.
- [ ] **T193 · 10 min** — Escribir el test de vendorizado de Lichtblick. **Hecho:** falla por módulo ausente.
- [ ] **T194 · 10 min** — Escribir el test de checksum inválido. **Hecho:** lanza `AssetError`.
- [ ] **T195 · 15 min** — Implementar descarga, verificación, extracción y marcador `.complete`. **Hecho:** T193 y T194 en verde.
- [ ] **T200 · 10 min** — Comprobar con un bridge real que el healthcheck pasa y el panel carga. **Hecho:** plugin `active` y URL accesible.
- [ ] **T201 · 10 min** — Checks, build y commit `feat: ship foxglove plugin with local lichtblick panel`. **Hecho:** commit creado.

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

- [ ] El plugin `foxglove` se descubre, se activa y su healthcheck pasa con el bridge real.
- [ ] `/lichtblick/index.html` responde y el layout por defecto carga `/tf` y `/turtle1/pose`.
- [ ] Un healthcheck fallido para los procesos ya arrancados y deja el plugin en `error`.
- [ ] Los plugins activos se restauran al reiniciar la app.
