# Etapa 0 — Mediciones

Números medidos a mano en un entorno ROS 2 real. Los scripts viven en `spikes/` y
son desechables: no hay suite automática ni se publican como paquete.

## Entorno de medida

| Campo | Valor |
| --- | --- |
| Máquina | Apple M4, 10 núcleos, 24 GB, arm64 |
| SO | macOS 26.6.2 (build 25G83) |
| ROS 2 | Jazzy, RoboStack (`/Users/toni/robostack/.pixi/envs/jazzy`) |
| Python | 3.12.13 (conda-forge) |
| `rclpy` | 7.1.9 |
| RMW por defecto | `rmw_fastrtps_cpp` 8.4.3 |
| RMW alternativo | `rmw_cyclonedds_cpp` 2.2.3 |
| Fecha de medida | 2026-11-09 |

Comando base (el worktree cambia según la máquina):

```bash
cd /Users/toni/robostack && pixi run -e jazzy -- bash -lc \
  'cd <worktree> && /Users/toni/robostack/.pixi/envs/jazzy/bin/python3.12 spikes/graph_probe.py --topics 100'
```

## S1 — Sondeo del grafo

`spikes/graph_probe.py` crea 100 publishers `std_msgs/msg/String` en
`probe/topic_000…099` y, cada segundo durante 20 s, ejecuta el mismo trabajo que
hará `RclpyGraphSource.snapshot()`: nombres y namespaces de nodos, nombres y
tipos de topics y editores/suscriptores de cada topic. `cpu_percent` es el
consumo del proceso completo (incluye los hilos de DDS); `snapshot_cpu_percent`
es solo el coste de las consultas del sondeo.

| # | RMW | Topics vistos | Muestras | p50 (ms) | p95 (ms) | max (ms) | CPU proceso | CPU sondeo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `rmw_fastrtps_cpp` | 102 | 21 | 8.738 | 11.406 | 12.041 | 7.16 % | — |
| 2 | `rmw_fastrtps_cpp` | 102 | 22 | 2.008 | 2.293 | 6.185 | 6.14 % | 0.26 % |
| 3 | `rmw_cyclonedds_cpp` | 102 | 21 | 7.699 | 10.468 | 10.938 | 1.11 % | 0.67 % |

Notas:

- `topics_seen: 102` = los 100 topics del probe más `/rosout` y
  `/parameter_events`.
- La fila 1 se midió con la primera versión del script, que aún no separaba el
  CPU del sondeo. Las filas 2 y 3 usan la versión final. Los resultados de
  latencia varían entre ejecuciones (p50 2–9 ms) sin acercarse al umbral.
- La ejecución con Fast DDS imprime avisos de afinidad de hilos
  (`Protocol family not supported`) en macOS. No afectan al resultado.
- Cyclone DDS está instalado en el entorno RoboStack; no hubo incidencia.

### Decisión go/no-go (T018)

**GO al sondeo cada 1 s.** El criterio era `cpu_percent < 5` y
`poll_ms_p95 < 200`:

- **Latencia: cumple.** p95 entre 2.3 ms y 11.8 ms en todas las ejecuciones,
  muy por debajo de 200 ms.
- **CPU del sondeo: cumple.** Las consultas cuestan 0.26–0.67 % de CPU.
- **CPU del proceso con Fast DDS: no cumple en macOS.** 6.1–7.2 %, por encima
  del 5 %. El exceso no viene del sondeo sino de los hilos de fondo de
  `rmw_fastrtps_cpp` (los paga cualquier proceso ROS, sondee o no). Con
  `rmw_cyclonedds_cpp` el proceso completo baja a 1.1 %.

Acción: se mantiene el sondeo de 1 s con la caché de endpoints por topic
implementada en `ros/graph.py`: editores y suscriptores se vuelven a consultar
solo cuando cambian los tipos del topic. Límite conocido: un publisher nuevo en
un topic cuyos tipos no cambian no aparece hasta el siguiente cambio de tipos.
El grafo se emite como snapshot completo; los deltas quedan para la etapa 4.
RNF-1 se re-medirá en
Linux, que es la plataforma de soporte; en macOS el objetivo se cumple con
Cyclone DDS y se incumple por poco con Fast DDS.

### Re-medición final (T212)

Repetición del sondeo contra la versión final, el 2026-11-11 dentro del
contenedor Linux oficial (`ros:jazzy-ros-base`, aarch64, Python 3.12,
`rmw_fastrtps_cpp` por defecto), con `--topics 100 --duration 20`:

| RMW | Topics vistos | Muestras | p50 (ms) | p95 (ms) | max (ms) | CPU proceso | CPU sondeo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rmw_fastrtps_cpp` | 102 | 22 | 5.725 | 6.495 | 6.569 | 1.21 % | 0.63 % |

Sigue por debajo de los umbrales del gate (`poll_ms_p95 < 200 ms` y
`cpu_percent < 5 %`). En Linux la CPU del proceso completo también cumple.

## S2 — Señales y huérfanos

`spikes/signals_probe.py` usa solo la biblioteca estándar. Los tres escenarios
lanzan el hijo con `start_new_session=True`, de modo que el hijo es líder de su
propio grupo, y un nieto real (`sleep 60`) que hereda el grupo.

Comando:

```bash
/Users/toni/robostack/.pixi/envs/jazzy/bin/python3.12 spikes/signals_probe.py
```

| Escenario | Señal que vació el grupo | Tiempo hasta grupo vacío | Huérfanos tras `SIGINT` | Huérfanos tras `SIGTERM` | Grupo vacío |
| --- | --- | --- | --- | --- | --- |
| 1. Hijo cooperativo | `SIGINT` | 0.025 s | 0 | — | sí |
| 2. Padre muerto con `SIGKILL` | `SIGTERM` (desde un proceso nuevo) | < 1 s | — | — | sí |
| 3. Hijo y nieto ignoran `SIGINT`/`SIGTERM` | `SIGKILL` | 8.036 s | 2 | 2 | sí |

Resultados:

- **`SIGINT` al grupo basta para procesos cooperativos.** El nieto `sleep`
  murió con el grupo en 25 ms; no quedó nadie (`orphans_after_sigint: 0`).
- **El huérfano es detectable y se puede parar.** Tras `kill -9` del padre, el
  nieto sigue vivo y el grupo también: `pgid` sobrevive mientras quede un
  miembro. Un proceso nuevo lo comprobó con `os.killpg(pgid, 0)` y lo paró con
  `killpg`, así que el registro de PIDs debe guardar el `pgid`, no solo el PID
  del padre.
- **El escalado termina en `SIGKILL`.** El escenario 3 ignoró `SIGINT` y
  `SIGTERM`; se agotaron los 5 s y los 3 s de gracia y solo `SIGKILL` vació el
  grupo (`orphans_after_sigint: 2`, `orphans_after_sigterm: 2`,
  `orphans_after_sigkill: 0`).

### Decisión sobre los tiempos de gracia (T025)

**5 s para `SIGINT` y 3 s para `SIGTERM` son suficientes.** Un proceso
cooperativo muere en milisegundos y uno que ignora ambas señales termina en
`SIGKILL` como muy tarde a los 8 s. No hay margen adicional después del
`SIGKILL`, pero `SIGKILL` no se puede ignorar.

Límite conocido: un proceso que haga `setsid()` por su cuenta escapa del grupo
y no se puede parar con `killpg`; la v1 no lo contempla. Los procesos lanzados
por ROS suelen respetar el grupo, así que el riesgo es bajo.

## S3 — Lichtblick y assets

Versión fijada: **v1.30.0** (tag `v1.30.0`, publicado el 2026-10-22, commit
`fcfc7d559d8e76db36c9730e78049a60f976c2d2`). Licencia **MPL-2.0**
(`package.json` y cabecera de `LICENSE`: BMW AG 2024 y Foxglove Technologies
2021–2024).

### Incidencia con `npm ci` (T027)

El repositorio **no tiene `package-lock.json`**: usa Yarn 4.17.0 vía corepack
(`packageManager: yarn@4.17.0`, `yarnPath: .yarn/yarn-wrapper.js`). Por eso
`npm ci` falla con `EUSAGE` («can only install with an existing
package-lock.json»). Node 26 ya no incluye corepack, así que se instaló con
`npm install -g corepack@latest` (0.36.0) y se usó el gestor oficial:

```bash
yarn install --immutable
# Done with warnings in 22s 15ms, exit 0, 1276 paquetes en node_modules
```

### Build (T028)

`package.json` tampoco tiene un script `build`; el CI oficial ejecuta
`build:packages` y `web:build:prod`, y eso es lo que se usó:

```bash
yarn build:packages && yarn web:build:prod
# webpack 5.108.3 compiled with 2 warnings in 19069 ms, exit 0
```

El resultado queda en `web/.webpack/` (`index.html` + bundles con hash).

| Medida | Valor |
| --- | --- |
| `du -sh web/.webpack` | 172 MB |
| Build sin ficheros `.map` | 41.5 MiB (129.9 MiB son source maps) |
| `lichtblick-web.tar.gz` oficial (release v1.30.0) | 40 636 655 B (38.75 MiB) |
| Build oficial extraído | 172 MB |
| Licencia | MPL-2.0 |
| Login o nube | no; el visor funciona en local sin cuenta |

### Servido y conexión con el puente (T030)

Se sirvió el build con `python3 -m http.server 8080 --bind 127.0.0.1
--directory web/.webpack` y `foxglove_bridge` 3.6.0 (RoboStack, entorno pixi
temporal) con `--port 8765`. La URL exacta que conecta es:

```text
http://127.0.0.1:8080/?ds=foxglove-websocket&ds.url=ws://127.0.0.1:8765
```

Evidencia: captura headless de Microsoft Edge con el visor cargado, la cabecera
mostrando `ws://127.0.0.1:8765` y el log del puente registrando el cliente y su
suscripción al grafo. El host **no puede ser relativo**: `ds.url` exige una URL
`ws://` absoluta, así que la app debe componerla con el host del navegador.

Incidencia: Edge headless no crea contexto WebGL y los paneles 3D muestran
«Error creating WebGL context». El resto del visor y la conexión WebSocket
funcionan; la comprobación visual de un topic 3D queda para un navegador con
GPU y pertenece al criterio de la etapa 3.

### Formato de layout por URL (T031)

**`?layout=...` no existe en v1.30.0.** El código solo interpreta:

- `?layoutUrl=<URL http(s)>`: descarga un JSON de layout, lo instala como layout
  local y lo selecciona. Verificado: el fichero se pidió al servidor y el visor
  aplicó el layout vacío.
- `?defaultLayout=<nombre>`: selecciona un layout ya instalado por su nombre.

Formato mínimo del JSON (validado por `validateLayoutData`):

```json
{
  "configById": {},
  "globalVariables": {},
  "playbackConfig": { "speed": 1 }
}
```

`userNodes` es opcional. El diseño debe sustituir `?layout=...` por
`layoutUrl` (layout empaquetado y servido por el backend) o por
`defaultLayout` (layout incluido en el visor).

### Decisión de empaquetado (T032)

**Descargar, no vendorizar.** El build oficial pesa 38.75 MiB comprimido
(172 MB extraído, 41.5 MiB sin source maps). Vendorizarlo obligaría a meter
decenas de MiB en el wheel o a compilar Lichtblick en cada CI, y a mantener
avisos y disponibilidad de fuentes MPL-2.0. La descarga fijada evita ambas
cosas y el manifiesto ya abstrae la URL.

| Campo | Valor |
| --- | --- |
| URL | `https://github.com/lichtblick-suite/lichtblick/releases/download/v1.30.0/lichtblick-web.tar.gz` |
| Versión | `v1.30.0` |
| SHA-256 | `f73b6bd0b4d2857b7311eb780279494334690e203de43440b54bc75994fd16c6` |
| Tamaño | 40 636 655 B |
| Verificación | `shasum -a 256 lichtblick-web-1.30.0.tar.gz` |

Al primer arranque: descargar a la caché local, comprobar el SHA-256, extraer y
servir desde el backend. Para instalaciones sin red se documentará cómo
pre-sembrar la caché copiando el `.tar.gz` ya verificado.

## S4 — Validación de instalaciones

### pixi / RoboStack (T033)

Entorno pixi temporal con `python 3.12`, `pip`, `fastapi`, `uvicorn` desde
conda-forge y `ros-jazzy-rclpy` desde RoboStack. Wheel construido en el worktree
(`cotton-0.1.0-py3-none-any.whl`, 17 442 B) e instalado dentro del entorno:

```bash
pixi install
pip install dist/cotton-0.1.0-py3-none-any.whl
python -c "import rclpy, fastapi, uvicorn, cotton; ..."
cotton --help
```

Resultado: instalación correcta. Pip solo trajo `platformdirs` de PyPI; el resto
de dependencias (FastAPI 0.162.2, uvicorn 0.54.0, Pydantic) ya venían de
conda-forge y no hubo conflicto de resolvedor. `import rclpy` funciona desde el
entorno (rclpy de RoboStack) y `cotton --help` imprime el uso. No hizo falta
la variante `--no-deps`.

### Ubuntu con venv `--system-site-packages` (T034)

**No validado en esta sesión.** La máquina es macOS 26.6.2 arm64 y no hay un
host Ubuntu 24.04 con ROS 2 instalado por apt. Queda pendiente ejecutar:

```bash
python3 -m venv --system-site-packages /tmp/rs
/tmp/rs/bin/pip install dist/cotton-0.1.0-py3-none-any.whl
/tmp/rs/bin/python -c "import rclpy"
```

La incidencia es de plataforma, no del paquete: el wheel es `py3-none-any` y la
validación pixi ya demuestra que `rclpy` del entorno se ve sin declararlo.

## Gate de cierre

- Sondeo con p50/p95/max y CPU: sí (S1, tres filas).
- 5 s + 3 s de gracia: suficientes (S2, escenario 3 usa 8 s y solo `SIGKILL`
  vacía el grupo).
- Vendorizar o descargar Lichtblick: descargar, con URL, versión y SHA-256 (S3).
- Instalaciones: pixi/RoboStack validada; Ubuntu bloqueada y anotada (S4).


