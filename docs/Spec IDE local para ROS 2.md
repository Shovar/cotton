# Spec: IDE local para ROS 2

Nov 6, 2026 · @toni

## 1. Resumen y objetivos

Una aplicación web local, con backend propio, que reúne en una sola pantalla el descubrimiento del grafo ROS 2, la gestión de procesos de launch y la visualización vía Foxglove, para dejar de depender de decenas de terminales.

**Problema.** Trabajar con ROS 2, Gazebo y RViz obliga a abrir muchas terminales, recordar comandos (`ros2 node list`, `ros2 launch`, `source install/setup.bash`) y alternar entre ventanas sin ver el estado global del sistema.

**Objetivos**

- Ver en una sola interfaz el workspace, los nodos, los topics, los servicios y los parámetros.
- Lanzar, parar y reiniciar procesos (launch files, nodos sueltos, Gazebo) con su estado y sus logs a la vista.
- Embeber la visualización (Foxglove/Lichtblick) y poder añadir paneles extra mediante plugins.
- Funcionar en local, sin cuenta ni servicios en la nube, y con paneles abribles en el navegador.

**Usuarios objetivo.** Desarrolladores y estudiantes de robótica que usan ROS 2 (Humble, Jazzy o posterior) en Linux, WSL o contenedores.

**No-objetivos (v1)**

- Sustituir a un IDE completo: la edición de código se deja a VS Code u otro editor.
- Soportar ROS 1.
- Gestionar flotas de robots o despliegues remotos multi-máquina.

* Integrar RViz en la UI: queda para una versión posterior, como plugin.

## 2. Alcance del MVP y fases

El MVP (fases 1 a 3) permite descubrir el grafo, gestionar un launch file y ver datos en Foxglove desde una sola pestaña del navegador.

| Fase | Entrega | Criterio de aceptación |
| --- | --- | --- |
| 1. Grafo | Backend que lista nodos, topics, servicios y parámetros; UI mínima | La lista coincide con `ros2 node list` y `ros2 topic list` y se actualiza en menos de 2 s al arrancar o parar un nodo |
| 2. Procesos | Lanzar, parar y reiniciar launch files; logs por proceso | Parar un proceso no deja hijos huérfanos; los logs se ven en vivo |
| 3. Visualización | `foxglove_bridge` gestionado y panel Foxglove embebido | Se ve un topic de ejemplo (TF, imagen o scan) sin configurar nada a mano |
| 4. Workspace | Árbol de paquetes colcon, lanzadores detectados, `colcon build` desde la UI | Los launch files del workspace aparecen y se pueden ejecutar con un clic |
| 5. Gazebo | Plugin de Gazebo headless con visor en navegador | La simulación arranca y se visualiza desde la UI |

**Fuera del MVP:** plugin de RViz (vía VNC), edición de código, depuración de nodos, grabación y reproducción de rosbag desde la UI (candidata a v1.1).

## 3. Requisitos funcionales

Cada requisito lleva un identificador (RF-n) para poder referenciarlo en issues y tests.

| ID | Requisito | Fase |
| --- | --- | --- |
| RF-1 | Listar nodos, topics, servicios y acciones activos, con tipo de mensaje y editores/suscriptores de cada topic | 1 |
| RF-2 | Mostrar y modificar parámetros de un nodo en ejecución | 1 |
| RF-3 | Seleccionar `ROS_DOMAIN_ID`, distribución ROS y workspace sourceado desde la UI | 1 |
| RF-4 | Lanzar `ros2 launch` y `ros2 run` con argumentos, y pararlos de forma ordenada (SIGINT, luego SIGTERM, luego SIGKILL) | 2 |
| RF-5 | Mostrar el estado de cada proceso (arrancando, activo, terminado, error) y su código de salida | 2 |
| RF-6 | Logs por proceso en vivo, con filtro por nivel y búsqueda; opción de guardarlos | 2 |
| RF-7 | Perfiles de lanzamiento guardados (conjunto de procesos + argumentos) que se arrancan con un clic | 2 |
| RF-8 | Arrancar y parar `foxglove_bridge` y abrir el panel embebido ya conectado | 3 |
| RF-9 | Detectar paquetes del workspace colcon y sus launch files; ejecutar `colcon build` con salida en vivo | 4 |
| RF-10 | Registrar, activar y desactivar plugins (ver sección 6) | 5 |
| RF-11 | Ver el grafo de nodos como diagrama (nodos y topics conectados) | 4 |

**Comportamiento ante fallos.** Si un proceso muere, la UI lo marca en rojo con su código de salida y ofrece reiniciar; si el backend pierde la conexión con ROS, lo indica y reintenta con espera creciente.

## 4. Requisitos no funcionales

| ID | Área | Requisito |
| --- | --- | --- |
| RNF-1 | Rendimiento | El backend consume menos de 5 % de CPU en reposo con 100 topics; la UI refleja cambios del grafo en menos de 2 s |
| RNF-2 | Seguridad | El backend escucha solo en `127.0.0.1` por defecto; ejecutar procesos exige un token de sesión generado al arrancar |
| RNF-3 | Portabilidad | Linux (Ubuntu 22.04 y 24.04) y WSL2; contenedor Docker con el mismo comportamiento |
| RNF-4 | Compatibilidad | ROS 2 Humble y Jazzy como mínimo; el backend no depende de una distro concreta |
| RNF-5 | Fiabilidad | Al cerrar el backend se terminan todos los procesos hijos; al reabrirlo se detectan los que sigan vivos |
| RNF-6 | Instalación | Un solo comando (`pip install` o binario) más los paquetes ROS necesarios; sin cuentas ni nube |
| RNF-7 | Extensibilidad | Añadir un plugin no requiere recompilar el núcleo |

**Nota de seguridad.** Lanzar procesos desde una web local es equivalente a ofrecer una shell: por eso el token, el bind a localhost y la validación de orígenes (CORS y `Origin` en WebSocket) son obligatorios desde la fase 2, no un extra.

## 5. Arquitectura

&#91;embedded content: arquitectura · navegador, backend local y ROS 2\]

El navegador solo habla con el backend por REST y WebSocket, salvo el panel de Foxglove, que se conecta directo a `foxglove_bridge`; el backend es el único que descubre el grafo y lanza procesos.

| Componente | Responsabilidad | Tecnología propuesta |
| --- | --- | --- |
| Frontend | Layout tipo VS Code, árbol, listas, logs, paneles de plugins | React con `dockview` o `flexlayout-react` |
| API | REST para consultas y acciones, WebSocket para eventos | Python con FastAPI (a decidir, ver sección 9) |
| Descubrimiento | Grafo ROS 2 y parámetros | `rclpy`, o la CLI `ros2` en el prototipo |
| Gestor de procesos | Lanzar, parar y registrar procesos con sus logs | `asyncio` con grupos de procesos (`setsid`) |
| Plugins | Leer manifiestos y gestionar su ciclo de vida | Ficheros `plugin.yaml` en una carpeta local |
| Visualización | Datos de ROS 2 en el navegador | `foxglove_bridge` más Foxglove o Lichtblick |
| Escritorio remoto | Gazebo con GUI en el navegador (opcional) | Xvfb, x11vnc y noVNC |

## 6. Sistema de plugins

Un plugin es una carpeta con un manifiesto que declara qué procesos gestiona el núcleo y qué panel web se muestra en la UI. El núcleo no conoce a Foxglove ni Gazebo: los trata como plugins, y RViz se podrá añadir después de la misma forma.

**Manifiesto (`plugin.yaml`)**

```yaml
name: foxglove
version: 0.1.0
description: Visualización con Foxglove/Lichtblick
processes:
  - id: bridge
    command: ros2 launch foxglove_bridge foxglove_bridge_launch.xml port:=8765
    autostart: false
    healthcheck: tcp://127.0.0.1:8765
panels:
  - id: viewer
    title: Foxglove
    url: http://127.0.0.1:8080/?ds=foxglove-websocket&ds.url=ws://127.0.0.1:8765
    requires: [bridge]
permissions:
  - spawn-process
  - network:localhost
```

**Ciclo de vida.** Un plugin pasa por: descubierto, instalado, activo y detenido. Al activarlo, el núcleo arranca sus procesos en orden de dependencia, espera a que pasen el healthcheck y sólo entonces habilita el panel.

**Tipos de panel**

- `iframe`: una URL local (Foxglove, un visor web de Gazebo).
- `stream`: sesión VNC/noVNC para aplicaciones de escritorio (Gazebo con GUI y, más adelante, RViz).
- `native`: un componente React que usa la API del núcleo (p. ej. el grafo de nodos).

**Plugins iniciales**

| Plugin | Procesos | Panel | Fase |
| --- | --- | --- | --- |
| `foxglove` | `foxglove_bridge` + servidor estático de Lichtblick | iframe | 3 |
| `gazebo` | `gz sim -s` (servidor headless) | iframe o stream | 5 |

**Seguridad de plugins.** En v1 los plugins son código de confianza instalado por el usuario; los permisos del manifiesto se muestran al activarlos pero no se aplican con sandbox (candidato a v2).

## 7. API y modelo de datos

La API tiene dos canales: REST para consultas y acciones puntuales, y un único WebSocket para eventos en tiempo real. Todas las peticiones llevan el token de sesión (`Authorization: Bearer`).

**REST**

| Método y ruta | Función |
| --- | --- |
| `GET /api/graph` | Nodos, topics, servicios y acciones actuales |
| `GET /api/nodes/{name}/params` | Parámetros de un nodo |
| `PUT /api/nodes/{name}/params/{param}` | Modificar un parámetro |
| `GET /api/processes` | Procesos gestionados y su estado |
| `POST /api/processes` | Lanzar un proceso (`command`, `args`, `env`, `cwd`) |
| `DELETE /api/processes/{id}` | Parar un proceso (parada ordenada) |
| `GET /api/workspace` | Paquetes y launch files detectados |
| `POST /api/workspace/build` | Ejecutar `colcon build` |
| `GET /api/plugins` | Plugins descubiertos y su estado |
| `POST /api/plugins/{id}/activate` | Activar o desactivar un plugin |
| `GET /api/profiles` y `PUT /api/profiles/{id}` | Perfiles de lanzamiento guardados |

**WebSocket (`/ws`)**

El cliente se suscribe a canales y recibe mensajes JSON con `type` y `data`.

- `graph.update`: cambios en nodos o topics.
- `process.state`: cambio de estado de un proceso.
- `process.log`: línea de log (`id`, `stream`, `ts`, `text`).
- `build.output`: salida de `colcon build`.
- `plugin.state`: cambio de estado de un plugin.

**Modelo de datos**

```json
{
  "process": {
    "id": "p_01",
    "command": "ros2 launch my_pkg sim.launch.py",
    "state": "running",
    "pid": 48211,
    "started_at": "2026-11-06T22:10:00Z",
    "exit_code": null,
    "plugin": null
  },
  "node": {
    "name": "/controller",
    "namespace": "/",
    "publishers": ["/cmd_vel"],
    "subscribers": ["/odom"],
    "services": ["/controller/get_parameters"]
  }
}
```

**Persistencia.** La configuración (perfiles, plugins activos, último workspace) se guarda en un fichero SQLite o YAML en `~/.config/<nombre-app>/`; los logs se guardan en ficheros rotados por proceso.

## 8. UX y diseño de interfaz

El layout imita a VS Code: barra lateral con vistas, área central con pestañas y panel inferior para logs. Los paneles se pueden arrastrar, dividir y guardar como disposición (layout).

| Zona | Contenido |
| --- | --- |
| Barra de actividad (izquierda, iconos) | Workspace, Grafo ROS, Procesos, Plugins, Ajustes |
| Barra lateral | Árbol del workspace (paquetes, launch files, URDF); lista de nodos y topics con búsqueda; lista de procesos con estado |
| Área central (pestañas) | Panel Foxglove, visor de Gazebo, grafo de nodos, detalle de un topic |
| Panel inferior | Logs por proceso (una pestaña por proceso), salida de `colcon build`, terminal opcional |
| Barra de estado | Distribución ROS, `ROS_DOMAIN_ID`, workspace activo, número de procesos en ejecución y errores |

**Flujos principales**

1. **Arrancar una simulación:** elegir un perfil guardado, pulsar Iniciar; la UI lanza Gazebo, los nodos y el puente de Foxglove, y abre el panel cuando todo está sano.
2. **Inspeccionar un topic:** buscar el topic en la barra lateral, abrir su detalle (tipo, frecuencia, editores y suscriptores) y arrastrarlo al panel de Foxglove.
3. **Reiniciar un nodo que falla:** el proceso aparece en rojo, se abre su log con el último error y un botón de reinicio.
4. **Compilar y relanzar:** `colcon build` desde la UI, y al terminar con éxito, ofrecer reiniciar los procesos afectados.

**Principios de diseño**

- El estado del sistema siempre visible: nada de procesos que corren sin aparecer en la lista.
- Cada acción destructiva (parar, matar) se confirma; las repetitivas no.
- Atajos de teclado y paleta de comandos (`Ctrl+Shift+P`) para las acciones principales.
- Tema claro y oscuro, y una disposición por defecto que funcione con pantalla de portátil.

## 9. Riesgos y decisiones abiertas

Los mayores riesgos técnicos están en el descubrimiento DDS y en la gestión de procesos; conviene validarlos con un prototipo en la fase 1 y 2 antes de construir el resto.

**Riesgos**

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El descubrimiento DDS falla entre el backend y los nodos (distinto `ROS_DOMAIN_ID`, Docker, WSL, multicast bloqueado) | Alto | Fijar dominio y RMW desde la UI; documentar el modo `--network host` en Docker; probar con Fast DDS y Cyclone DDS |
| Procesos huérfanos al parar o al caer el backend | Alto | Cada proceso en su propio grupo (`setsid`); parada escalonada SIGINT, SIGTERM y SIGKILL; registro de PIDs al arrancar |
| El entorno sourceado de ROS no se hereda bien en los procesos hijos | Medio | Lanzar mediante un shell que haga `source` explícito del workspace elegido |
| Gazebo con GUI en navegador es pesado o inestable (GPU, X11, VNC) | Medio | Priorizar modo headless más visor en Foxglove; VNC solo como plugin opcional |
| Lanzar procesos desde una web local abre una vía de ejecución remota si se expone | Alto | Bind a localhost, token de sesión, validación de `Origin`; aviso claro si el usuario cambia el bind |
| Cambios en Foxglove/Lichtblick (licencia, versiones, formato de URL) | Medio | Fijar la versión de Lichtblick que se aloja localmente y abstraer la URL en el manifiesto |

**Decisiones abiertas**

- [ ] Lenguaje del backend: Python con FastAPI y `rclpy` (más rápido de prototipar) o Go (binario único, mejor para procesos) usando CLI/rosbridge.
- [ ] Descubrimiento del grafo: `rclpy` directo o llamadas a la CLI `ros2`; la CLI es más simple pero más lenta.
- [ ] Empaquetado: paquete pip, binario único o imagen Docker como vía principal.
- [ ] Nombre del proyecto y licencia (MIT o Apache-2.0 para facilitar plugins de terceros).
- [ ] Foxglove oficial o Lichtblick como visor por defecto.

## 10. Plan de trabajo, testing y repositorio

**Plan orientativo (trabajo a tiempo parcial)**

| Etapa | Contenido | Duración estimada |
| --- | --- | --- |
| 0. Prototipo de riesgo | Descubrir el grafo con `rclpy` y lanzar/parar un launch file sin huérfanos, desde un script | 1 semana |
| 1. Grafo | Backend + UI mínima con nodos y topics | 2 semanas |
| 2. Procesos | Gestor de procesos, logs en vivo, perfiles | 2 a 3 semanas |
| 3. Foxglove | `foxglove_bridge` gestionado y panel embebido | 1 a 2 semanas |
| 4. Workspace | Árbol colcon, build desde la UI, grafo visual | 2 semanas |
| 5. Plugins | Sistema de plugins y plugin de Gazebo | 2 a 3 semanas |

Son estimaciones sin validar; la etapa 0 sirve precisamente para recalibrarlas.

**Testing**

- Unitarios del gestor de procesos (señales, huérfanos, códigos de salida) con procesos simulados.
- Integración con un nodo de prueba (`demo_nodes_cpp`, `turtlesim`) en un contenedor con ROS 2, ejecutado en CI.
- Tests de la API con un cliente HTTP/WebSocket contra un backend con grafo simulado.
- Pruebas de interfaz (Playwright) para los flujos principales de la sección 8.

**Estructura del repositorio (propuesta)**

```text
ros-studio/
  backend/        # API, gestor de procesos, descubrimiento ROS
  frontend/       # app web (React, layout de paneles)
  plugins/
    foxglove/
    gazebo/
  docker/         # imagen de desarrollo con ROS 2
  docs/           # esta spec, guía de plugins
  .github/workflows/
```

**Definición de hecho.** Una fase se da por cerrada cuando cumple su criterio de aceptación (sección 2), tiene tests en CI y está documentada en `docs/`.
