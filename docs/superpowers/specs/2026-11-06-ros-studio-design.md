# ROS Studio — diseño v1

Nov 6, 2026 · @toni · estado: aprobado

Spec de referencia: [`Spec IDE local para ROS 2.md`](../../Spec%20IDE%20local%20para%20ROS%202.md)

## 1. Intención

ROS Studio es el panel de control que falta entre `rqt` y una docena de terminales: una web local que muestra el grafo ROS 2, gestiona los procesos de launch y embebe la visualización, sin cuentas ni nube.

Se instala y se lanza **dentro del entorno ROS 2 que el usuario ya tiene activo**, igual que `rqt` o `ros2`. No trae su propio ROS, no cambia de distro y no adivina la configuración de nadie: la lee del entorno y, si falta algo, lo dice con un mensaje accionable.

## 2. Alcance

**Entra en la v1 (MVP, etapas 1–3):** grafo de nodos, topics, servicios y acciones; parámetros de nodos en ejecución; gestor de procesos con logs en vivo y perfiles; plugin de Foxglove con Lichtblick embebido.

**Hoja de ruta, sin detallar todavía:** árbol de workspace colcon y `colcon build` (etapa 4); grafo visual (RF-11, etapa 4); Gazebo y el tipo `stream`/VNC (etapa 5).

**No entra:** edición de código, ROS 1, flotas, depuración, rosbag, RViz, sandbox de plugins.

## 3. Restricciones y decisiones que las fijan

- **Una instancia = un entorno.** La app vive dentro del entorno activo y hereda su `rclpy`, su DDS y su distro. Cambiar de distro o de `ROS_DOMAIN_ID` implica relanzar la app; no se reinicializa `rclpy` en caliente. Se eliminan de la v1 los perfiles de entorno, el prefijo de comando y el agente de descubrimiento: resolvían un problema que desaparece con este modelo.
- **Nada hardcodeado.** Distro, dominio, RMW, prefijos y workspace se leen del entorno (`ROS_DISTRO`, `ROS_DOMAIN_ID`, `RMW_IMPLEMENTATION`, `AMENT_PREFIX_PATH`, `ros2` en `PATH`). Una comprobación al arrancar falla con un mensaje que explica cómo activar el entorno.
- **`rclpy` no es dependencia de PyPI.** Lo aporta el entorno ROS; el wheel lo comprueba en tiempo de ejecución y no lo declara, para no romper resolvedores ni instalar un `rclpy` huérfano.
- **Docker no tiene camino especial.** La misma app se instala dentro del contenedor; solo cambian el bind (`--host 0.0.0.0`) y los puertos publicados en loopback. Es la única excepción documentada al bind por defecto.
- **Seguridad desde la fase 2.** Bind a `127.0.0.1`, token de sesión, validación de `Origin` en WebSocket y CORS restringido. Lanzar procesos es equivalente a dar una shell.
- **Nombre y licencia (decisión mía, revisable):** paquete `ros-studio`, licencia Apache-2.0, la que mejor encaja con un ecosistema de plugins de terceros.

### 3.1 Cambios respecto a la spec

Estas diferencias son deliberadas y sustituyen a lo que dice la spec:

- **RF-3 queda superado.** La UI muestra distro, dominio y workspace detectados y ofrece el comando exacto para relanzar con otro dominio o distro; no los cambia desde dentro. Elegir workspace sourceado pertenece a la etapa 4 y también se lee del entorno.
- **Fuera perfiles de entorno, prefijo de comando y agente de descubrimiento.** Una instancia, un entorno.
- **RF-7 se simplifica.** Los procesos de un perfil arrancan en el orden en que están listados; la ordenación por dependencias se reserva a la activación de plugins.
- **Docker usa la misma app y publica dos puertos en loopback** (`8000` y `8765`), porque el panel de Lichtblick se conecta directo a `foxglove_bridge`. Navegador en la misma máquina; el navegador remoto queda fuera de la v1.
- **La descarga de Lichtblick en el primer arranque es aceptable** si el wheel se vuelve demasiado grande. Se documentará cómo pre-sembrar la caché para instalaciones sin red.
- **macOS se usa en desarrollo con pixi/RoboStack, pero el soporte oficial sigue siendo Linux, WSL2 y Docker** (RNF-3). CI corre en Linux; macOS se prueba a mano.
- **RF-10 se reparte:** la etapa 3 incluye el runtime de plugins y los plugins `iframe`/`stream` de usuario; la etapa 5 añade Gazebo, el tipo `stream` en serio y el pulido.

## 4. Enfoques considerados

1. **Paquete Python único dentro del entorno ROS (elegido).** FastAPI + `rclpy` en proceso, UI React compilada y servida por el backend, procesos con `asyncio` y `setsid`. Un proceso, un comando, el modelo de `rqt`.
   - Coste: el frontend se compila antes de publicar y el wheel queda ligado a la distro del entorno. Es exactamente lo que se quiere.
2. **Backend Python con la CLI `ros2` como adaptador.** Más desacoplado, pero 1–2 s por consulta, difícil cumplir el refresco de 2 s y pobre en parámetros y acciones. Se conserva solo como **interfaz** (`GraphSource`), sin implementación en la v1.
3. **Go + rosbridge o app Tauri.** Binario único y buen control de procesos, pero no vive dentro del entorno del usuario y empobrece parámetros y acciones. Descartado.

Frontend igual en las tres: React + TypeScript + Vite, layout con `dockview`, Lichtblick fijado y servido en local.

## 5. Arquitectura

### 5.1 Un proceso, dos mundos

`ros-studio` arranca un único proceso Python: FastAPI/uvicorn en el bucle asyncio y un **hilo ROS** dedicado que posee el nodo `rclpy`. `rclpy` no es thread-safe, así que todas las llamadas al grafo y a parámetros pasan por una cola de comandos con futuros; la API async espera sin bloquear el event loop. El nodo propio (`/ros_studio_<pid>`) se excluye siempre del grafo mostrado.

El backend sirve la SPA compilada, la API REST, el WebSocket y los ficheros estáticos de Lichtblick. No hay segundo servidor salvo `foxglove_bridge`, que es un proceso gestionado.

### 5.2 Arranque y entorno

1. Comprobar `rclpy`, `ROS_DISTRO`, `AMENT_PREFIX_PATH` y `ros2` en `PATH`; si falta, salir con instrucciones para pixi, `source` o Docker.
2. Leer dominio (por defecto 0), RMW y workspace activo.
3. Exponer lo detectado en `GET /api/env` y en la barra de estado.
4. Abrir el navegador en `http://127.0.0.1:<puerto>/#token=...` salvo `--no-browser`.

Si el usuario cambia `ROS_DOMAIN_ID`, reinicia la app. El README lo dice explícitamente.

### 5.3 Descubrimiento: `GraphSource`

Interfaz única, implementada solo con `rclpy` en la v1:

- `snapshot()`: nodos con namespace, topics con tipo, servicios, acciones.
- `changes()`: sondeo cada segundo; nombres y tipos se leen siempre, y editores y suscriptores (`get_publishers_info_by_topic`) se cachean por topic hasta que cambian sus tipos. La v1 emite el snapshot completo por WebSocket; los deltas quedan para la etapa 4 (el sondeo completo cuesta 0.6 % de CPU con 100 topics, medido en la etapa 0).
- `get_params(node)` / `set_param(node, name, value)`: `AsyncParameterClient` contra el nodo remoto.

La etapa 0 mide el coste real de este sondeo con 100 topics. Si no cabe en el 5 % de CPU de RNF-1, se ajusta la estrategia (intervalo, consultas perezosas), no el stack. Las acciones se exponen si la distro ofrece `get_action_names_and_types`; si no, se degrada y se documenta.

**Frecuencia de un topic.** Se mide bajo demanda: al abrir el detalle, el hilo ROS crea una suscripción temporal con el QoS del editor, cuenta mensajes durante 2 s y la destruye. Si el tipo no se puede importar, se muestra «no disponible». No hay suscripciones permanentes, así que no afecta al consumo en reposo.

### 5.4 Gestor de procesos

- `ProcessSpec`: `id`, `argv` (sin shell, parseado con `shlex`), `env` extra, `cwd`, `plugin`, `autostart`. Los hijos heredan el entorno ya activo; no hace falta `source` adicional.
- Estados: `starting → running → stopping → exited | failed`, con código de salida y timestamps.
- Lanzamiento con `asyncio.create_subprocess_exec(start_new_session=True)`; la salida y el error se leen en tareas async.
- Parada ordenada: `SIGINT` al grupo, 5 s, `SIGTERM`, 3 s, `SIGKILL`. Tiempos configurables.
- Logs: buffer circular de 2000 líneas por proceso, fichero rotado por proceso y difusión por `process.log`.
- Registro de PIDs en SQLite. Al arrancar, se comprueban los procesos vivos: se marcan como huérfanos recuperables y se ofrece pararlos; sus pipes no se pueden reenganchar, así que no habrá logs nuevos hasta reiniciarlos.
- Al cerrar el backend se paran todos los hijos (RNF-5). No hay modo «dejar corriendo» en la v1.
- Perfiles (RF-7): conjunto de `ProcessSpec` con argumentos, guardado en SQLite y arranque con un clic en el orden listado. La ordenación por dependencias solo existe en la activación de plugins.

### 5.5 Plugins

- Manifiestos `plugin.yaml` validados con Pydantic, en `ros_studio/plugins/` (incluidos) y `~/.config/ros-studio/plugins/` (usuario).
- Ciclo: descubierto → activo → detenido. «Instalado» significa presente en disco.
- Al activar: procesos en orden de dependencia, healthcheck `tcp://` o `http://` con timeout y panel habilitado solo cuando todo está sano.
- Tipos de panel: `iframe`, `stream` (VNC/noVNC) y `native`.
- **Límite consciente de la v1:** los paneles de plugins de terceros son `iframe` o `stream`; los `native` son del núcleo (grafo). Añadir un `native` de terceros exigiría recompilar el frontend, así que RNF-7 se cumple para los otros dos tipos y así se documenta.
- Permisos visibles al activar, no aplicados.
- Plugin `foxglove`: proceso `foxglove_bridge` + panel del visor. El manifiesto abstrae la URL, de modo que cambiar de visor no toque el núcleo.

### 5.6 Frontend

React 19 + TypeScript + Vite, `dockview` para el layout, TanStack Query para REST y un store ligero para el estado en vivo del WebSocket.

- Barra de actividad: Workspace, Grafo, Procesos, Plugins, Ajustes.
- Barra lateral: árbol, listas con búsqueda, procesos con estado.
- Centro: pestañas (grafo, detalle de topic, panel de plugin).
- Inferior: logs por proceso y salida de build.
- Barra de estado: distro, dominio, workspace, procesos activos, errores.
- Paleta de comandos (`Ctrl+Shift+P`), tema claro/oscuro, layout guardado en `localStorage` en la v1.
- El panel de Lichtblick es un `iframe` a la URL del manifiesto (`?ds=foxglove-websocket&ds.url=ws://127.0.0.1:8765`); la etapa 0 confirma el formato vigente.

### 5.7 API

Se mantiene la tabla de la spec con estos añadidos: `GET /api/env`, `GET /api/health`, `POST /api/processes/{id}/restart`, `GET /api/processes/{id}/logs?lines=` (relleno inicial), `DELETE /api/plugins/{id}/activate` y CRUD de perfiles.

- Token generado al arrancar, entregado en el fragmento de URL y guardado en `sessionStorage`; `Authorization: Bearer` en REST y `?token=` en `/ws`.
- `Origin` permitido: el propio host y puerto; en modo dev, el de Vite. Cualquier otro se rechaza, también en WebSocket.
- Errores JSON `{code, message}`; `409` para conflictos de estado.
- Un solo WebSocket con suscripción a canales y mensajes `{type, data}` según la spec.

### 5.8 Persistencia

SQLite en el directorio de configuración de plataforma (`~/.config/ros-studio/` en Linux): ajustes, perfiles, specs de procesos, estado de plugins y registro de PIDs. Migraciones con `user_version`. Logs rotados en el directorio de estado. Sin ORM: `sqlite3` y una capa de repositorios pequeña.

### 5.9 Empaquetado e instalación

- `pyproject.toml` con hatchling; dependencias: `fastapi`, `uvicorn`, `pydantic`, `pyyaml`, `platformdirs`. `rclpy` fuera, comprobado en runtime.
- Frontend compilado en CI y empaquetado dentro del wheel; comando `ros-studio`.
- **pixi:** `pixi add fastapi uvicorn` desde conda-forge y `pixi add --pypi ros-studio`, para no mezclar resolvedores. Se valida en la etapa 0; si el resolvedor se queja de dependencias duplicadas, se documenta la variante `--no-deps` con las de conda.
- **apt (Ubuntu 22.04/24.04):** venv con `--system-site-packages` para que vea el `rclpy` del sistema, y `pip install ros-studio` dentro. Documentado en README.
- **Docker:** instalación normal dentro de la imagen y `--host 0.0.0.0` dentro del contenedor. Se publican `127.0.0.1:8000:8000` y `127.0.0.1:8765:8765`: el panel de Lichtblick se conecta directo a `foxglove_bridge`, así que el puerto del puente también tiene que estar en el host. Ambos quedan atados a loopback y el README avisa de que en Docker el token protege la API, no el puente. Navegador remoto fuera de alcance.
- **Lichtblick:** la etapa 0 mide el tamaño del build y revisa la licencia vigente. Si el wheel se vuelve demasiado grande, se acepta la descarga fijada con checksum en el primer arranque a la caché local; se documenta cómo pre-sembrarla para instalaciones sin red. Si cabe, se vendoriza. En ambos casos la versión queda fijada y la URL vive en el manifiesto.

## 6. Etapas

| Etapa | Contenido | Criterio de aceptación | Estimación |
| --- | --- | --- | --- |
| **0. Prototipo de riesgo** | Script que inicializa `rclpy` dentro del entorno, mide el sondeo con 100 topics, lanza y para un launch file con la escalada de señales, comprueba recuperación de PIDs tras matar el backend, mide Lichtblick (tamaño y licencia) y prueba las dos vías de instalación (pixi y venv apt) | Números medidos y anotados en `docs/`; decisión go/no-go sobre el sondeo y sobre el empaquetado de Lichtblick | 1 semana |
| **1. Grafo** | `GraphSource` con `rclpy`, API de grafo y parámetros, WS de snapshot completo, UI de nodos/topics/servicios/acciones, detalle con frecuencia bajo demanda, `/api/env` y barra de estado | La lista coincide con `ros2 node list` y `ros2 topic list`; cambios en menos de 2 s; CPU < 5 % con 100 topics | 2 semanas |
| **2. Procesos** | Gestor, logs, perfiles, API/WS, UI de procesos y logs, token/Origin/CORS, registro de PIDs y parada ordenada | Parar no deja huérfanos; logs en vivo; reinicio de un proceso caído con su código de salida | 2–3 semanas |
| **3. Foxglove** | Runtime de plugins (incluidos y de usuario `iframe`/`stream`), plugin `foxglove`, empaquetado y servido de Lichtblick, healthcheck y panel embebido | Un topic de ejemplo (TF, imagen o scan) se ve sin configurar nada a mano | 2 semanas |
| **4. Workspace** (gruesa) | Detección de paquetes y launch files, `colcon build` con salida en vivo, grafo visual | Los launch files aparecen y se ejecutan con un clic | ~2 semanas |
| **5. Plugins + Gazebo** (gruesa) | Plugin de Gazebo headless, tipo `stream`/VNC y pulido del ciclo de plugins | La simulación arranca y se visualiza desde la UI | 2–3 semanas |

Total MVP (0–3): 7–9 semanas a tiempo parcial, con margen. La etapa 0 recalibra.

## 7. Testing

- **Unitarios:** gestor de procesos con procesos simulados (señales, huérfanos, códigos de salida), máquina de estados, buffer de logs, diff del grafo con un `GraphSource` falso, validación de manifiestos, API con `httpx`/`TestClient`, WebSocket con el cliente de Starlette.
- **Integración:** contenedor con ROS 2 Jazzy y Humble, `demo_nodes_cpp` y `turtlesim`; tests marcados y ejecutados en CI.
- **E2E:** Playwright contra el backend en Docker con `turtlesim`: ver grafo, lanzar talker, ver logs, parar, abrir el panel.
- **Rendimiento:** script que crea 100 topics y mide CPU del backend; primero como medición, luego como umbral.
- **Calidad:** `ruff` + `mypy` en backend, `eslint` + `tsc` en frontend.

## 8. Riesgos actualizados

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El sondeo del grafo no cabe en el 5 % de CPU | Medio | Medirlo en la etapa 0; consultas perezosas y caché; ajustar intervalo |
| `rclpy` desde un hilo con uvicorn: condiciones de carrera | Alto | Un solo dueño del nodo, cola de comandos, tests de concurrencia |
| Huérfanos si el backend muere de golpe | Alto | `start_new_session`, escalada de señales, registro de PIDs y adopción al arrancar |
| Lichtblick pesa demasiado o cambia de licencia | Medio | Medir en la etapa 0; descarga fijada con checksum o paquete aparte; URL en el manifiesto |
| Resolvedor pixi/conda con dependencias PyPI | Medio | Validar en la etapa 0; FastAPI y uvicorn desde conda-forge; documentar `--no-deps` |
| Gazebo en macOS/RoboStack es limitado | Bajo en v1 | Etapa 5; prioridad al modo headless y a Foxglove |
| Plugins de terceros son código de confianza | Medio | Permisos visibles y documentados; sandbox en v2 |

El riesgo de desajuste DDS entre app y nodos desaparece: comparten entorno.

## 9. Lo que queda al constructor

Puerto por defecto (8000), intervalo de sondeo, tamaño del buffer de logs, tiempos de gracia, taxonomía de errores, formato exacto de los mensajes WS, dobles de test y estructura interna de módulos. Nada de eso cambia lo que se construye.

## 10. Decisiones mías para revisar

- Nombre `ros-studio` y licencia Apache-2.0.
- SQLite en vez de YAML para perfiles y estado.
- `dockview` en vez de `flexlayout-react`.
- Lichtblick como visor por defecto, versión fijada.
- Sin paneles `native` de terceros en la v1.
- Sin adaptador CLI en la v1; solo la interfaz `GraphSource`.
- Docker con navegador en la misma máquina y los puertos `8000` y `8765` en loopback.
- Perfiles en orden listado, sin dependencias entre procesos.
- macOS como entorno de desarrollo, no como objetivo de soporte oficial.
- El runtime de plugins de la etapa 3 ya admite plugins de usuario `iframe`/`stream`.
- La frecuencia de un topic se mide bajo demanda al abrir su detalle, no de forma continua.
