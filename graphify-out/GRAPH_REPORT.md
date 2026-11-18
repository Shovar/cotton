# Graph Report - ROSStudio  (2026-11-18)

## Corpus Check
- 187 files · ~81,793 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 5, .css 1)

## Summary
- 1950 nodes · 4321 edges · 196 communities (89 shown, 107 thin omitted)
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 719 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b33c03b5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- GraphSource
- main.tsx
- vitest
- RosEnvironmentError
- main.tsx
- plugins/manager.py
- Review Focus
- params.py
- Channel
- PtySession
- types.ts
- ws.ts
- rate.py
- terminals/manager.py
- FakeNode
- registerPanel
- signals_probe.py
- Etapa 0 — Mediciones
- PluginsView.tsx
- client.ts
- with
- RosThread
- PluginManager
- steps
- app.py
- EventBus
- test_install_script.py
- TerminalWorkspace.tsx
- graph.py
- compilerOptions
- cli.py
- EventBus
- TerminalManager
- plugins/__init__.py
- Review Focus
- AGENTS.md — Working agreement for ROS Studio
- Database
- conftest.py
- thread.py
- Installing Cotton
- cotton
- devDependencies
- plugins/__init__.py
- Cotton — Índice de tareas
- test_api_auth.py
- 00 — Foundation
- test_api_plugins.py
- pathlib
- fastapi_testclient
- Spec: IDE local para ROS 2
- eslint.config.js
- frontend/package.json
- scripts
- os
- test_terminal_ws.py
- 01 — Spikes de la etapa 0
- dependencies
- 5. Arquitectura
- Auth
- tasks/2026-11-06-ros-studio-design.md
- scripts
- strategy
- install_error_handlers
- test_terminal_api.py
- Lichtblick probe — stage 0
- Verificaciones que necesitan ROS 2
- 08 — UI de plugins
- Cotton
- vite.config.ts
- dev.sh
- entrypoint.sh
- workspace/README.md
- GraphSnapshot
- S3 — Lichtblick y assets
- Event
- test_api_rate.py
- Services
- .start
- Review Focus
- plugin.yaml
- test_ros_thread.py
- ChannelBuilder
- components.json
- routes_terminals.py
- LichtblickAssets
- graph_probe.py
- Cotton Terminal Workspace — Design
- create_app
- PosixPtySession
- test_terminal_pty_exec.py
- 06 — UI de grafo
- test_mvp_ros.py
- NoopRos
- Cotton Rename — Design
- 10 — Renombrado integral a Cotton
- OkHandler
- install.sh
- cotton

## God Nodes (most connected - your core abstractions)
1. `Services` - 81 edges
2. `TerminalManager` - 50 edges
3. `RosThread` - 49 edges
4. `EventBus` - 49 edges
5. `RosCallError` - 41 edges
6. `Database` - 34 edges
7. `build_services()` - 31 edges
8. `PluginManager` - 29 edges
9. `create_app()` - 29 edges
10. `GraphWatcher` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Task 18: Perfiles de lanzamiento` --references--> `Database`  [INFERRED]
  docs/superpowers/plans/2026-11-06-ros-studio-mvp.md → backend/src/cotton/storage/db.py
- `Task 1: Base del repositorio y calidad` --references--> `build()`  [INFERRED]
  docs/superpowers/plans/2026-11-06-ros-studio-mvp.md → backend/tests/test_channels.py
- `Task 19: UI de procesos, logs y perfiles` --references--> `CommandPalette()`  [INFERRED]
  docs/superpowers/plans/2026-11-06-ros-studio-mvp.md → frontend/src/layout/CommandPalette.tsx
- `Bloque P4 — Paleta y eventos` --references--> `CommandPalette()`  [INFERRED]
  docs/superpowers/tasks/2026-11-06-ros-studio-design/07-ui-processes.md → frontend/src/layout/CommandPalette.tsx
- `Task 8: Procesos activos y errores en la barra de estado` --references--> `StatusBar()`  [INFERRED]
  docs/superpowers/plans/2026-11-14-audit-remediation.md → frontend/src/layout/StatusBar.tsx

## Import Cycles
- None detected.

## Communities (196 total, 107 thin omitted)

### Community 1 - "GraphSource"
Cohesion: 0.10
Nodes (19): GraphSource, 10. Decisiones mías para revisar, 1. Intención, 2. Alcance, 3.1 Cambios respecto a la spec, 3. Restricciones y decisiones que las fijan, 4. Enfoques considerados, 6. Etapas (+11 more)

### Community 2 - "main.tsx"
Cohesion: 0.17
Nodes (14): StatusBar(), ENV, THEMES, { hash }, queryClient, applyTheme(), DEFAULT_PREFERENCES, isRecord() (+6 more)

### Community 4 - "vitest"
Cohesion: 0.11
Nodes (3): terminalMocks, ResizeObserverStub, vitest

### Community 5 - "RosEnvironmentError"
Cohesion: 0.07
Nodes (33): health(), read_environment(), detect_environment(), ensure_ros_environment(), EnvironmentInfo, _optional(), _parse_domain_id(), RosEnvironmentError (+25 more)

### Community 6 - "main.tsx"
Cohesion: 0.15
Nodes (22): Dialog, DialogContent(), DialogTitle(), Input(), Tooltip, TooltipContent(), TooltipProvider, TooltipTrigger (+14 more)

### Community 7 - "plugins/manager.py"
Cohesion: 0.24
Nodes (11): check_health(), Healthcheck, _healthcheck(), HealthcheckError, _probe(), _probe_http(), failing(), test_healthcheck_fails_after_retries() (+3 more)

### Community 8 - "Review Focus"
Cohesion: 0.06
Nodes (23): Task 11: Shell del frontend, Cotton Terminal Workspace Implementation Plan, Global Constraints, Review Focus, Task 11 (15 min): Manage named terminal groups, Task 12 (15 min): Add tabbed and mosaic group layouts, Task 13 (10 min): Minimize, restore, and persist the layout, Task 14 (15 min): Reattach and replay after WebSocket reconnect (+15 more)

### Community 9 - "params.py"
Cohesion: 0.10
Nodes (22): _array_type(), coerce_value(), _convert(), _declared_type(), _parameter(), ParamsNode, ParamsSource, _plain_value() (+14 more)

### Community 10 - "Channel"
Cohesion: 0.30
Nodes (7): register_terminal_channels(), Channel, ChannelRegistry, test_channel_matches_events(), test_registry_rejects_duplicate_names(), test_registry_resolves_channel_families(), test_registry_resolves_registered_channels()

### Community 11 - "PtySession"
Cohesion: 0.16
Nodes (3): PtySession, PtySpawner, Task 3 (15 min): Start sessions and publish state/output

### Community 12 - "types.ts"
Cohesion: 0.07
Nodes (38): ErrorData, GraphSnapshot, NodeInfo, PluginManifest, PluginPanelType, PluginState, RateResult, TerminalControlMessage (+30 more)

### Community 13 - "ws.ts"
Cohesion: 0.12
Nodes (22): zustand@^5.1.0, EnvironmentInfo, ServerEvent, BASE_RECONNECT_DELAY_MS, ConnectionStatus, MAX_RECONNECT_DELAY_MS, ServerEventHandler, SocketHandlers (+14 more)

### Community 14 - "rate.py"
Cohesion: 0.10
Nodes (20): compute_hz(), _count_messages(), is_best_effort(), measure_rate(), _message_type(), RateResult, RateSource, ThreadRateSource (+12 more)

### Community 15 - "terminals/manager.py"
Cohesion: 0.16
Nodes (8): TerminalChunk, TerminalRecord, TerminalSpec, TerminalState, test_terminal_chunk_preserves_sequence_and_binary_output(), test_terminal_record_has_stable_json_contract_shape(), test_terminal_record_serializes_each_lifecycle_state(), test_terminal_spec_copies_argv_and_freezes_environment()

### Community 16 - "FakeNode"
Cohesion: 0.08
Nodes (14): CountingNode, Endpoint, FakeNode, test_cache_is_pruned_when_a_topic_disappears(), test_endpoints_are_cached_until_the_topic_types_change(), test_node_without_actions_api_degrades(), test_self_node_is_removed_from_endpoints_services_and_actions(), get_publishers_info_by_topic() (+6 more)

### Community 17 - "registerPanel"
Cohesion: 0.12
Nodes (17): Bloque U3 — Punto de extensión de paneles, 07 — UI de procesos, Bloque P1 — Lista y control de procesos, Bloque P2 — Logs, Bloque P3 — Perfiles, Bloque P4 — Paleta y eventos, Gate de cierre, Reglas de este fichero (+9 more)

### Community 18 - "signals_probe.py"
Cohesion: 0.32
Nodes (9): alive(), escalate(), group_alive(), main(), scenario_backend_killed(), scenario_cooperative(), scenario_stubborn(), start_tree() (+1 more)

### Community 19 - "Etapa 0 — Mediciones"
Cohesion: 0.18
Nodes (11): Decisión go/no-go (T018), Decisión sobre los tiempos de gracia (T025), Entorno de medida, Etapa 0 — Mediciones, Gate de cierre, pixi / RoboStack (T033), Re-medición final (T212), S1 — Sondeo del grafo (+3 more)

### Community 20 - "PluginsView.tsx"
Cohesion: 0.17
Nodes (16): PluginPanelSpec, PluginRecord, PluginPanel(), PluginPanelProps, apiExists, PLUGIN, errorMessage(), panelFor() (+8 more)

### Community 21 - "client.ts"
Cohesion: 0.09
Nodes (31): 05 — Shell de la UI, Bloque U0 — Proyecto Vite y tests, Bloque U1 — Token, clientes y estado, Bloque U2 — Workbench y barra de estado, Bloque U4 — Integración con el backend, Bloque U5 — Identidad visual, Gate de cierre, Reglas de este fichero (+23 more)

### Community 22 - "with"
Cohesion: 0.08
Nodes (27): runs-on, steps, strategy, run, defaults, runs-on, steps, jobs (+19 more)

### Community 23 - "RosThread"
Cohesion: 0.08
Nodes (14): ThreadGraphSource, RosCallError, RosCallTimeout, RosThread, test_graph_excludes_cotton_self_node(), test_thread_source_reuses_the_cache_until_the_node_changes(), call(), call() (+6 more)

### Community 25 - "PluginManager"
Cohesion: 0.13
Nodes (11): PluginError, PluginManager, visit(), PluginNotFound, PluginRecord, Etapa 3 — Foxglove y plugins (semanas 7–8), Task 20: Manifiestos de plugin y loader, Task 21: `PluginManager` con activación, dependencias y healthchecks (+3 more)

### Community 26 - "steps"
Cohesion: 0.11
Nodes (19): runs-on, steps, steps, jobs, e2e, name, on, pull_request (+11 more)

### Community 27 - "app.py"
Cohesion: 0.10
Nodes (12): ImmutableStaticFiles, mount_spa(), mount_viewer(), viewer(), _viewer_missing_page(), test_mount_spa_reports_missing_build(), test_mount_spa_serves_built_assets(), test_mount_spa_serves_index_and_falls_back() (+4 more)

### Community 28 - "EventBus"
Cohesion: 0.27
Nodes (5): EventBus, test_bus_fans_out(), test_publish_without_subscribers_does_not_block(), test_unsubscribe_stops_delivery(), test_spawn_failure_is_retained_and_published()

### Community 29 - "test_install_script.py"
Cohesion: 0.29
Nodes (5): test_real_ros_thread_roundtrip(), _fake_wheel(), _path_without_ros2(), test_installer_defaults_to_cotton_prefix(), test_installer_links_cotton_and_sources_ros_setup()

### Community 30 - "TerminalWorkspace.tsx"
Cohesion: 0.08
Nodes (38): Task 10 (15 min): Create and manage terminal sessions in the UI, TerminalRecord, Button(), buttonVariants, registerTerminalPanel(), EMPTY_OUTPUT_CHUNKS, encodeBase64(), TerminalBody() (+30 more)

### Community 31 - "graph.py"
Cohesion: 0.16
Nodes (15): _action_names(), EndpointLike, _endpoints(), _full_name(), NodeLike, _owned_by_app(), RclpyGraphSource, _topics_by_endpoint() (+7 more)

### Community 32 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+12 more)

### Community 34 - "cli.py"
Cohesion: 0.15
Nodes (8): allowed_origins(), browser_url(), build_services(), main(), parse_args(), generate_token(), test_token_generation_is_random(), Task 6 (15 min): Add terminal REST routes and lifecycle wiring

### Community 35 - "EventBus"
Cohesion: 0.17
Nodes (12): create_router(), read_graph(), GraphSnapshot, GraphWatcher, CallbackSource, FakeRos, graph_with(), test_stop_cancels_the_running_task() (+4 more)

### Community 36 - "TerminalManager"
Cohesion: 0.36
Nodes (5): _terminal_channel(), TerminalManager, TerminalNotFound, test_input_and_resize_are_forwarded_to_the_pty(), test_unknown_terminal_ids_are_rejected_for_control_operations()

### Community 37 - "plugins/__init__.py"
Cohesion: 0.25
Nodes (9): PluginLoader, test_builtin_foxglove_manifest_is_discovered(), test_builtin_foxglove_panel_uses_the_runtime_port(), test_discovers_a_valid_manifest(), test_invalid_manifest_is_reported(), test_missing_requirement_is_recorded_without_dropping_others(), test_user_plugin_overrides_the_builtin_one(), write_plugin() (+1 more)

### Community 40 - "Review Focus"
Cohesion: 0.14
Nodes (13): Cierre, Corrección de hallazgos de auditoría — Plan de implementación, Global Constraints, Review Focus, Task 10: Alinear la documentación con el código, Task 11: Runbook para las verificaciones que necesitan ROS, Task 1: Sacar el token del access log, Task 5: Servicios y acciones en la UI del grafo (+5 more)

### Community 41 - "AGENTS.md — Working agreement for ROS Studio"
Cohesion: 0.13
Nodes (14): 10. Commits, language and documentation, 11. Definition of done, 12. What agents must not do, 13. References, 1. Mandatory working style, 2. Before writing anything, 3. Hexagonal architecture and domain layers, 4. Fixed stack and tooling (+6 more)

### Community 42 - "Database"
Cohesion: 0.14
Nodes (21): SettingsRepository, Database, build_manager(), find(), ok_healthcheck(), test_activation_activates_dependencies_first(), test_activation_is_persisted_and_restored(), test_deactivate_clears_persistence() (+13 more)

### Community 43 - "conftest.py"
Cohesion: 0.29
Nodes (6): auth_headers(), bus(), client(), env_info(), services(), test_channel()

### Community 44 - "thread.py"
Cohesion: 0.09
Nodes (14): _absolute(), create_router(), read_params(), write_param(), ParamValue, _run(), create_router(), activate_plugin() (+6 more)

### Community 46 - "Installing Cotton"
Cohesion: 0.06
Nodes (32): frontend_not_built(), 1. Authentication, 2. Error envelope, 3. Models, 4. REST endpoints, 5. WebSocket `/ws`, 6. SPA serving, 7. Backend extension points (+24 more)

### Community 47 - "cotton"
Cohesion: 0.15
Nodes (12): context, dockerfile, build, command, environment, image, init, ports (+4 more)

### Community 48 - "devDependencies"
Cohesion: 0.09
Nodes (19): devDependencies, eslint@^10.14.0, jsdom@^31.0.0, @playwright/test@^1.65.0, tailwindcss@^4.3.5, @testing-library/jest-dom@^7.0.1, @testing-library/react@^16.3.3, @types/react@^19.3.0 (+11 more)

### Community 49 - "plugins/__init__.py"
Cohesion: 0.14
Nodes (13): _load(), _check_id(), DiscoveredPlugin, _first_duplicate(), HealthcheckSpec, PanelSpec, PluginManifest, test_duplicate_panel_ids_are_rejected() (+5 more)

### Community 50 - "Cotton — Índice de tareas"
Cohesion: 0.25
Nodes (8): Contratos compartidos, Cotton — Índice de tareas, Cómo usar estos ficheros, Después del MVP, Ficheros, Gates, Olas de trabajo, Tooling

### Community 51 - "test_api_auth.py"
Cohesion: 0.20
Nodes (16): test_cors_allows_known_origin(), test_cors_rejects_unknown_origin(), test_health_is_open(), test_rest_accepts_valid_token(), test_rest_rejects_wrong_token(), test_rest_requires_bearer(), test_ws_rejects_bad_origin(), test_ws_rejects_bad_token() (+8 more)

### Community 52 - "00 — Foundation"
Cohesion: 0.20
Nodes (9): lifespan(), 00 — Foundation, Bloque F1 — Repositorio y tooling, Bloque F2 — Contrato REST/WS, Bloque F5 — Bus de eventos y WebSocket genérico, Bloque F6 — Servido de la SPA, Gate de cierre, Reglas de este fichero (+1 more)

### Community 54 - "test_api_plugins.py"
Cohesion: 0.13
Nodes (13): client_for(), healthcheck(), plugin_manager(), test_failed_healthcheck_is_a_plugin_error(), test_list_activate_and_deactivate_a_plugin(), test_unknown_plugin_is_not_found(), test_websocket_backfills_plugins(), write_plugin() (+5 more)

### Community 55 - "pathlib"
Cohesion: 0.29
Nodes (5): events_from(), test_output_buffer_does_not_exceed_configured_byte_limit(), test_output_buffer_keeps_newest_suffix_of_oversized_chunk(), test_start_publishes_lifecycle_and_ordered_output_events(), wait_for_exit()

### Community 56 - "fastapi_testclient"
Cohesion: 0.25
Nodes (5): executable(), test_commands_require_auth(), test_lists_sorted_executables_from_path(), test_env_endpoint(), test_unknown_api_route_uses_error_envelope()

### Community 57 - "Spec: IDE local para ROS 2"
Cohesion: 0.18
Nodes (11): 10. Plan de trabajo, testing y repositorio, 1. Resumen y objetivos, 2. Alcance del MVP y fases, 3. Requisitos funcionales, 4. Requisitos no funcionales, 5. Arquitectura, 6. Sistema de plugins, 7. API y modelo de datos (+3 more)

### Community 58 - "eslint.config.js"
Cohesion: 0.18
Nodes (10): @eslint/js@^10.0.1, eslint-plugin-react-hooks@^7.1.1, eslint-plugin-react-refresh@^0.5.7, globals@^17.14.0, typescript-eslint@^8.72.1, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+2 more)

### Community 59 - "frontend/package.json"
Cohesion: 0.13
Nodes (14): class-variance-authority@^0.7.1, react-dom@^19.3.1, @types/node@^26.6.6, @types/react-dom@^19.3.0, typescript@^6.0.3, name, private, type (+6 more)

### Community 60 - "scripts"
Cohesion: 0.18
Nodes (10): description, name, private, scripts, build, dev, lint, postinstall (+2 more)

### Community 62 - "os"
Cohesion: 0.22
Nodes (4): list_commands(), executable_names(), main(), test_pty_exec_rejects_missing_executable()

### Community 63 - "test_terminal_ws.py"
Cohesion: 0.14
Nodes (14): build_terminal(), FakePtySession, FakePtySpawner, test_attach_replay_orders_output_that_arrives_during_replay(), test_attach_replays_output_and_detach_stops_control(), test_attach_with_future_sequence_still_forwards_live_output(), test_attached_client_can_send_input_and_resize(), test_terminal_controls_reject_unknown_and_unattached_sessions() (+6 more)

### Community 64 - "01 — Spikes de la etapa 0"
Cohesion: 0.20
Nodes (9): 01 — Spikes de la etapa 0, Bloque S1 — Sondeo del grafo, Bloque S2 — Señales y huérfanos, Bloque S3 — Lichtblick y assets, Bloque S4 — Validación de instalaciones, Bloque S5 — Cierre, Gate de cierre, Reglas de este fichero (+1 more)

### Community 65 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, clsx@^2.1.1, dockview@^8.9.0, dockview-react@^8.9.0, @fontsource-variable/inter@^5.3.0, @fontsource-variable/jetbrains-mono@^5.3.0, lucide-react@^1.73.0, @radix-ui/react-dialog@^1.3.1 (+17 more)

### Community 66 - "5. Arquitectura"
Cohesion: 0.20
Nodes (10): 5.1 Un proceso, dos mundos, 5.2 Arranque y entorno, 5.3 Descubrimiento: `GraphSource`, 5.4 Gestor de procesos, 5.5 Plugins, 5.6 Frontend, 5.7 API, 5.8 Persistencia (+2 more)

### Community 67 - "Auth"
Cohesion: 0.06
Nodes (36): websocket_endpoint(), attach_terminal(), control_terminal(), detach_terminal(), forward(), send(), send_error(), Auth (+28 more)

### Community 69 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, e2e, lint, preview, test, typecheck

### Community 70 - "strategy"
Cohesion: 0.50
Nodes (4): strategy, ros, fail-fast, matrix

### Community 71 - "install_error_handlers"
Cohesion: 0.31
Nodes (7): error_payload(), install_error_handlers(), handle_api_error(), handle_http_error(), handle_ros_environment_error(), handle_validation_error(), _validation_message()

### Community 72 - "test_terminal_api.py"
Cohesion: 0.16
Nodes (11): build_client(), FakePtySession, FakePtySpawner, PermissionDeniedPtySession, test_busy_terminal_requires_confirmation_and_force_closes(), test_close_permission_error_is_reported_and_marks_terminal_failed(), test_command_string_uses_shlex_without_shell_evaluation(), test_invalid_terminal_request_is_rejected_without_spawning() (+3 more)

### Community 73 - "Lichtblick probe — stage 0"
Cohesion: 0.22
Nodes (7): Environment, Install validation, Layout by URL, Lichtblick probe — stage 0, Packaging decision: download, not vendor, Pinned version, Serving and data source

### Community 74 - "Verificaciones que necesitan ROS 2"
Cohesion: 0.33
Nodes (6): Comparación con `ros2` (gate de etapa 1), E2E — Docker y Playwright, T034 — Instalación en Ubuntu con venv `--system-site-packages`, T069/T070 — Parámetros remotos con un nodo real, T200 — Healthcheck del puente de Foxglove, Verificaciones que necesitan ROS 2

### Community 75 - "08 — UI de plugins"
Cohesion: 0.22
Nodes (8): 08 — UI de plugins, Bloque X1 — Lista y activación, Bloque X2 — Panel embebido, Bloque X3 — Panel de Foxglove, Bloque X4 — Cierre, Gate de cierre, Reglas de este fichero, Verificación

### Community 77 - "Cotton"
Cohesion: 0.33
Nodes (6): Cotton, Development, Documentation, Frontend development, Install, What it does

### Community 78 - "vite.config.ts"
Cohesion: 0.33
Nodes (4): @tailwindcss/vite@^4.3.5, @vitejs/plugin-react@^6.3.0, @tailwindcss/vite, @vitejs/plugin-react

### Community 82 - "GraphSnapshot"
Cohesion: 0.32
Nodes (8): app_for(), graph_snapshot(), StubWatcher, test_graph_channel_sends_snapshot_then_status_on_subscribe(), test_graph_channel_sends_status_when_no_snapshot_exists(), test_graph_endpoint_requires_authentication(), test_graph_endpoint_returns_current_snapshot(), test_graph_endpoint_returns_empty_snapshot_before_first_poll()

### Community 83 - "S3 — Lichtblick y assets"
Cohesion: 0.25
Nodes (8): build(), Build (T028), Decisión de empaquetado (T032), Formato de layout por URL (T031), Incidencia con `npm ci` (T027), S3 — Lichtblick y assets, Servido y conexión con el puente (T030), Build

### Community 84 - "Event"
Cohesion: 0.38
Nodes (7): graph_channel(), initial(), register_plugin_channel(), initial(), initial(), Event, initial()

### Community 85 - "test_api_rate.py"
Cohesion: 0.57
Nodes (6): client_for(), StubRate, test_rate_clamps_the_window(), test_rate_of_unknown_topic_is_not_found(), test_rate_requires_authentication(), test_rate_returns_measurement()

### Community 86 - "Services"
Cohesion: 0.26
Nodes (10): client_for(), StubParams, test_params_require_authentication(), test_read_params_of_unknown_node_is_not_found(), test_read_params_rejects_relative_node_name(), test_read_params_returns_values(), test_write_param_rejects_wrong_type(), test_write_param_requires_value() (+2 more)

### Community 87 - ".start"
Cohesion: 0.12
Nodes (12): TerminalBusy, FakePtySession, FakePtySpawner, PermissionDeniedPtySession, test_active_command_requires_force_before_close(), test_command_start_preserves_argv_and_environment_overrides(), test_default_start_uses_shell_and_inherits_environment(), test_idle_shell_can_close_without_confirmation() (+4 more)

### Community 88 - "Review Focus"
Cohesion: 0.29
Nodes (6): Cotton Rename Implementation Plan, Global Constraints, Review Focus, Task 2: Rename installer and deployment entry points, Task 3: Rename frontend identity and browser storage, Task 4: Update documentation and close the rename

### Community 89 - "plugin.yaml"
Cohesion: 0.13
Nodes (14): description, healthcheck, delay_s, retries, timeout_s, url, name, panels (+6 more)

### Community 90 - "test_ros_thread.py"
Cohesion: 0.18
Nodes (10): FakeRosThread, test_call_before_start_fails(), test_call_returns_result(), test_call_times_out(), test_explicit_node_name_is_kept(), test_external_rclpy_shutdown_stops_the_spin_loop(), test_function_errors_propagate(), test_start_is_idempotent() (+2 more)

### Community 92 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 93 - "routes_terminals.py"
Cohesion: 0.18
Nodes (7): _command_argv(), create_router(), create_terminal(), TerminalCreateRequest, _validate_environment(), _working_directory(), TerminalCloseFailed

### Community 94 - "LichtblickAssets"
Cohesion: 0.13
Nodes (14): AssetError, _download(), _extract(), LichtblickAssets, _sha256(), make_archive(), test_ensure_copies_the_default_layout(), test_ensure_verifies_extracts_and_marks_the_cache() (+6 more)

### Community 95 - "graph_probe.py"
Cohesion: 0.24
Nodes (6): main(), measure(), poll(), parse_args(), percentile(), snapshot_ms()

### Community 99 - "Cotton Terminal Workspace — Design"
Cohesion: 0.15
Nodes (12): Acceptance criteria, Approaches considered, Backend sessions and lifecycle, Chosen design, Cotton Terminal Workspace — Design, Decisions left to the builder, Existing architecture, Goals (+4 more)

### Community 100 - "create_app"
Cohesion: 0.21
Nodes (14): create_app(), Services, test_feature_routers_are_protected_automatically(), test_api_error_uses_its_code_and_status(), boom(), test_ros_environment_error_is_reported_without_stack_trace(), ros_down(), test_lifespan_runs_startup_and_shutdown_hooks() (+6 more)

### Community 101 - "PosixPtySession"
Cohesion: 0.14
Nodes (7): _group_alive(), PosixPtySession, _set_window_size(), _signal_group(), _wait_for_fd(), _wait_for_groups_exit(), Task 5 (15 min): Forward input, resize, and stop sessions

### Community 102 - "test_terminal_pty_exec.py"
Cohesion: 0.24
Nodes (10): PosixPtySpawner, _process_group_alive(), test_close_attempts_every_group_after_permission_is_denied(), groups_are_gone(), test_close_does_not_signal_process_group_zero(), test_close_terminates_a_separate_foreground_process_group(), test_close_terminates_the_entire_process_group(), test_posix_pty_has_controlling_terminal_and_roundtrips_input() (+2 more)

### Community 106 - "06 — UI de grafo"
Cohesion: 0.20
Nodes (9): 06 — UI de grafo, Bloque G1 — Vista de grafo, Bloque G2 — Detalle de topic, Bloque G3 — Parámetros y frecuencia, Bloque G4 — Datos en vivo, Bloque G5 — Grafo de nodos y topics, Gate de cierre, Reglas de este fichero (+1 more)

### Community 107 - "test_mvp_ros.py"
Cohesion: 0.08
Nodes (20): _cli_names(), _graph(), _node_names(), ros_client(), test_graph_matches_the_ros_cli_and_measures_pose(), measured(), publishes(), _topic_names() (+12 more)

### Community 116 - "Cotton Rename — Design"
Cohesion: 0.33
Nodes (5): Approaches, Cotton Rename — Design, Goals and non-goals, Intent, Scope and constraints

### Community 117 - "10 — Renombrado integral a Cotton"
Cohesion: 0.33
Nodes (5): 10 — Renombrado integral a Cotton, Bloque R1 — Backend, Bloque R2 — Instalación y despliegue, Bloque R3 — Frontend, Bloque R4 — Documentación y cierre

## Knowledge Gaps
- **2 isolated node(s):** `cotton`, `PYTHONPATH`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 716 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **107 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Services` connect `create_app` to `RosEnvironmentError`, `Channel`, `RosThread`, `PluginManager`, `app.py`, `EventBus`, `cli.py`, `TerminalManager`, `Database`, `conftest.py`, `thread.py`, `Installing Cotton`, `Cotton — Índice de tareas`, `00 — Foundation`, `test_api_plugins.py`, `fastapi_testclient`, `test_terminal_ws.py`, `Auth`, `test_terminal_api.py`, `GraphSnapshot`, `test_api_rate.py`, `Services`, `test_mvp_ros.py`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Are the 63 inferred relationships involving `Services` (e.g. with `websocket_endpoint()` and `create_app()`) actually correct?**
  _`Services` has 63 INFERRED edges - model-reasoned connections that need verification._
- **What connects `cotton`, `PYTHONPATH` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `GraphSource` be split into smaller, more focused modules?**
  _Cohesion score 0.1038961038961039 - nodes in this community are weakly interconnected._
- **Why does `Task 22: API, WebSocket y UI de plugins` connect `PluginManager` to `Auth`, `create_app`, `PluginsView.tsx`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `TerminalManager` (e.g. with `create_router()` and `register_terminal_channels()`) actually correct?**
  _`TerminalManager` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Should `vitest` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._