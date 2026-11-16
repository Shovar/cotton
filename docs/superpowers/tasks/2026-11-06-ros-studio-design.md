# ROS Studio — Índice de tareas

Desglose ejecutable del plan [`docs/superpowers/plans/2026-11-06-ros-studio-mvp.md`](../plans/2026-11-06-ros-studio-mvp.md), que implementa el diseño [`docs/superpowers/specs/2026-11-06-ros-studio-design.md`](../specs/2026-11-06-ros-studio-design.md) y la spec [`Spec IDE local para ROS 2.md`](../../Spec%20IDE%20local%20para%20ROS%202.md).

El trabajo está partido en diez ficheros independientes. Este documento es el índice: reglas comunes, dependencias, contratos compartidos y estado de los gates.

## Cómo usar estos ficheros

- Cada tarea dura **5, 10 o 15 minutos de trabajo activo**. Nunca más.
- Si una tarea se pasa de 15 minutos, se parte en dos (`T0xxa`, `T0xxb`) antes de seguir. No se estira.
- Las esperas de build, CI, descubrimiento DDS o descargas **no cuentan** si se lanzan en segundo plano y se avanza en otra tarea. Cuenta el trabajo manual o de código.
- Las tareas de código siguen TDD: test que falla → implementación mínima → test que pasa.
- Los spikes de la etapa 0 son desechables y no llevan TDD.
- Cada bloque termina con una tarea de verificación y commit. No se pasa al bloque siguiente con tests en rojo.
- `Hecho:` describe la evidencia que cierra la tarea. Si no se puede comprobar, la tarea no está hecha.

Estados: `[ ]` pendiente · `[x]` hecha · `[!]` bloqueada (anotar por qué al lado).

## Ficheros

| Fichero | Tareas | Nº | Depende de | Desbloquea |
| --- | --- | --- | --- | --- |
| [`tasks/00-foundation.md`](2026-11-06-ros-studio-design/00-foundation.md) | T001–T011, T036–T049, T057, T063–T066, T089–T090, T104–T112, T130–T131, T214 | 44 | — | todos |
| [`tasks/01-spikes.md`](2026-11-06-ros-studio-design/01-spikes.md) | T012–T035 | 24 | foundation (repo) | discovery, processes, delivery |
| [`tasks/02-ros-discovery.md`](2026-11-06-ros-studio-design/02-ros-discovery.md) | T050–T056, T058–T062, T067–T079, T216 | 26 | foundation | ui-graph |
| [`tasks/03-processes.md`](2026-11-06-ros-studio-design/03-processes.md) | T113–T129, T132–T153 | 39 | foundation | ui-processes, plugins, delivery |
| [`tasks/04-plugins.md`](2026-11-06-ros-studio-design/04-plugins.md) | T165–T186, T192–T195, T200–T201 | 28 | foundation + `ProcessPort` | ui-plugins, delivery |
| [`tasks/05-ui-shell.md`](2026-11-06-ros-studio-design/05-ui-shell.md) | T080–T088, T091–T092, T215 | 12 | foundation (contrato) | el resto de UI |
| [`tasks/06-ui-graph.md`](2026-11-06-ros-studio-design/06-ui-graph.md) | T093–T103, T217 | 12 | ui-shell + discovery | delivery |
| [`tasks/07-ui-processes.md`](2026-11-06-ros-studio-design/07-ui-processes.md) | T154–T164 | 11 | ui-shell + processes | delivery |
| [`tasks/08-ui-plugins.md`](2026-11-06-ros-studio-design/08-ui-plugins.md) | T187–T191, T196–T199 | 9 | ui-shell + plugins | delivery |
| [`tasks/09-delivery.md`](2026-11-06-ros-studio-design/09-delivery.md) | T202–T213 | 12 | todos | — |

Total: **217 tareas**, ninguna de más de 15 minutos. Las 213 originales conservan su ID; T214 (contrato REST/WS), T215 (registro de paneles), T216 (canal WS del grafo) y T217 (grafo de nodos y topics) son las tareas nuevas que hacen posible el trabajo separado.

## Olas de trabajo

```text
Ola 0: 00-foundation (T001–T011)         → repositorio y tooling
Ola 1: 00-foundation (resto) + 01-spikes → entorno, hilo ROS, bus, WS, seguridad
Ola 2: 02-ros-discovery + 03-processes + 05-ui-shell
Ola 3: 04-plugins + 06-ui-graph + 07-ui-processes
Ola 4: 04-plugins (Foxglove) + 08-ui-plugins
Ola 5: 09-delivery
```

Camino crítico: **foundation → processes → plugins/Foxglove → delivery**. Discovery y la UI de grafo pueden terminar antes.

## Contratos compartidos

Sin estos acuerdos, los ficheros se pisan:

1. **REST/WS:** `docs/contracts/api.md` (T214) fija endpoints, modelos, códigos de error, canales, eventos y auth. Ningún fichero inventa campos.
2. **Migraciones:** v1 registro de procesos (foundation), v2 perfiles (processes), v3 settings (plugins). Nadie crea versiones nuevas.
3. **Composición:** `app.py`, `cli.py` y `Services` se crean en foundation. Cada feature expone su `router` y su función de construcción; el cableado es una línea, no una reescritura.
4. **Puertos:** `GraphSource` para `rclpy`, `ProcessPort` para que plugins arranque procesos sin depender de `ProcessManager`.
5. **UI:** `registerPanel()` y slices de store por feature (T215). Las vistas no editan `Workbench.tsx` ni `store.ts`.

Arquitectura hexagonal flexible: no se crean capas vacías ni un esqueleto `domain/`/`application/` obligatorio. Los modelos Pydantic viven donde el plan ya los coloca.

## Tooling

- Backend: `python -m venv .venv --system-site-packages`, `pip install -e ".[dev]"`, `ruff`, `mypy`, `pytest`.
- Frontend: `npm install`, `npm run lint`, `npm run typecheck`, `npm test -- --coverage`.
- Código y commits en inglés; documentación de tareas en español.
- Verificaciones con ROS: [`docs/verification-ros.md`](../../verification-ros.md).

## Gates

Evidencia local (2026-11-15): `pytest -m "not integration"` 205 passed + 2 deselected
con cobertura 88.5 %; `vitest` 107 passed con 94.5 % de sentencias; `ruff`, `mypy`,
ESLint y `tsc` en verde.
Los gates se marcan solo cuando la comprobación se ejecuta en un entorno ROS real.

- [ ] **Etapa 0:** mediciones en `docs/etapa-0-mediciones.md`, decisión de Lichtblick y las dos instalaciones validadas.
  Falta la instalación Ubuntu por apt (T034); el resto está medido.
- [ ] **Etapa 1:** `/api/env`, grafo por REST/WS y UI de nodos/topics/servicios/acciones/parámetros; coincide con `ros2` y refresca en menos de 2 s.
  Falta ejecutar `docs/verification-ros.md` y comparar con `ros2 node/topic list`.
- [ ] **Etapa 2:** procesos sin huérfanos, logs en vivo con nivel, perfiles, token y `Origin` obligatorios.
  Falta la prueba con procesos reales; los tests con procesos simulados pasan.
- [ ] **Etapa 3:** plugin de Foxglove activo, Lichtblick con layout, Docker y E2E en verde.
  Falta `T200`, el E2E y la ejecución en Docker (`docs/verification-ros.md`).

## Después del MVP

Las etapas 4 y 5 no se desglosan todavía. Cuando el MVP esté cerrado se abrirá un nuevo conjunto de ficheros para:

- **Etapa 4:** workspace colcon, launch files, `colcon build` y grafo visual.
- **Etapa 5:** Gazebo headless, panel `stream`/VNC y pulido de plugins.
