# Graph Report - ROSStudio  (2026-11-18)

## Corpus Check
- 217 files · ~98,914 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 5, .css 1)

## Summary
- 2249 nodes · 5548 edges · 165 communities (99 shown, 66 thin omitted)
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 1076 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cd9df077`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- test_api_processes.py
- GraphSource
- main.tsx
- test_api_profiles.py
- vitest
- RosEnvironmentError
- main.tsx
- plugins/manager.py
- WsClient
- params.py
- Event
- ws.test.ts
- types.ts
- store.ts
- rate.py
- processes/manager.py
- FakeNode
- ProcessesView.tsx
- ThreadGraphSource
- Lichtblick probe — stage 0
- PluginsView.tsx
- client.ts
- with
- RosThread
- test_mvp_ros.py
- PluginManager
- on
- app.py
- TopicGraph.tsx
- ProcessSpec
- TerminalWorkspace.tsx
- graph.py
- compilerOptions
- ProcessManager
- cli.py
- EventBus
- Decisions
- plugins/__init__.py
- pytest
- test_recovery.py
- Review Focus
- AGENTS.md — Working agreement for ROS Studio
- Database
- conftest.py
- thread.py
- .from_dict
- ROS Studio API contract
- cotton
- devDependencies
- plugins/manager.py
- ProcessPort
- test_api_auth.py
- 00 — Foundation
- test_api_plugins.py
- 3. Models
- Installing ROS Studio
- Spec: IDE local para ROS 2
- eslint.config.js
- frontend/package.json
- scripts
- os
- test_terminal_ws.py
- 01 — Spikes de la etapa 0
- dependencies
- Processes panel UX Implementation Plan
- ProcessConflict
- tasks/2026-11-06-ros-studio-design.md
- scripts
- strategy
- 02 — Descubrimiento ROS
- test_terminal_api.py
- setup.ts
- Verificaciones que necesitan ROS 2
- services.py
- Cotton
- vite.config.ts
- dev.sh
- entrypoint.sh
- workspace/README.md
- GraphSnapshot
- commandCompletion.ts
- RateResult
- Services
- EventBus
- plugin.yaml
- test_ros_thread.py
- Processes panel UX — design
- components.json
- ApiError
- LichtblickAssets
- posix.py
- Review Focus
- Cotton Terminal Workspace — Design
- create_app
- PosixPtySession
- integration
- Review Focus
- 06 — UI de grafo
- 09 — Docker, integración, E2E y documentación
- steps
- test_close_does_not_signal_process_group_zero
- ThreadParamsSource
- NoopRos
- Cotton Rename — Design
- 10 — Renombrado integral a Cotton
- OkHandler
- install.sh
- cotton

## God Nodes (most connected - your core abstractions)
1. `Services` - 102 edges
2. `ProcessManager` - 84 edges
3. `EventBus` - 60 edges
4. `TerminalManager` - 50 edges
5. `RosThread` - 49 edges
6. `ProcessSpec` - 45 edges
7. `Database` - 44 edges
8. `RosCallError` - 41 edges
9. `ApiError` - 39 edges
10. `build_services()` - 39 edges

## Surprising Connections (you probably didn't know these)
- `Existing architecture` --references--> `ProcessManager`  [INFERRED]
  docs/superpowers/specs/2026-11-18-terminal-workspace-design.md → backend/src/cotton/processes/manager.py
- `Non-goals and anti-goals` --references--> `ProcessManager`  [INFERRED]
  docs/superpowers/specs/2026-11-18-terminal-workspace-design.md → backend/src/cotton/processes/manager.py
- `Backend sessions and lifecycle` --references--> `ProcessManager`  [INFERRED]
  docs/superpowers/specs/2026-11-18-terminal-workspace-design.md → backend/src/cotton/processes/manager.py
- `Lichtblick assets` --references--> `LichtblickAssets`  [INFERRED]
  docs/plugins.md → backend/src/cotton/plugins/assets.py
- `Bloque P3 — Registro y recuperación` --references--> `ProcessRegistry`  [INFERRED]
  docs/superpowers/tasks/2026-11-06-ros-studio-design/03-processes.md → backend/src/cotton/storage/process_registry.py

## Import Cycles
- None detected.

## Communities (165 total, 66 thin omitted)

### Community 0 - "test_api_processes.py"
Cohesion: 0.24
Nodes (15): Services, client_for(), manager(), sleeper(), test_close_removes_the_terminal(), test_command_string_is_split_with_shlex(), test_create_list_and_stop_a_process(), test_duplicate_active_id_conflicts() (+7 more)

### Community 1 - "GraphSource"
Cohesion: 0.09
Nodes (23): 3. Hexagonal architecture and domain layers, GraphSource, 10. Decisiones mías para revisar, 1. Intención, 2. Alcance, 3.1 Cambios respecto a la spec, 3. Restricciones y decisiones que las fijan, 4. Enfoques considerados (+15 more)

### Community 2 - "main.tsx"
Cohesion: 0.15
Nodes (15): StatusBar(), ENV, THEMES, persistLayout(), { hash }, queryClient, applyTheme(), DEFAULT_PREFERENCES (+7 more)

### Community 3 - "test_api_profiles.py"
Cohesion: 0.08
Nodes (25): create_router(), create_profile(), delete_profile(), start_profile(), update_profile(), _profile(), ProfileBody, _required() (+17 more)

### Community 4 - "vitest"
Cohesion: 0.10
Nodes (8): apiGet, apiSend, PROCESS, record, { send }, terminalMocks, @testing-library/react, vitest

### Community 5 - "RosEnvironmentError"
Cohesion: 0.06
Nodes (38): detect_environment(), ensure_ros_environment(), _optional(), _parse_domain_id(), RosEnvironmentError, _workspace(), test_ros_environment_error_is_reported_without_stack_trace(), ros_down() (+30 more)

### Community 6 - "main.tsx"
Cohesion: 0.11
Nodes (27): Dialog, DialogContent(), DialogTitle(), Input(), Tooltip, TooltipContent(), TooltipProvider, TooltipTrigger (+19 more)

### Community 7 - "plugins/manager.py"
Cohesion: 0.22
Nodes (11): check_health(), Healthcheck, _healthcheck(), HealthcheckError, _probe(), _probe_http(), ok_healthcheck(), failing() (+3 more)

### Community 8 - "WsClient"
Cohesion: 0.21
Nodes (4): Task 11: Shell del frontend, Consoles, nextDelay(), WsClient

### Community 9 - "params.py"
Cohesion: 0.12
Nodes (20): _array_type(), coerce_value(), _convert(), _declared_type(), _parameter(), ParamsNode, ParamsSource, _plain_value() (+12 more)

### Community 10 - "Event"
Cohesion: 0.12
Nodes (24): graph_channel(), initial(), register_plugin_channel(), initial(), _log_channel(), initial(), ProcessRequest, register_process_channels() (+16 more)

### Community 11 - "ws.test.ts"
Cohesion: 0.22
Nodes (3): createClient(), FakeSocket, websocketUrl()

### Community 12 - "types.ts"
Cohesion: 0.09
Nodes (30): Task 12: Vista de grafo, detalle de topic y editor de parámetros, Bloque G2 — Detalle de topic, ErrorData, NodeInfo, ParamValue, PluginManifest, PluginPanelType, ProcessSpec (+22 more)

### Community 13 - "store.ts"
Cohesion: 0.08
Nodes (35): Task 3: Remove processes and clear logs in the store, zustand@^5.1.0, EnvironmentInfo, GraphSnapshot, LogLine, ProcessRecord, ServerEvent, BASE_RECONNECT_DELAY_MS (+27 more)

### Community 14 - "rate.py"
Cohesion: 0.13
Nodes (16): compute_hz(), _count_messages(), is_best_effort(), measure_rate(), _message_type(), ThreadRateSource, FakeNode, FakeQos (+8 more)

### Community 15 - "processes/manager.py"
Cohesion: 0.12
Nodes (13): LogBuffer, LogFileWriter, parse_level(), iso_utc(), LogLine, now(), test_buffer_assigns_process_id_and_marks_stream(), test_buffer_keeps_last_lines() (+5 more)

### Community 16 - "FakeNode"
Cohesion: 0.09
Nodes (8): CountingNode, Endpoint, FakeNode, test_self_node_is_removed_from_endpoints_services_and_actions(), get_publishers_info_by_topic(), get_subscriptions_info_by_topic(), test_snapshot_lists_are_sorted_and_revision_starts_at_zero(), get_publishers_info_by_topic()

### Community 17 - "ProcessesView.tsx"
Cohesion: 0.10
Nodes (26): 07 — UI de procesos, Bloque P1 — Lista y control de procesos, Bloque P2 — Logs, Bloque P3 — Perfiles, Bloque P4 — Paleta y eventos, Gate de cierre, Reglas de este fichero, Verificación (+18 more)

### Community 18 - "ThreadGraphSource"
Cohesion: 0.29
Nodes (4): ThreadGraphSource, test_graph_excludes_cotton_self_node(), test_thread_source_reuses_the_cache_until_the_node_changes(), Task 4: Caché de endpoints por topic

### Community 19 - "Lichtblick probe — stage 0"
Cohesion: 0.06
Nodes (35): build(), Build (T028), Decisión de empaquetado (T032), Decisión go/no-go (T018), Decisión sobre los tiempos de gracia (T025), Entorno de medida, Etapa 0 — Mediciones, Formato de layout por URL (T031) (+27 more)

### Community 20 - "PluginsView.tsx"
Cohesion: 0.10
Nodes (26): 08 — UI de plugins, Bloque X1 — Lista y activación, Bloque X2 — Panel embebido, Bloque X3 — Panel de Foxglove, Bloque X4 — Cierre, Gate de cierre, Reglas de este fichero, Verificación (+18 more)

### Community 21 - "client.ts"
Cohesion: 0.11
Nodes (23): 05 — Shell de la UI, Bloque U0 — Proyecto Vite y tests, Bloque U1 — Token, clientes y estado, Bloque U2 — Workbench y barra de estado, Bloque U3 — Punto de extensión de paneles, Bloque U4 — Integración con el backend, Bloque U5 — Identidad visual, Gate de cierre (+15 more)

### Community 22 - "with"
Cohesion: 0.08
Nodes (27): runs-on, steps, strategy, run, defaults, runs-on, steps, jobs (+19 more)

### Community 23 - "RosThread"
Cohesion: 0.11
Nodes (11): RosCallError, RosCallTimeout, RosThread, call(), call(), Etapa 1 — Grafo (semanas 2–3), Task 10: Frecuencia de topic bajo demanda, Task 6: Hilo ROS y cola de comandos (+3 more)

### Community 24 - "test_mvp_ros.py"
Cohesion: 0.36
Nodes (8): _cli_names(), _graph(), _node_names(), test_graph_matches_the_ros_cli_and_measures_pose(), measured(), publishes(), _topic_names(), _without_our_own()

### Community 25 - "PluginManager"
Cohesion: 0.13
Nodes (11): PluginError, PluginManager, visit(), PluginNotFound, PluginRecord, Etapa 3 — Foxglove y plugins (semanas 7–8), Task 20: Manifiestos de plugin y loader, Task 21: `PluginManager` con activación, dependencias y healthchecks (+3 more)

### Community 26 - "on"
Cohesion: 0.20
Nodes (9): runs-on, jobs, e2e, name, on, pull_request, push, workflow_dispatch (+1 more)

### Community 27 - "app.py"
Cohesion: 0.10
Nodes (12): ImmutableStaticFiles, mount_spa(), mount_viewer(), viewer(), _viewer_missing_page(), test_mount_spa_reports_missing_build(), test_mount_spa_serves_built_assets(), test_mount_spa_serves_index_and_falls_back() (+4 more)

### Community 28 - "TopicGraph.tsx"
Cohesion: 0.16
Nodes (15): clamp(), GRAPH_HEIGHT, GRAPH_WIDTH, GraphLayout, GraphLink, GraphPoint, layoutGraph(), place() (+7 more)

### Community 29 - "ProcessSpec"
Cohesion: 0.28
Nodes (17): ProcessSpec, test_real_ros_thread_roundtrip(), eventually(), group_alive(), process_alive(), python_script(), test_close_forgets_an_already_exited_process(), test_close_stops_forgets_and_announces() (+9 more)

### Community 30 - "TerminalWorkspace.tsx"
Cohesion: 0.09
Nodes (36): TerminalRecord, ws, Button(), buttonVariants, registerTerminalPanel(), EMPTY_OUTPUT_CHUNKS, encodeBase64(), TerminalBody() (+28 more)

### Community 31 - "graph.py"
Cohesion: 0.13
Nodes (19): _action_names(), EndpointLike, _endpoints(), _full_name(), NodeLike, _owned_by_app(), RclpyGraphSource, _topics_by_endpoint() (+11 more)

### Community 32 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+12 more)

### Community 33 - "ProcessManager"
Cohesion: 0.11
Nodes (10): _stop_all(), ProcessManager, ProcessRegistryPort, ProcessRecord, FakeProcesses, _record(), test_missing_process_raises(), Task 1: Close a terminal in the process manager (+2 more)

### Community 34 - "cli.py"
Cohesion: 0.24
Nodes (5): allowed_origins(), browser_url(), main(), parse_args(), generate_token()

### Community 35 - "EventBus"
Cohesion: 0.27
Nodes (10): GraphWatcher, CallbackSource, FakeRos, graph_with(), test_stop_cancels_the_running_task(), test_watcher_publishes_every_change_with_increasing_revision(), test_watcher_publishes_only_when_snapshot_changes(), test_watcher_recovers_after_a_failed_poll() (+2 more)

### Community 36 - "Decisions"
Cohesion: 0.25
Nodes (8): Closing a terminal, Command entry, Decisions, English pass, Process cards, Profiles, Store, Terminal semantics

### Community 37 - "plugins/__init__.py"
Cohesion: 0.17
Nodes (13): _load(), PluginLoader, DiscoveredPlugin, _first_duplicate(), PanelSpec, test_builtin_foxglove_manifest_is_discovered(), test_builtin_foxglove_panel_uses_the_runtime_port(), test_discovers_a_valid_manifest_with_argv() (+5 more)

### Community 38 - "pytest"
Cohesion: 0.19
Nodes (16): PluginManifest, test_duplicate_panel_ids_are_rejected(), test_duplicate_process_ids_are_rejected(), test_healthcheck_url_scheme_is_validated(), test_manifest_to_dict_matches_the_contract(), test_name_and_argv_are_validated(), test_panel_requires_a_url(), test_valid_manifest_keeps_argv() (+8 more)

### Community 39 - "test_recovery.py"
Cohesion: 0.16
Nodes (14): StopTimeouts, ProcessRegistry, manager(), record(), test_registry_requires_a_pid(), test_registry_saves_lists_and_deletes(), test_registry_upserts_existing_rows(), dead_record() (+6 more)

### Community 40 - "Review Focus"
Cohesion: 0.14
Nodes (13): Cierre, Corrección de hallazgos de auditoría — Plan de implementación, Global Constraints, Review Focus, Task 10: Alinear la documentación con el código, Task 11: Runbook para las verificaciones que necesitan ROS, Task 1: Sacar el token del access log, Task 5: Servicios y acciones en la UI del grafo (+5 more)

### Community 41 - "AGENTS.md — Working agreement for ROS Studio"
Cohesion: 0.14
Nodes (13): 10. Commits, language and documentation, 11. Definition of done, 12. What agents must not do, 13. References, 1. Mandatory working style, 2. Before writing anything, 4. Fixed stack and tooling, 5. Test-driven development (+5 more)

### Community 42 - "Database"
Cohesion: 0.14
Nodes (23): lifespan(), SettingsRepository, Database, build_manager(), FakeProcesses, find(), test_activation_is_persisted_and_restored(), test_activation_starts_dependencies_first() (+15 more)

### Community 43 - "conftest.py"
Cohesion: 0.12
Nodes (11): health(), read_environment(), EnvironmentInfo, auth_headers(), bus(), client(), env_info(), services() (+3 more)

### Community 44 - "thread.py"
Cohesion: 0.09
Nodes (16): _absolute(), create_router(), read_params(), write_param(), ParamValue, _run(), create_router(), read_rate() (+8 more)

### Community 45 - ".from_dict"
Cohesion: 0.31
Nodes (5): started_at(), test_log_line_serializes_contract_shape(), test_process_record_serializes_contract_shape(), test_process_spec_roundtrips_through_json_dict(), TerminalRecord

### Community 46 - "ROS Studio API contract"
Cohesion: 0.14
Nodes (13): frontend_not_built(), 1. Authentication, 2. Error envelope, 4. REST endpoints, 5. WebSocket `/ws`, 6. SPA serving, 7. Backend extension points, Channels and initial backfill (+5 more)

### Community 47 - "cotton"
Cohesion: 0.15
Nodes (12): context, dockerfile, build, command, environment, image, init, ports (+4 more)

### Community 48 - "devDependencies"
Cohesion: 0.09
Nodes (19): devDependencies, eslint@^10.14.0, jsdom@^31.0.0, @playwright/test@^1.65.0, tailwindcss@^4.3.5, @testing-library/jest-dom@^7.0.1, @testing-library/react@^16.3.3, @types/react@^19.3.0 (+11 more)

### Community 49 - "plugins/manager.py"
Cohesion: 0.19
Nodes (5): _process_id(), _process_spec(), _check_id(), HealthcheckSpec, PluginProcessSpec

### Community 50 - "ProcessPort"
Cohesion: 0.13
Nodes (14): ProcessPort, 04 — Plugins y Foxglove, Bloque X3 — API y WS de plugins, Gate de cierre, Reglas de este fichero, Verificación, Contratos compartidos, Cotton — Índice de tareas (+6 more)

### Community 51 - "test_api_auth.py"
Cohesion: 0.29
Nodes (9): test_cors_allows_known_origin(), test_cors_rejects_unknown_origin(), test_health_is_open(), test_rest_accepts_valid_token(), test_rest_rejects_wrong_token(), test_rest_requires_bearer(), test_ws_rejects_bad_origin(), test_ws_rejects_bad_token() (+1 more)

### Community 52 - "00 — Foundation"
Cohesion: 0.25
Nodes (7): 00 — Foundation, Bloque F1 — Repositorio y tooling, Bloque F2 — Contrato REST/WS, Bloque F6 — Servido de la SPA, Gate de cierre, Reglas de este fichero, Verificación

### Community 54 - "test_api_plugins.py"
Cohesion: 0.27
Nodes (8): client_for(), healthcheck(), plugin_manager(), test_failed_healthcheck_is_a_plugin_error(), test_list_activate_and_deactivate_a_plugin(), test_unknown_plugin_is_not_found(), test_websocket_backfills_plugins(), write_plugin()

### Community 55 - "3. Models"
Cohesion: 0.18
Nodes (11): 3. Models, EnvironmentInfo, GraphSnapshot, LogLine, NodeInfo, PluginRecord, ProcessRecord, ProcessSpec (+3 more)

### Community 56 - "Installing ROS Studio"
Cohesion: 0.17
Nodes (11): apt (Ubuntu 22.04 and 24.04), Build a wheel manually, Changing `ROS_DOMAIN_ID`, Docker, Installer (recommended), Installing Cotton, Integration and E2E, Offline Lichtblick assets (+3 more)

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
Cohesion: 0.19
Nodes (7): list_commands(), executable_names(), _group_alive(), _group_gone(), _pid_alive(), _signal_group(), _startup_error()

### Community 63 - "test_terminal_ws.py"
Cohesion: 0.14
Nodes (14): build_terminal(), FakePtySession, FakePtySpawner, test_attach_replay_orders_output_that_arrives_during_replay(), test_attach_replays_output_and_detach_stops_control(), test_attach_with_future_sequence_still_forwards_live_output(), test_attached_client_can_send_input_and_resize(), test_terminal_controls_reject_unknown_and_unattached_sessions() (+6 more)

### Community 64 - "01 — Spikes de la etapa 0"
Cohesion: 0.20
Nodes (9): 01 — Spikes de la etapa 0, Bloque S1 — Sondeo del grafo, Bloque S2 — Señales y huérfanos, Bloque S3 — Lichtblick y assets, Bloque S4 — Validación de instalaciones, Bloque S5 — Cierre, Gate de cierre, Reglas de este fichero (+1 more)

### Community 65 - "dependencies"
Cohesion: 0.08
Nodes (25): dependencies, clsx@^2.1.1, dockview@^8.9.0, dockview-react@^8.9.0, @fontsource-variable/inter@^5.3.0, @fontsource-variable/jetbrains-mono@^5.3.0, lucide-react@^1.73.0, @radix-ui/react-dialog@^1.3.1 (+17 more)

### Community 66 - "Processes panel UX Implementation Plan"
Cohesion: 0.50
Nodes (3): Final verification, Global Constraints, Processes panel UX Implementation Plan

### Community 67 - "ProcessConflict"
Cohesion: 0.12
Nodes (18): ProcessConflict, ProcessNotFound, wait(), Etapa 2 — Procesos (semanas 4–6), Task 13: Token de sesión y validación de `Origin`, Task 15: `ProcessManager` con arranque, streaming y parada ordenada, Task 17: API REST y WebSocket de procesos, Task 18: Perfiles de lanzamiento (+10 more)

### Community 68 - "tasks/2026-11-06-ros-studio-design.md"
Cohesion: 0.26
Nodes (4): Lichtblick assets, Manifest, Plugins, Tareas

### Community 69 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, e2e, lint, preview, test, typecheck

### Community 70 - "strategy"
Cohesion: 0.50
Nodes (4): strategy, ros, fail-fast, matrix

### Community 71 - "02 — Descubrimiento ROS"
Cohesion: 0.25
Nodes (7): 02 — Descubrimiento ROS, Bloque D1 — Modelos y GraphSource, Bloque D2 — Watcher y estado de conexión, Bloque D3 — Canal WS del grafo, Gate de cierre, Reglas de este fichero, Verificación

### Community 72 - "test_terminal_api.py"
Cohesion: 0.16
Nodes (11): build_client(), FakePtySession, FakePtySpawner, PermissionDeniedPtySession, test_busy_terminal_requires_confirmation_and_force_closes(), test_close_permission_error_is_reported_and_marks_terminal_failed(), test_command_string_uses_shlex_without_shell_evaluation(), test_invalid_terminal_request_is_rejected_without_spawning() (+3 more)

### Community 74 - "Verificaciones que necesitan ROS 2"
Cohesion: 0.33
Nodes (6): Comparación con `ros2` (gate de etapa 1), E2E — Docker y Playwright, T034 — Instalación en Ubuntu con venv `--system-site-packages`, T069/T070 — Parámetros remotos con un nodo real, T200 — Healthcheck del puente de Foxglove, Verificaciones que necesitan ROS 2

### Community 75 - "services.py"
Cohesion: 0.16
Nodes (10): websocket_endpoint(), attach_terminal(), control_terminal(), detach_terminal(), forward(), send(), send_error(), Auth (+2 more)

### Community 77 - "Cotton"
Cohesion: 0.33
Nodes (6): Cotton, Development, Documentation, Frontend development, Install, What it does

### Community 78 - "vite.config.ts"
Cohesion: 0.33
Nodes (4): @tailwindcss/vite@^4.3.5, @vitejs/plugin-react@^6.3.0, @tailwindcss/vite, @vitejs/plugin-react

### Community 82 - "GraphSnapshot"
Cohesion: 0.18
Nodes (11): create_router(), read_graph(), GraphSnapshot, app_for(), graph_snapshot(), StubWatcher, test_graph_channel_sends_snapshot_then_status_on_subscribe(), test_graph_channel_sends_status_when_no_snapshot_exists() (+3 more)

### Community 83 - "commandCompletion.ts"
Cohesion: 0.15
Nodes (19): allGraphSuggestions(), applySuggestion(), candidates(), complete(), CompletionSources, contextEntity(), EntityKind, graphSuggestions() (+11 more)

### Community 85 - "RateResult"
Cohesion: 0.18
Nodes (10): RateResult, RateSource, client_for(), StubRate, test_rate_clamps_the_window(), test_rate_of_unknown_topic_is_not_found(), test_rate_requires_authentication(), test_rate_returns_measurement() (+2 more)

### Community 86 - "Services"
Cohesion: 0.26
Nodes (10): client_for(), StubParams, test_params_require_authentication(), test_read_params_of_unknown_node_is_not_found(), test_read_params_rejects_relative_node_name(), test_read_params_returns_values(), test_write_param_rejects_wrong_type(), test_write_param_requires_value() (+2 more)

### Community 87 - "EventBus"
Cohesion: 0.05
Nodes (40): EventBus, TerminalBusy, TerminalCloseFailed, TerminalManager, TerminalNotFound, TerminalChunk, TerminalRecord, TerminalSpec (+32 more)

### Community 89 - "plugin.yaml"
Cohesion: 0.11
Nodes (17): description, healthcheck, delay_s, retries, timeout_s, url, name, panels (+9 more)

### Community 90 - "test_ros_thread.py"
Cohesion: 0.18
Nodes (10): FakeRosThread, test_call_before_start_fails(), test_call_returns_result(), test_call_times_out(), test_explicit_node_name_is_kept(), test_external_rclpy_shutdown_stops_the_spin_loop(), test_function_errors_propagate(), test_start_is_idempotent() (+2 more)

### Community 91 - "Processes panel UX — design"
Cohesion: 0.20
Nodes (9): Addendum 2026-11-16 — command completion, Approaches considered, Goals, Intent, Left to the builder, Non-goals, Open risks, Processes panel UX — design (+1 more)

### Community 92 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 93 - "ApiError"
Cohesion: 0.09
Nodes (18): create_router(), activate_plugin(), deactivate_plugin(), create_router(), close_process(), create_process(), delete_process(), read_logs() (+10 more)

### Community 94 - "LichtblickAssets"
Cohesion: 0.07
Nodes (30): AssetError, _download(), _extract(), LichtblickAssets, _sha256(), _fake_wheel(), _path_without_ros2(), test_installer_defaults_to_cotton_prefix() (+22 more)

### Community 95 - "posix.py"
Cohesion: 0.22
Nodes (5): _group_alive(), _set_window_size(), _wait_for_groups_exit(), main(), test_pty_exec_rejects_missing_executable()

### Community 96 - "Review Focus"
Cohesion: 0.12
Nodes (16): Review Focus, Task 10 (15 min): Create and manage terminal sessions in the UI, Task 11 (15 min): Manage named terminal groups, Task 12 (15 min): Add tabbed and mosaic group layouts, Task 13 (10 min): Minimize, restore, and persist the layout, Task 14 (15 min): Reattach and replay after WebSocket reconnect, Task 15 (15 min): Verify the complete terminal flow and document behavior, Task 16 (15 min): Run final checks and close the feature (+8 more)

### Community 99 - "Cotton Terminal Workspace — Design"
Cohesion: 0.15
Nodes (12): Acceptance criteria, Approaches considered, Backend sessions and lifecycle, Chosen design, Cotton Terminal Workspace — Design, Decisions left to the builder, Existing architecture, Goals (+4 more)

### Community 100 - "create_app"
Cohesion: 0.15
Nodes (14): create_app(), ros_client(), test_feature_routers_are_protected_automatically(), executable(), test_commands_require_auth(), test_lists_sorted_executables_from_path(), test_lifespan_runs_startup_and_shutdown_hooks(), test_lifespan_starts_and_stops_ros() (+6 more)

### Community 101 - "PosixPtySession"
Cohesion: 0.24
Nodes (4): PosixPtySession, _signal_group(), _wait_for_fd(), Task 5 (15 min): Forward input, resize, and stop sessions

### Community 102 - "integration"
Cohesion: 0.43
Nodes (6): _process_group_alive(), test_close_terminates_a_separate_foreground_process_group(), test_close_terminates_the_entire_process_group(), test_posix_pty_has_controlling_terminal_and_roundtrips_input(), runs-on, integration

### Community 105 - "Review Focus"
Cohesion: 0.29
Nodes (7): Review Focus, Task 0: Commit the design and the plan, Task 4: Drive processes from a terminal prompt, Task 5: Process cards that fit the panel, Task 6: Open, close and remove terminals, Task 7: Show what a profile stores, Task 8: Translate the rest of the UI to English

### Community 106 - "06 — UI de grafo"
Cohesion: 0.22
Nodes (8): 06 — UI de grafo, Bloque G1 — Vista de grafo, Bloque G3 — Parámetros y frecuencia, Bloque G4 — Datos en vivo, Bloque G5 — Grafo de nodos y topics, Gate de cierre, Reglas de este fichero, Verificación

### Community 107 - "09 — Docker, integración, E2E y documentación"
Cohesion: 0.14
Nodes (11): wait_until(), 09 — Docker, integración, E2E y documentación, Bloque E1 — Integración backend, Bloque E2 — E2E, Bloque E3 — Docker, Bloque E4 — CI, Bloque E5 — Documentación, Bloque E6 — Cierre (+3 more)

### Community 108 - "steps"
Cohesion: 0.24
Nodes (10): steps, steps, if, name, run, uses, with, cache (+2 more)

### Community 113 - "test_close_does_not_signal_process_group_zero"
Cohesion: 0.33
Nodes (3): test_close_attempts_every_group_after_permission_is_denied(), groups_are_gone(), test_close_does_not_signal_process_group_zero()

### Community 116 - "Cotton Rename — Design"
Cohesion: 0.33
Nodes (5): Approaches, Cotton Rename — Design, Goals and non-goals, Intent, Scope and constraints

### Community 117 - "10 — Renombrado integral a Cotton"
Cohesion: 0.33
Nodes (5): 10 — Renombrado integral a Cotton, Bloque R1 — Backend, Bloque R2 — Instalación y despliegue, Bloque R3 — Frontend, Bloque R4 — Documentación y cierre

## Knowledge Gaps
- **2 isolated node(s):** `cotton`, `PYTHONPATH`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 745 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **66 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Services` connect `test_api_processes.py` to `test_api_profiles.py`, `RosEnvironmentError`, `Event`, `RosThread`, `PluginManager`, `app.py`, `cli.py`, `EventBus`, `Database`, `conftest.py`, `ROS Studio API contract`, `ProcessPort`, `00 — Foundation`, `test_api_plugins.py`, `test_terminal_ws.py`, `ProcessConflict`, `test_terminal_api.py`, `services.py`, `GraphSnapshot`, `RateResult`, `Services`, `EventBus`, `ApiError`, `Review Focus`, `create_app`, `Review Focus`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **Are the 90 inferred relationships involving `Services` (e.g. with `websocket_endpoint()` and `create_app()`) actually correct?**
  _`Services` has 90 INFERRED edges - model-reasoned connections that need verification._
- **What connects `cotton`, `PYTHONPATH` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `GraphSource` be split into smaller, more focused modules?**
  _Cohesion score 0.09333333333333334 - nodes in this community are weakly interconnected._
- **Why does `Contratos compartidos` connect `ProcessPort` to `test_api_processes.py`, `ProcessManager`, `PluginsView.tsx`, `GraphSource`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Are the 60 inferred relationships involving `ProcessManager` (e.g. with `create_router()` and `_log_channel()`) actually correct?**
  _`ProcessManager` has 60 INFERRED edges - model-reasoned connections that need verification._
- **Should `test_api_profiles.py` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._