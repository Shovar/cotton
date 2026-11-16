# Graph Report - ROSStudio  (2026-11-16)

## Corpus Check
- 171 files · ~73,071 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 5, .css 1)

## Summary
- 1724 nodes · 4299 edges · 85 communities (75 shown, 10 thin omitted)
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 881 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `84f472fb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Services
- EventBus
- Database
- test_api_profiles.py
- signals_probe.py
- RosEnvironmentError
- main.tsx
- ApiError
- WsClient
- params.py
- routes_processes.py
- app.py
- types.ts
- store.ts
- measure_rate
- processes/models.py
- RclpyGraphSource
- ProcessesView.tsx
- LichtblickAssets
- Lichtblick probe — stage 0
- PluginsView.tsx
- client.ts
- with
- RosCallError
- RosThread
- PluginManager
- steps
- mount_spa
- TopicGraph.tsx
- ProcessSpec
- vitest
- .snapshot
- compilerOptions
- ProcessManager
- cli.py
- plugin.yaml
- ProcessRecord
- PluginLoader
- pytest
- test_recovery.py
- Review Focus
- AGENTS.md — Working agreement for ROS Studio
- plugins/manager.py
- conftest.py
- errors.py
- .from_dict
- ROS Studio API contract
- ros-studio
- devDependencies
- PluginProcessSpec
- ProcessPort
- test_api_auth.py
- graph_probe.py
- plugins/__init__.py
- test_api_plugins.py
- 3. Models
- Installing ROS Studio
- Spec: IDE local para ROS 2
- eslint.config.js
- frontend/package.json
- scripts
- routes_params.py
- processes/manager.py
- Etapa 1 — Grafo (semanas 2–3)
- 01 — Spikes de la etapa 0
- dependencies
- useStore
- ProcessConflict
- tasks/2026-11-06-ros-studio-design.md
- scripts
- test_snapshot_lists_are_sorted_and_revision_starts_at_zero
- 02 — Descubrimiento ROS
- ROS Studio — Índice de tareas
- setup.ts
- Verificaciones que necesitan ROS 2
- Plugins
- @playwright/test
- ROS Studio
- @vitejs/plugin-react
- dev.sh
- entrypoint.sh
- workspace/README.md
- ros-studio

## God Nodes (most connected - your core abstractions)
1. `ProcessManager` - 79 edges
2. `Services` - 79 edges
3. `RosThread` - 47 edges
4. `ProcessSpec` - 45 edges
5. `Database` - 44 edges
6. `EventBus` - 42 edges
7. `RosCallError` - 41 edges
8. `PluginManager` - 38 edges
9. `ProcessRecord` - 38 edges
10. `ApiError` - 35 edges

## Surprising Connections (you probably didn't know these)
- `Lichtblick assets` --references--> `LichtblickAssets`  [INFERRED]
  docs/plugins.md → backend/src/ros_studio/plugins/assets.py
- `Bloque P2 — ProcessManager` --references--> `ProcessConflict`  [INFERRED]
  docs/superpowers/tasks/2026-11-06-ros-studio-design/03-processes.md → backend/src/ros_studio/processes/manager.py
- `Global Constraints` --references--> `ProcessManager`  [INFERRED]
  docs/superpowers/plans/2026-11-16-processes-ux.md → backend/src/ros_studio/processes/manager.py
- `3. Hexagonal architecture and domain layers` --references--> `GraphSource`  [INFERRED]
  AGENTS.md → backend/src/ros_studio/ros/graph.py
- `Task 8: Translate the rest of the UI to English` --references--> `Services`  [INFERRED]
  docs/superpowers/plans/2026-11-16-processes-ux.md → backend/src/ros_studio/services.py

## Import Cycles
- None detected.

## Communities (85 total, 10 thin omitted)

### Community 0 - "Services"
Cohesion: 0.07
Nodes (49): create_app(), Services, test_feature_routers_are_protected_automatically(), app_for(), graph_snapshot(), StubWatcher, test_graph_channel_sends_snapshot_then_status_on_subscribe(), test_graph_channel_sends_status_when_no_snapshot_exists() (+41 more)

### Community 1 - "EventBus"
Cohesion: 0.06
Nodes (40): create_router(), read_graph(), EventBus, GraphSource, GraphSnapshot, GraphWatcher, test_bus_fans_out(), test_publish_without_subscribers_does_not_block() (+32 more)

### Community 2 - "Database"
Cohesion: 0.09
Nodes (32): lifespan(), SettingsRepository, Database, ProcessRegistry, build_manager(), FakeProcesses, find(), ok_healthcheck() (+24 more)

### Community 3 - "test_api_profiles.py"
Cohesion: 0.06
Nodes (32): create_router(), create_profile(), delete_profile(), start_profile(), update_profile(), _profile(), ProfileBody, _required() (+24 more)

### Community 4 - "signals_probe.py"
Cohesion: 0.06
Nodes (38): _cli_names(), _graph(), _node_names(), test_graph_matches_the_ros_cli_and_measures_pose(), measured(), publishes(), _topic_names(), wait_until() (+30 more)

### Community 5 - "RosEnvironmentError"
Cohesion: 0.07
Nodes (27): detect_environment(), ensure_ros_environment(), _optional(), _parse_domain_id(), RosEnvironmentError, _workspace(), test_ros_environment_error_is_reported_without_stack_trace(), ros_down() (+19 more)

### Community 6 - "main.tsx"
Cohesion: 0.10
Nodes (31): Bloque U2 — Workbench y barra de estado, App(), clearPanels(), getPanel(), getPanels(), PanelDefinition, panels, PlaceholderPanel() (+23 more)

### Community 7 - "ApiError"
Cohesion: 0.07
Nodes (33): create_router(), activate_plugin(), deactivate_plugin(), create_router(), close_process(), create_process(), delete_process(), read_logs() (+25 more)

### Community 8 - "WsClient"
Cohesion: 0.06
Nodes (23): Task 11: Shell del frontend, Approaches considered, Closing a terminal, Command entry, Consoles, Decisions, English pass, Goals (+15 more)

### Community 9 - "params.py"
Cohesion: 0.10
Nodes (22): _array_type(), coerce_value(), _convert(), _declared_type(), _parameter(), ParamsNode, ParamsSource, _plain_value() (+14 more)

### Community 10 - "routes_processes.py"
Cohesion: 0.13
Nodes (19): graph_channel(), initial(), register_plugin_channel(), initial(), _log_channel(), initial(), ProcessRequest, register_process_channels() (+11 more)

### Community 11 - "app.py"
Cohesion: 0.11
Nodes (9): health(), read_environment(), EnvironmentInfo, Auth, require_auth(), test_env_endpoint(), test_unknown_api_route_uses_error_envelope(), Task 13: Token de sesión y validación de `Origin` (+1 more)

### Community 12 - "types.ts"
Cohesion: 0.09
Nodes (29): Task 12: Vista de grafo, detalle de topic y editor de parámetros, 06 — UI de grafo, Bloque G1 — Vista de grafo, Bloque G2 — Detalle de topic, Bloque G3 — Parámetros y frecuencia, Bloque G4 — Datos en vivo, Bloque G5 — Grafo de nodos y topics, Gate de cierre (+21 more)

### Community 13 - "store.ts"
Cohesion: 0.09
Nodes (26): Task 3: Remove processes and clear logs in the store, EnvironmentInfo, LogLine, ProcessRecord, ServerEvent, BASE_RECONNECT_DELAY_MS, ConnectionStatus, MAX_RECONNECT_DELAY_MS (+18 more)

### Community 14 - "measure_rate"
Cohesion: 0.09
Nodes (18): compute_hz(), _count_messages(), is_best_effort(), measure_rate(), _message_type(), RateResult, FakeNode, FakeQos (+10 more)

### Community 15 - "processes/models.py"
Cohesion: 0.13
Nodes (13): LogBuffer, LogFileWriter, parse_level(), LogLine, now(), test_buffer_assigns_process_id_and_marks_stream(), test_buffer_keeps_last_lines(), test_parses_ros_log_level_prefix() (+5 more)

### Community 16 - "RclpyGraphSource"
Cohesion: 0.11
Nodes (14): RclpyGraphSource, CountingNode, Endpoint, FakeNode, test_cache_is_pruned_when_a_topic_disappears(), test_endpoints_are_cached_until_the_topic_types_change(), test_node_without_actions_api_degrades(), test_self_node_is_removed_from_endpoints_services_and_actions() (+6 more)

### Community 17 - "ProcessesView.tsx"
Cohesion: 0.10
Nodes (24): Task 6: Open, close and remove terminals, 07 — UI de procesos, Bloque P1 — Lista y control de procesos, Bloque P2 — Logs, Bloque P3 — Perfiles, Gate de cierre, Reglas de este fichero, Verificación (+16 more)

### Community 18 - "LichtblickAssets"
Cohesion: 0.17
Nodes (10): AssetError, _download(), _extract(), LichtblickAssets, _sha256(), make_archive(), test_ensure_copies_the_default_layout(), test_ensure_verifies_extracts_and_marks_the_cache() (+2 more)

### Community 19 - "Lichtblick probe — stage 0"
Cohesion: 0.07
Nodes (27): build(), Build (T028), Decisión de empaquetado (T032), Decisión go/no-go (T018), Decisión sobre los tiempos de gracia (T025), Entorno de medida, Etapa 0 — Mediciones, Formato de layout por URL (T031) (+19 more)

### Community 20 - "PluginsView.tsx"
Cohesion: 0.11
Nodes (23): 08 — UI de plugins, Bloque X1 — Lista y activación, Bloque X2 — Panel embebido, Bloque X3 — Panel de Foxglove, Bloque X4 — Cierre, Gate de cierre, Reglas de este fichero, Verificación (+15 more)

### Community 21 - "client.ts"
Cohesion: 0.12
Nodes (20): 05 — Shell de la UI, Bloque U0 — Proyecto Vite y tests, Bloque U1 — Token, clientes y estado, Bloque U3 — Punto de extensión de paneles, Bloque U4 — Integración con el backend, Gate de cierre, Reglas de este fichero, Verificación (+12 more)

### Community 22 - "with"
Cohesion: 0.08
Nodes (27): runs-on, steps, strategy, run, defaults, runs-on, steps, jobs (+19 more)

### Community 23 - "RosCallError"
Cohesion: 0.13
Nodes (10): create_router(), read_rate(), ros_call_error(), NodeInfo, RateSource, RosCallError, RosCallTimeout, call() (+2 more)

### Community 24 - "RosThread"
Cohesion: 0.11
Nodes (7): build_services(), ThreadGraphSource, ThreadRateSource, RosThread, ros_client(), Bloque F4 — Hilo ROS, Reglas de este fichero

### Community 25 - "PluginManager"
Cohesion: 0.15
Nodes (10): PluginManager, visit(), PluginNotFound, PluginRecord, Etapa 3 — Foxglove y plugins (semanas 7–8), Task 20: Manifiestos de plugin y loader, Task 21: `PluginManager` con activación, dependencias y healthchecks, Task 22: API, WebSocket y UI de plugins (+2 more)

### Community 26 - "steps"
Cohesion: 0.09
Nodes (25): runs-on, steps, runs-on, steps, strategy, jobs, e2e, integration (+17 more)

### Community 27 - "mount_spa"
Cohesion: 0.11
Nodes (18): mount_spa(), mount_viewer(), viewer(), _viewer_missing_page(), test_mount_spa_serves_built_assets(), test_mount_spa_serves_index_and_falls_back(), test_mount_viewer_explains_missing_assets(), test_mount_viewer_is_skipped_without_a_directory() (+10 more)

### Community 28 - "TopicGraph.tsx"
Cohesion: 0.16
Nodes (16): GraphSnapshot, clamp(), GRAPH_HEIGHT, GRAPH_WIDTH, GraphLayout, GraphLink, GraphPoint, layoutGraph() (+8 more)

### Community 29 - "ProcessSpec"
Cohesion: 0.35
Nodes (16): ProcessSpec, eventually(), group_alive(), process_alive(), python_script(), test_close_forgets_an_already_exited_process(), test_close_stops_forgets_and_announces(), test_duplicate_active_id_conflicts() (+8 more)

### Community 30 - "vitest"
Cohesion: 0.12
Nodes (15): Task 19: UI de procesos, logs y perfiles, Bloque P4 — Paleta y eventos, SNAPSHOT, jsonResponse(), renderParams(), stubFetch(), apiExists, PLUGIN (+7 more)

### Community 31 - ".snapshot"
Cohesion: 0.17
Nodes (11): _action_names(), EndpointLike, _endpoints(), _full_name(), NodeLike, _owned_by_app(), _topics_by_endpoint(), _typed_names() (+3 more)

### Community 32 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+11 more)

### Community 33 - "ProcessManager"
Cohesion: 0.22
Nodes (4): _stop_all(), ProcessManager, test_missing_process_raises(), Task 1: Close a terminal in the process manager

### Community 34 - "cli.py"
Cohesion: 0.18
Nodes (6): allowed_origins(), browser_url(), main(), parse_args(), generate_token(), test_real_ros_thread_roundtrip()

### Community 35 - "plugin.yaml"
Cohesion: 0.11
Nodes (17): description, healthcheck, delay_s, retries, timeout_s, url, name, panels (+9 more)

### Community 36 - "ProcessRecord"
Cohesion: 0.16
Nodes (4): ProcessRegistryPort, ProcessRecord, FakeProcesses, _record()

### Community 37 - "PluginLoader"
Cohesion: 0.26
Nodes (9): PluginLoader, test_builtin_foxglove_manifest_is_discovered(), test_builtin_foxglove_panel_uses_the_runtime_port(), test_discovers_a_valid_manifest_with_argv(), test_invalid_manifest_is_reported(), test_missing_requirement_is_recorded_without_dropping_others(), test_user_plugin_overrides_the_builtin_one(), write_plugin() (+1 more)

### Community 38 - "pytest"
Cohesion: 0.22
Nodes (9): _first_duplicate(), PluginManifest, test_duplicate_panel_ids_are_rejected(), test_duplicate_process_ids_are_rejected(), test_healthcheck_url_scheme_is_validated(), test_manifest_to_dict_matches_the_contract(), test_name_and_argv_are_validated(), test_panel_requires_a_url() (+1 more)

### Community 39 - "test_recovery.py"
Cohesion: 0.22
Nodes (8): StopTimeouts, manager(), dead_record(), manager(), process_alive(), test_app_shutdown_hook_stops_children(), test_recover_alive_orphan_and_stop_it(), test_recover_dead_pid_is_deleted()

### Community 40 - "Review Focus"
Cohesion: 0.12
Nodes (14): Cierre, Corrección de hallazgos de auditoría — Plan de implementación, Global Constraints, Review Focus, Task 10: Alinear la documentación con el código, Task 11: Runbook para las verificaciones que necesitan ROS, Task 1: Sacar el token del access log, Task 4: Caché de endpoints por topic (+6 more)

### Community 41 - "AGENTS.md — Working agreement for ROS Studio"
Cohesion: 0.13
Nodes (14): 10. Commits, language and documentation, 11. Definition of done, 12. What agents must not do, 13. References, 1. Mandatory working style, 2. Before writing anything, 3. Hexagonal architecture and domain layers, 4. Fixed stack and tooling (+6 more)

### Community 42 - "plugins/manager.py"
Cohesion: 0.22
Nodes (10): check_health(), Healthcheck, _healthcheck(), HealthcheckError, PluginError, _probe(), _probe_http(), healthcheck() (+2 more)

### Community 43 - "conftest.py"
Cohesion: 0.19
Nodes (6): auth_headers(), bus(), client(), env_info(), NoopRos, services()

### Community 44 - "errors.py"
Cohesion: 0.21
Nodes (8): error_payload(), install_error_handlers(), handle_api_error(), handle_http_error(), handle_ros_environment_error(), handle_validation_error(), _validation_message(), test_mount_spa_reports_missing_build()

### Community 45 - ".from_dict"
Cohesion: 0.23
Nodes (5): iso_utc(), started_at(), test_log_line_serializes_contract_shape(), test_process_record_serializes_contract_shape(), test_process_spec_roundtrips_through_json_dict()

### Community 46 - "ROS Studio API contract"
Cohesion: 0.15
Nodes (12): frontend_not_built(), 1. Authentication, 2. Error envelope, 4. REST endpoints, 5. WebSocket `/ws`, 6. SPA serving, 7. Backend extension points, Channels and initial backfill (+4 more)

### Community 47 - "ros-studio"
Cohesion: 0.15
Nodes (12): context, dockerfile, ROS_DOMAIN_ID, build, command, environment, image, init (+4 more)

### Community 48 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, jsdom@^31.0.0, @testing-library/react@^16.3.3, @types/node@^26.6.6, @types/react@^19.3.0, typescript@^6.0.3, vitest@^5.1.0, @vitest/coverage-v8@^5.1.0 (+5 more)

### Community 49 - "PluginProcessSpec"
Cohesion: 0.24
Nodes (4): _process_id(), _process_spec(), _check_id(), PluginProcessSpec

### Community 50 - "ProcessPort"
Cohesion: 0.18
Nodes (9): ProcessPort, Reglas de este fichero, 04 — Plugins y Foxglove, Bloque X3 — API y WS de plugins, Bloque X4 — Foxglove y Lichtblick (backend), Gate de cierre, Reglas de este fichero, Verificación (+1 more)

### Community 51 - "test_api_auth.py"
Cohesion: 0.29
Nodes (9): test_cors_allows_known_origin(), test_cors_rejects_unknown_origin(), test_health_is_open(), test_rest_accepts_valid_token(), test_rest_rejects_wrong_token(), test_rest_requires_bearer(), test_ws_rejects_bad_origin(), test_ws_rejects_bad_token() (+1 more)

### Community 52 - "graph_probe.py"
Cohesion: 0.24
Nodes (6): main(), measure(), poll(), parse_args(), percentile(), snapshot_ms()

### Community 53 - "plugins/__init__.py"
Cohesion: 0.35
Nodes (4): _load(), DiscoveredPlugin, HealthcheckSpec, PanelSpec

### Community 54 - "test_api_plugins.py"
Cohesion: 0.29
Nodes (7): client_for(), plugin_manager(), test_failed_healthcheck_is_a_plugin_error(), test_list_activate_and_deactivate_a_plugin(), test_unknown_plugin_is_not_found(), test_websocket_backfills_plugins(), write_plugin()

### Community 55 - "3. Models"
Cohesion: 0.18
Nodes (11): 3. Models, EnvironmentInfo, GraphSnapshot, LogLine, NodeInfo, PluginRecord, ProcessRecord, ProcessSpec (+3 more)

### Community 56 - "Installing ROS Studio"
Cohesion: 0.18
Nodes (10): apt (Ubuntu 22.04 and 24.04), Changing `ROS_DOMAIN_ID`, Docker, From source (any supported path), Installing ROS Studio, Integration and E2E, Offline Lichtblick assets, pixi / RoboStack (macOS and Linux) (+2 more)

### Community 57 - "Spec: IDE local para ROS 2"
Cohesion: 0.18
Nodes (11): 10. Plan de trabajo, testing y repositorio, 1. Resumen y objetivos, 2. Alcance del MVP y fases, 3. Requisitos funcionales, 4. Requisitos no funcionales, 5. Arquitectura, 6. Sistema de plugins, 7. API y modelo de datos (+3 more)

### Community 58 - "eslint.config.js"
Cohesion: 0.18
Nodes (10): @eslint/js@^10.0.1, eslint-plugin-react-hooks@^7.1.1, eslint-plugin-react-refresh@^0.5.7, globals@^17.14.0, typescript-eslint@^8.72.1, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+2 more)

### Community 59 - "frontend/package.json"
Cohesion: 0.18
Nodes (10): eslint@^10.14.0, @types/react-dom@^19.3.0, vite@^8.3.7, name, private, type, version, eslint (+2 more)

### Community 60 - "scripts"
Cohesion: 0.18
Nodes (10): description, name, private, scripts, build, dev, lint, postinstall (+2 more)

### Community 61 - "routes_params.py"
Cohesion: 0.29
Nodes (6): _absolute(), create_router(), read_params(), write_param(), ParamValue, _run()

### Community 62 - "processes/manager.py"
Cohesion: 0.31
Nodes (5): _group_alive(), _group_gone(), _pid_alive(), _signal_group(), _startup_error()

### Community 63 - "Etapa 1 — Grafo (semanas 2–3)"
Cohesion: 0.20
Nodes (10): Etapa 0 — Prototipo de riesgo (semana 1), Etapa 1 — Grafo (semanas 2–3), Etapas 4–5 (hoja de ruta, sin detallar), Global Constraints, Review Focus, ROS Studio MVP — Plan de implementación, Task 10: Frecuencia de topic bajo demanda, Task 2: Spike del grafo (coste del sondeo) (+2 more)

### Community 64 - "01 — Spikes de la etapa 0"
Cohesion: 0.20
Nodes (9): 01 — Spikes de la etapa 0, Bloque S1 — Sondeo del grafo, Bloque S2 — Señales y huérfanos, Bloque S3 — Lichtblick y assets, Bloque S4 — Validación de instalaciones, Bloque S5 — Cierre, Gate de cierre, Reglas de este fichero (+1 more)

### Community 65 - "dependencies"
Cohesion: 0.20
Nodes (10): dependencies, dockview@^8.9.0, dockview-react@^8.9.0, react@^19.3.1, react-dom@^19.3.1, @tanstack/react-query@^5.107.1, zustand@^5.1.0, dockview (+2 more)

### Community 66 - "useStore"
Cohesion: 0.40
Nodes (6): GraphPanel(), renderPanel(), SNAPSHOT, registerGraphPanel(), useStore, @tanstack/react-query

### Community 67 - "ProcessConflict"
Cohesion: 0.31
Nodes (6): ProcessConflict, ProcessNotFound, Etapa 2 — Procesos (semanas 4–6), Task 15: `ProcessManager` con arranque, streaming y parada ordenada, Task 17: API REST y WebSocket de procesos, Task 18: Perfiles de lanzamiento

### Community 69 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, e2e, lint, preview, test, typecheck

### Community 71 - "02 — Descubrimiento ROS"
Cohesion: 0.29
Nodes (6): 02 — Descubrimiento ROS, Bloque D1 — Modelos y GraphSource, Bloque D2 — Watcher y estado de conexión, Bloque D3 — Canal WS del grafo, Gate de cierre, Verificación

### Community 72 - "ROS Studio — Índice de tareas"
Cohesion: 0.29
Nodes (7): Contratos compartidos, Cómo usar estos ficheros, Después del MVP, Gates, Olas de trabajo, ROS Studio — Índice de tareas, Tooling

### Community 73 - "setup.ts"
Cohesion: 0.29
Nodes (3): @testing-library/jest-dom@^7.0.1, ResizeObserverStub, @testing-library/jest-dom

### Community 74 - "Verificaciones que necesitan ROS 2"
Cohesion: 0.33
Nodes (6): Comparación con `ros2` (gate de etapa 1), E2E — Docker y Playwright, T034 — Instalación en Ubuntu con venv `--system-site-packages`, T069/T070 — Parámetros remotos con un nodo real, T200 — Healthcheck del puente de Foxglove, Verificaciones que necesitan ROS 2

### Community 75 - "Plugins"
Cohesion: 0.50
Nodes (3): Lichtblick assets, Manifest, Plugins

### Community 77 - "ROS Studio"
Cohesion: 0.50
Nodes (4): Development, Documentation, Frontend development, ROS Studio

## Knowledge Gaps
- **2 isolated node(s):** `ros-studio`, `PYTHONPATH`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 527 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Contratos compartidos` connect `ROS Studio — Índice de tareas` to `Services`, `ProcessManager`, `EventBus`, `ProcessPort`, `PluginsView.tsx`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Are the 55 inferred relationships involving `ProcessManager` (e.g. with `create_router()` and `_log_channel()`) actually correct?**
  _`ProcessManager` has 55 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ros-studio`, `PYTHONPATH` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Services` be split into smaller, more focused modules?**
  _Cohesion score 0.07204968944099378 - nodes in this community are weakly interconnected._
- **Why does `Services` connect `Services` to `EventBus`, `cli.py`, `Database`, `test_api_profiles.py`, `RosEnvironmentError`, `ProcessConflict`, `ApiError`, `ROS Studio — Índice de tareas`, `routes_processes.py`, `app.py`, `conftest.py`, `ROS Studio API contract`, `test_api_plugins.py`, `RosThread`, `PluginManager`, `mount_spa`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Are the 67 inferred relationships involving `Services` (e.g. with `websocket_endpoint()` and `create_app()`) actually correct?**
  _`Services` has 67 INFERRED edges - model-reasoned connections that need verification._
- **Should `EventBus` be split into smaller, more focused modules?**
  _Cohesion score 0.06189640035118525 - nodes in this community are weakly interconnected._