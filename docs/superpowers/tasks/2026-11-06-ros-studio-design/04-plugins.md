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

- [x] **T165 · 15 min** — Crear los modelos `PluginProcessSpec`, `PanelSpec`, `PluginManifest` y `DiscoveredPlugin`. **Hecho:** `test_plugin_models.py` valida un YAML mínimo.
- [x] **T166 · 10 min** — Añadir validadores de ids únicos, `requires` existentes y URL obligatoria. **Hecho:** tests de ids duplicados, URL de panel y `requires` inexistente.
- [x] **T167 · 10 min** — Escribir el test de manifiesto válido y `argv`. **Hecho:** `test_discovers_a_valid_manifest_with_argv` falló por loader ausente.
- [x] **T168 · 15 min** — Implementar `PluginLoader.discover` para builtin y usuario. **Hecho:** T167 en verde.
- [x] **T169 · 10 min** — Escribir y resolver el test de `requires` inexistente sin romper el resto. **Hecho:** `test_missing_requirement_is_recorded_without_dropping_others`.
- [x] **T170 · 10 min** — Implementar la prioridad del plugin de usuario sobre el incluido. **Hecho:** `test_user_plugin_overrides_the_builtin_one`.
- [x] **T171 · 10 min** — Checks y commit `feat: load and validate plugin manifests`. **Hecho:** commit creado.

## Bloque X2 — Settings y PluginManager

- [x] **T172 · 10 min** — Escribir el test de `SettingsRepository` y la migración v3. **Hecho:** `test_plugin_settings.py` y `test_storage.py` en verde.
- [x] **T173 · 10 min** — Implementar la tabla `settings` y el repositorio JSON. **Hecho:** `user_version` pasa a 3.
- [x] **T174 · 10 min** — Escribir el test de activación en orden y healthcheck esperado. **Hecho:** `test_activation_starts_dependencies_first`.
- [x] **T175 · 15 min** — Implementar `activate` con arranque ordenado y espera. **Hecho:** T174 en verde.
- [x] **T176 · 10 min** — Escribir el test de healthcheck TCP con socket real. **Hecho:** `test_tcp_healthcheck_uses_a_real_socket`.
- [x] **T177 · 10 min** — Implementar `check_health` para `tcp://`. **Hecho:** T176 en verde.
- [x] **T178 · 10 min** — Añadir el healthcheck `http://` con timeout y reintentos. **Hecho:** `test_http_healthcheck_hits_a_local_server`.
- [x] **T179 · 10 min** — Escribir y resolver el rollback cuando un healthcheck falla. **Hecho:** `test_failed_healthcheck_rolls_back_and_leaves_error`.
- [x] **T180 · 10 min** — Escribir el test de persistencia de `plugins.active`. **Hecho:** `test_activation_is_persisted_and_restored` y `test_shutdown_stops_processes_but_keeps_the_active_list`.
- [x] **T181 · 10 min** — Implementar `restore()` y el guardado al activar/desactivar. **Hecho:** T180 en verde.
- [x] **T182 · 10 min** — Llamar a `restore()` en el `lifespan` tras `recover()`. **Hecho:** `cli.py` registra `plugins.restore` después de `recover`.
- [x] **T183 · 10 min** — Checks y commit `feat: activate plugins with dependency order and healthchecks`. **Hecho:** commit creado.

## Bloque X3 — API y WS de plugins

- [x] **T184 · 10 min** — Escribir el test de listar y activar plugins. **Hecho:** `test_api_plugins.py` falló por rutas ausentes.
- [x] **T185 · 15 min** — Implementar las rutas de plugins y el mapeo de errores. **Hecho:** T184 en verde; 404 `plugin_not_found` y 409 `plugin_error` probados.
- [x] **T186 · 10 min** — Añadir el canal WS `plugins` con reenvío inicial. **Hecho:** `test_websocket_backfills_plugins`.

## Bloque X4 — Foxglove y Lichtblick (backend)

- [x] **T192 · 10 min** — Crear `builtin_plugins/foxglove/plugin.yaml` con bridge, healthcheck y panel. **Hecho:** `test_builtin_foxglove_manifest_is_discovered`.
- [x] **T193 · 10 min** — Escribir el test de vendorizado de Lichtblick. **Hecho:** `test_ensure_verifies_extracts_and_marks_the_cache`.
- [x] **T194 · 10 min** — Escribir el test de checksum inválido. **Hecho:** lanza `AssetError` y no deja `.complete`.
- [x] **T195 · 15 min** — Implementar descarga, verificación, extracción y marcador `.complete`. **Hecho:** T193 y T194 en verde.
- [ ] **T200 · 10 min** — Comprobar con un bridge real que el healthcheck pasa y el panel carga. **Hecho:** pendiente de un entorno ROS con `foxglove_bridge`.
- [x] **T201 · 10 min** — Checks, build y commit `feat: ship foxglove plugin with local lichtblick panel`. **Hecho:** `pytest`, `ruff` y `mypy` en verde y commit creado.

## Verificación

```bash
python -m venv .venv --system-site-packages
source .venv/bin/activate
pip install -e ".[dev]"
ruff check backend
ruff format --check backend
mypy backend/src
pytest -m "not integration" --cov=cotton --cov-fail-under=80
```

## Gate de cierre

- [ ] El plugin `foxglove` se descubre, se activa y su healthcheck pasa con el bridge real.
- [ ] `/lichtblick/index.html` responde y el layout por defecto carga `/tf` y `/turtle1/pose`.
- [x] Un healthcheck fallido para los procesos ya arrancados y deja el plugin en `error`.
- [x] Los plugins activos se restauran al reiniciar la app.
