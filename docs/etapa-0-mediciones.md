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

Acción: se mantiene el sondeo de 1 s con la caché y las consultas perezosas de
endpoints que ya prevé el diseño (solo topics cambiados). RNF-1 se re-medirá en
Linux, que es la plataforma de soporte; en macOS el objetivo se cumple con
Cyclone DDS y se incumple por poco con Fast DDS.

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

